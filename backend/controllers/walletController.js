import axios from "axios";
import { Secrets } from "../config/secrets.js";
import { supabase as supabaseDefault, supabaseAnonClient, supabaseServiceClient, requireServiceClient } from "../config/supabase.js";
import pkg from "@solana/web3.js";
const { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = pkg;
import { logAuditEvent, AUDIT_ACTIONS } from "../services/auditService.js";
import { getAppLedgerBalance } from "../services/reconciliationService.js";
import { syncWalletBalances } from "../services/balanceSyncService.js";
import {
  getCanonicalWallet,
  getCanonicalWalletByWalletId,
  getAllCanonicalWallets,
  createPrivyWalletForUser,
  syncPrivyWallet,
} from "../services/walletService.js";
import splTokenPkg from "@solana/spl-token";
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  transferChecked,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = splTokenPkg;
import { getRpcConnection } from "../services/solanaRpcClient.js";
const PRIVY_APP_ID = Secrets.PRIVY_APP_ID;
const PRIVY_APP_SECRET = Secrets.PRIVY_APP_SECRET;
const PRIVY_BASE = "https://api.privy.io";

const inMemoryWallets = new Map();

const isPrivyEnabled = Boolean(PRIVY_APP_ID && PRIVY_APP_SECRET);

// Solana constants
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

// Privy uses Basic Auth: base64(appId:appSecret)
function privyHeaders() {
  const encoded = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString(
    "base64"
  );
  return {
    Authorization: `Basic ${encoded}`,
    "privy-app-id": PRIVY_APP_ID,
    "Content-Type": "application/json",
  };
}

async function getWalletByUserId(userId) {
  return getCanonicalWallet(userId, "solana");
}

// POST /wallet/create — create a server-side wallet via Privy
export const createEmbeddedWallet = async (req, res) => {
  const userId = req.user?.id || req.body.userId;
  const email = req.user?.email || req.body.email;
  const chainType = req.body.chainType || "solana";
  if (!userId || !email) {
    return res.status(400).json({ ok: false, error: "Missing userId or email" });
  }

  if (chainType !== "solana") {
    return res.status(400).json({ ok: false, error: "Only Solana wallets are supported" });
  }

  try {
    const existing = await getWalletByUserId(userId);
    if (existing) {
      return res.json({ ok: true, data: existing });
    }

    const wallet = await createPrivyWalletForUser(userId, chainType);
    if (!wallet) {
      return res.status(500).json({ ok: false, error: 'Failed to create wallet' });
    }

    return res.json({ ok: true, data: wallet });
  } catch (err) {
    console.error("wallet creation error", err?.message || err);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err?.message });
  }
};

// POST /wallet/send — sign and broadcast a transaction via Privy
async function resolvePrivyWalletId(walletId) {
  const readClient = supabaseAnonClient || supabaseServiceClient;
  if (!readClient) {
    console.error('Supabase client not available for resolvePrivyWalletId');
    return null;
  }
  const { data, error } = await readClient
    .from('wallets')
    .select('provider_wallet_id')
    .or(`id.eq.${walletId},provider_wallet_id.eq.${walletId}`)
    .limit(1);

  if (error) {
    console.error('resolvePrivyWalletId error', error.message || error);
    return null;
  }
  return data?.[0]?.provider_wallet_id || null;
}

export const sendTxToAddress = async (req, res) => {
  const { walletId, toAddress, tokenAddress, amount, chain } = req.body;

  if (!walletId || !toAddress || !amount) {
    return res
      .status(400)
      .json({ ok: false, error: "walletId, toAddress, and amount are required" });
  }

  if (chain !== "solana") {
    return res
      .status(400)
      .json({ ok: false, error: "Only Solana transactions are supported" });
  }

  try {
    const providerWalletId = await resolvePrivyWalletId(walletId);
    if (!providerWalletId) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid wallet identifier for transaction" });
    }

    // Connect to Solana through centralized RPC client
    const connection = getRpcConnection();

    // Get wallet details from Privy
    const walletResponse = await axios.get(
      `${PRIVY_BASE}/v1/wallets/${providerWalletId}`,
      { headers: privyHeaders() }
    );
    const walletData = walletResponse.data;

    if (!walletData.address) {
      return res.status(400).json({ ok: false, error: "Wallet address not found" });
    }

    const senderPublicKey = new PublicKey(walletData.address);
    const recipientPublicKey = new PublicKey(toAddress);

    let transaction = new Transaction();
    let signers = [];

    if (tokenAddress) {
      // Handle SPL token transfer (USDC)
      const mint = tokenAddress === "USDC" ? USDC_MINT : new PublicKey(tokenAddress);

      // Validate USDC mint
      if (tokenAddress === "USDC" && !mint.equals(USDC_MINT)) {
        return res.status(400).json({ ok: false, error: "Invalid USDC mint address" });
      }

      // Get sender's ATA
      const senderATA = await getAssociatedTokenAddress(
        mint,
        senderPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Get recipient's ATA
      const recipientATA = await getAssociatedTokenAddress(
        mint,
        recipientPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if recipient ATA exists, create if not
      try {
        await getAccount(connection, recipientATA);
      } catch (error) {
        // ATA doesn't exist, add instruction to create it
        transaction.add(
          createAssociatedTokenAccountInstruction(
            senderPublicKey, // payer
            recipientATA, // ata
            recipientPublicKey, // owner
            mint, // mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Convert amount to smallest unit
      const decimals = tokenAddress === "USDC" ? USDC_DECIMALS : 6; // Default to 6 for most tokens
      const transferAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

      // Add transfer instruction
      transaction.add(
        transferChecked(
          TOKEN_PROGRAM_ID,
          senderATA, // source
          mint, // mint
          recipientATA, // destination
          senderPublicKey, // owner
          [], // multiSigners
          transferAmount, // amount
          decimals // decimals
        )
      );
    } else {
      // Handle native SOL transfer
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderPublicKey,
          toPubkey: recipientPublicKey,
          lamports,
        })
      );
    }

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPublicKey;

    // Serialize transaction for Privy
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Send to Privy for signing and broadcasting
    const caip2 = chainToCaip2(chain);
    const txBody = {
      chain_type: "solana",
      method: "solana_signAndSendTransaction",
      caip2,
      params: {
        transaction: serializedTx.toString("base64"),
      },
    };

    const r = await axios.post(
      `${PRIVY_BASE}/v1/wallets/${providerWalletId}/rpc`,
      txBody,
      { headers: privyHeaders() }
    );

    return res.json({ ok: true, tx: r.data });
  } catch (err) {
    console.error("privy send tx error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// GET /wallet/deposit-address — retrieve permanent Solana deposit address and summary balances
export const getDepositAddress = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const wallet = await getWalletByUserId(userId);
    if (!wallet) {
      return res.status(404).json({ ok: false, error: 'Wallet not found' });
    }

    const balanceResult = await syncWalletBalances(wallet);

    return res.json({
      ok: true,
      data: {
        address: wallet.address,
        chain: wallet.chain,
        is_primary: wallet.is_primary,
        last_synced_at: balanceResult.last_synced_at || wallet.last_synced_at || wallet.last_scanned_at || wallet.last_accessed_at,
        balances: {
          SOL: balanceResult.asset_balances.SOL.app,
          USDC: balanceResult.asset_balances.USDC.app,
          onchain_SOL: balanceResult.asset_balances.SOL.blockchain,
          ledger_SOL: balanceResult.asset_balances.SOL.app,
        },
        sync_status: {
          sol: balanceResult.asset_balances.SOL.status,
          usdc: balanceResult.asset_balances.USDC.status,
        },
      },
    });
  } catch (err) {
    console.error('getDepositAddress error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to fetch deposit address' });
  }
};

// GET /wallet/balances — compare on-chain and app balances for the primary wallet
export const getWalletBalances = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const wallet = await getWalletByUserId(userId);
    if (!wallet) {
      return res.status(404).json({ ok: false, error: 'Wallet not found' });
    }

    const balanceResult = await syncWalletBalances(wallet);
    try {
      const svc = requireServiceClient('getWalletBalances update last_synced_at');
      await svc
        .from('wallets')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', wallet.id);
    } catch (e) {
      console.warn('Unable to update wallet last_synced_at in Supabase:', e.message || e);
    }

    return res.json({ ok: true, data: { ...balanceResult, last_synced_at: new Date().toISOString() } });
  } catch (err) {
    console.error('getWalletBalances error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to fetch wallet balances' });
  }
};

// GET /wallet/:walletId — get wallet details
export const getWallet = async (req, res) => {
  const { walletId } = req.params;
  try {
    const providerWalletId = await resolvePrivyWalletId(walletId);
    const walletIdentifier = providerWalletId || walletId;

    const r = await axios.get(`${PRIVY_BASE}/v1/wallets/${walletIdentifier}`, {
      headers: privyHeaders(),
    });
    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error("privy get wallet error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// Map chain name to CAIP-2 identifier
function chainToCaip2(chain) {
  const map = {
    ethereum: "eip155:1",
    celo: "eip155:42220",
    base: "eip155:8453",
    polygon: "eip155:137",
    arbitrum: "eip155:42161",
    optimism: "eip155:10",
    solana: "solana:mainnet",
  };
  return map[chain] || "solana:mainnet";
}

// Minimal ABI encoding for ERC-20 transfer(address,uint256)
function encodeErc20Transfer(to, amount) {
  const selector = "0xa9059cbb";
  const addr = to.toLowerCase().replace("0x", "").padStart(64, "0");
  const val = BigInt(Math.floor(amount * 1e18))
    .toString(16)
    .padStart(64, "0");
  return selector + addr + val;
}
