import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getBalance, getRpcConnection } from './solanaRpcClient.js';
import { SystemGasWallet } from '../models/index.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const DEFAULT_GAS_THRESHOLD = Number(process.env.SOLANA_GAS_THRESHOLD || '0.01');
const REFILL_AMOUNT_SOL = Number(process.env.SOLANA_GAS_REFILL_AMOUNT_SOL || '0.05');
const AUTO_REFILL_ENABLED = process.env.SOLANA_GAS_AUTO_REFILL === 'true';
const GAS_WALLET_ADDRESS = process.env.SYSTEM_GAS_WALLET_ADDRESS;
const GAS_WALLET_ENCRYPTED_KEY = process.env.SYSTEM_GAS_WALLET_ENCRYPTED_KEY;
const TREASURY_PRIVATE_KEY = process.env.SOLANA_GAS_TREASURY_PRIVATE_KEY;
const TREASURY_ADDRESS = process.env.SOLANA_GAS_TREASURY_ADDRESS;

function parseSecretKey(secret) {
  if (!secret) return null;
  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Uint8Array.from(parsed);
  }
  try {
    return Buffer.from(trimmed, 'base64');
  } catch (error) {
    throw new Error('Unable to parse SOLANA_GAS_TREASURY_PRIVATE_KEY. Expected JSON array or base64 string.');
  }
}

export async function getSystemGasWallet(createIfMissing = true) {
  let wallet = await SystemGasWallet.findOne({ where: { purpose: 'system_gas' } });
  if (!wallet && createIfMissing && GAS_WALLET_ADDRESS) {
    wallet = await SystemGasWallet.create({
      purpose: 'system_gas',
      address: GAS_WALLET_ADDRESS,
      encrypted_private_key: GAS_WALLET_ENCRYPTED_KEY || null,
      external_signer: !Boolean(GAS_WALLET_ENCRYPTED_KEY),
      current_balance: 0,
    });
    await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_CREATED, {
      wallet_id: wallet.id,
      metadata: {
        address: GAS_WALLET_ADDRESS,
        external_signer: wallet.external_signer,
      },
      severity: 'info',
    });
  }
  if (!wallet) {
    throw new Error('System gas wallet is not configured. Set SYSTEM_GAS_WALLET_ADDRESS or create a system gas wallet record.');
  }
  return wallet;
}

export async function getGasWalletBalance(updateCache = true) {
  const wallet = await getSystemGasWallet();
  const lamports = await getBalance(wallet.address, 'confirmed');
  const balance = Number(lamports) / 1e9;
  if (updateCache) {
    await wallet.update({ current_balance: balance });
  }
  await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_BALANCE_CHECK, {
    wallet_id: wallet.id,
    amount: balance,
    asset: 'SOL',
    metadata: {
      address: wallet.address,
      onchain_balance: balance,
      cached_balance: Number(wallet.current_balance || 0),
    },
    severity: 'info',
  });
  return balance;
}

export async function estimateTransactionFee() {
  const wallet = await getSystemGasWallet();
  const connection = getRpcConnection();
  const publicKey = new PublicKey(wallet.address);
  const blockhashResponse = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: publicKey,
    recentBlockhash: blockhashResponse.blockhash,
  });
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: publicKey,
      lamports: 1,
    })
  );
  try {
    const feeResponse = await connection.getFeeForMessage(transaction.compileMessage());
    const lamports = Number(feeResponse?.value ?? 0);
    const feeSol = lamports / 1e9;
    await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_FEE_ESTIMATE, {
      wallet_id: wallet.id,
      amount: feeSol,
      asset: 'SOL',
      metadata: {
        method: 'getFeeForMessage',
        lamports,
      },
      severity: 'info',
    });
    return feeSol;
  } catch (error) {
    console.warn('Failed to estimate transaction fee:', error?.message || error);
    await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_FEE_ESTIMATE, {
      wallet_id: wallet.id,
      amount: null,
      asset: 'SOL',
      metadata: {
        error: error?.message,
      },
      severity: 'warning',
    });
    return Number(process.env.SOLANA_GAS_FALLBACK_FEE_SOL || '0.000005');
  }
}

export async function refillGasWalletIfLow() {
  const wallet = await getSystemGasWallet();
  const balance = await getGasWalletBalance(false);
  if (balance >= DEFAULT_GAS_THRESHOLD) {
    return { refilled: false, reason: 'Gas wallet already above threshold', balance };
  }
  if (!TREASURY_PRIVATE_KEY) {
    await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_ALERT, {
      wallet_id: wallet.id,
      amount: balance,
      asset: 'SOL',
      metadata: {
        action: 'refill_needed',
        threshold: DEFAULT_GAS_THRESHOLD,
        auto_refill_enabled: AUTO_REFILL_ENABLED,
      },
      severity: 'critical',
    });
    return { refilled: false, reason: 'Treasury private key not configured', balance };
  }

  if (!TREASURY_ADDRESS) {
    return { refilled: false, reason: 'Treasury address not configured', balance };
  }

  const secretKey = parseSecretKey(TREASURY_PRIVATE_KEY);
  const treasuryKeypair = Keypair.fromSecretKey(secretKey);
  const recipient = new PublicKey(wallet.address);
  const sender = new PublicKey(TREASURY_ADDRESS);
  const connection = getRpcConnection();
  const blockhashResponse = await connection.getLatestBlockhash('confirmed');

  const transaction = new Transaction({
    feePayer: sender,
    recentBlockhash: blockhashResponse.blockhash,
  });
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: Math.floor(REFILL_AMOUNT_SOL * 1e9),
    })
  );

  transaction.sign(treasuryKeypair);

  const serialized = transaction.serialize();
  const signature = await connection.sendRawTransaction(serialized);
  await connection.confirmTransaction(signature, 'confirmed');
  const updatedBalance = await getGasWalletBalance();
  await wallet.update({ last_refilled_at: new Date(), current_balance: updatedBalance });

  await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_REFILL, {
    wallet_id: wallet.id,
    amount: REFILL_AMOUNT_SOL,
    asset: 'SOL',
    metadata: {
      signature,
      treasury_address: TREASURY_ADDRESS,
      refill_amount_sol: REFILL_AMOUNT_SOL,
      new_balance: updatedBalance,
    },
    severity: 'info',
  });

  return { refilled: true, signature, new_balance: updatedBalance };
}

export async function ensureMinimumGasBalance(threshold = DEFAULT_GAS_THRESHOLD) {
  const balance = await getGasWalletBalance();
  if (balance < threshold) {
    const result = {
      healthy: false,
      balance,
      threshold,
      message: `Gas wallet SOL balance is below threshold: ${balance} < ${threshold}`,
    };

    await logAuditEvent(AUDIT_ACTIONS.GAS_WALLET_ALERT, {
      wallet_id: (await getSystemGasWallet()).id,
      amount: balance,
      asset: 'SOL',
      metadata: {
        action: 'gas_wallet_low_balance',
        threshold,
      },
      severity: 'critical',
    });

    if (AUTO_REFILL_ENABLED) {
      const refillResult = await refillGasWalletIfLow();
      result.refill = refillResult;
    }

    throw new Error(result.message);
  }
  return { healthy: true, balance, threshold };
}

export async function getSystemGasWalletStatus() {
  const wallet = await getSystemGasWallet();
  const balance = await getGasWalletBalance();
  return {
    id: wallet.id,
    purpose: wallet.purpose,
    address: wallet.address,
    current_balance: balance,
    last_refilled_at: wallet.last_refilled_at,
    external_signer: wallet.external_signer,
    updated_at: wallet.updated_at,
  };
}
