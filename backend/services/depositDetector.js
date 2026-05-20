import { Connection, PublicKey } from '@solana/web3.js';
import { sequelize, User, Account, Transaction, LedgerEntry, Wallet } from '../models/index.js';
import { getAllCanonicalWallets } from '../services/walletService.js';
import { creditAccount, getOrCreateAccount } from '../services/accountService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_ADDRESS = USDC_MINT.toBase58();
const SYSTEM_USER_EMAIL = process.env.SYSTEM_USER_EMAIL || 'system@defigate.internal';
const SYSTEM_USER_NAME = 'DeFiGate External Reserve';
const POLL_INTERVAL_MS = 10000;

// SOL Constants
const SOL_DECIMALS = 9;
const LAMPORTS_PER_SOL = 1_000_000_000;

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

function parseTokenAmount(tokenBalance) {
  if (!tokenBalance || !tokenBalance.uiTokenAmount) return 0n;
  const amountString = String(tokenBalance.uiTokenAmount.amount || '0');
  try {
    return BigInt(amountString);
  } catch {
    return 0n;
  }
}

function formatUsdcAmount(amountBaseUnits) {
  const units = 1000000n;
  const whole = amountBaseUnits / units;
  const remainder = amountBaseUnits % units;
  return `${whole}.${remainder.toString().padStart(6, '0')}`;
}

function isSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get native SOL deposit amount from transaction metadata.
 * 
 * Native SOL deposits are detected by comparing preBalances and postBalances.
 * We identify the wallet account in the transaction and calculate lamport deltas.
 * 
 * @param {Object} meta - Transaction meta object
 * @param {string} walletAddress - The wallet address to monitor
 * @returns {BigInt} Amount in lamports (positive if deposit detected)
 */
function getSolDepositAmountFromMeta(tx, walletAddress) {
  if (!tx || !tx.meta || tx.meta.err || !tx.meta.preBalances || !tx.meta.postBalances || !tx.transaction?.message?.accountKeys) {
    return 0n;
  }

  const accountKeys = tx.transaction.message.accountKeys.map((key) => key.toString());
  const accountIndex = accountKeys.findIndex((key) => key === walletAddress);
  if (accountIndex < 0) {
    return 0n;
  }

  const preLamports = BigInt(tx.meta.preBalances[accountIndex] || 0);
  const postLamports = BigInt(tx.meta.postBalances[accountIndex] || 0);
  const delta = postLamports - preLamports;

  return delta > 0n ? delta : 0n;
}

function formatSolAmount(lamports) {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol.toFixed(SOL_DECIMALS);
}

function getDepositAmountFromMeta(meta, walletAddress) {
  if (!meta) return 0n;

  const preBalances = new Map();
  for (const pre of meta.preTokenBalances || []) {
    if (pre.owner !== walletAddress || pre.mint !== USDC_MINT_ADDRESS) continue;
    if (typeof pre.accountIndex !== 'number') continue;
    preBalances.set(pre.accountIndex, parseTokenAmount(pre.uiTokenAmount));
  }

  let totalDeposit = 0n;
  for (const post of meta.postTokenBalances || []) {
    if (post.owner !== walletAddress || post.mint !== USDC_MINT_ADDRESS) continue;
    if (typeof post.accountIndex !== 'number') continue;

    const before = preBalances.get(post.accountIndex) || 0n;
    const after = parseTokenAmount(post.uiTokenAmount);
    const delta = after - before;
    if (delta > 0n) {
      totalDeposit += delta;
    }
  }

  return totalDeposit;
}

async function ensureSystemAccount(transaction) {
  const [systemUser] = await User.findOrCreate({
    where: { email: SYSTEM_USER_EMAIL },
    defaults: {
      name: SYSTEM_USER_NAME,
      is_verified: true,
      kyc_status: 'pending',
      preferred_chain: 'solana',
    },
    transaction,
  });

  const [systemAccount] = await Account.findOrCreate({
    where: { user_id: systemUser.id, asset: 'USDC' },
    defaults: {
      available_balance: 0,
      pending_balance: 0,
    },
    transaction,
  });

  return systemAccount;
}

async function ensureSystemAccountForAsset(asset, transaction) {
  const [systemUser] = await User.findOrCreate({
    where: { email: SYSTEM_USER_EMAIL },
    defaults: {
      name: SYSTEM_USER_NAME,
      is_verified: true,
      kyc_status: 'pending',
      preferred_chain: 'solana',
    },
    transaction,
  });

  const [systemAccount] = await Account.findOrCreate({
    where: { user_id: systemUser.id, asset },
    defaults: {
      available_balance: 0,
      pending_balance: 0,
    },
    transaction,
  });

  return systemAccount;
}

/**
 * Process a native SOL deposit for a user.
 * Creates Transaction, LedgerEntry, and updates Account balance.
 * @returns {Boolean} true if deposit was credited, false if duplicate or no deposit
 */
async function processSolDeposit(wallet, signature) {
  // Check for duplicate
  const existing = await Transaction.findOne({
    where: { tx_hash: signature, type: 'deposit', asset: 'SOL' },
  });
  if (existing) return false;

  const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed' });
  if (!tx || !tx.meta || tx.meta.err) return false;

  // Detect SOL deposit
  const amountLamports = getSolDepositAmountFromMeta(tx, wallet.address);
  if (amountLamports <= 0n) return false;

  const amountSol = formatSolAmount(amountLamports);

  let depositTransaction;
  
  await sequelize.transaction(async (transaction) => {
    await ensureUserAccount(wallet.user_id, 'SOL');

    depositTransaction = await Transaction.create(
      {
        user_id: wallet.user_id,
        type: 'deposit',
        amount: amountSol,
        asset: 'SOL',
        status: 'completed',
        tx_hash: signature,
      },
      { transaction }
    );

    await creditAccount(wallet.user_id, amountSol, {
      asset: 'SOL',
      walletId: wallet.id,
      txHash: signature,
      metadata: {
        source: 'deposit_detector',
        transaction_id: depositTransaction.id,
      },
      transaction,
    });
  });

  console.log(`SOL deposit detected: ${amountSol} SOL for wallet ${wallet.address}`);
  
  // Log audit event
  await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_DETECTED, {
    user_id: wallet.user_id,
    wallet_id: wallet.id,
    transaction_id: depositTransaction.id,
    tx_hash: signature,
    amount: amountSol,
    asset: 'SOL',
    metadata: {
      wallet_address: wallet.address,
      amount_lamports: amountLamports.toString(),
    }
  });
  
  return true;
}

/**
 * Process a USDC (SPL token) deposit for a user.
 * Creates Transaction, LedgerEntry, and updates Account balance.
 * @returns {Boolean} true if deposit was credited, false if duplicate or no deposit
 */
async function processUsdcDeposit(wallet, signature) {
  // Check for duplicate
  const existing = await Transaction.findOne({
    where: { tx_hash: signature, type: 'deposit', asset: 'USDC' },
  });
  if (existing) return false;

  const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed' });
  if (!tx || !tx.meta) return false;

  const amountBaseUnits = getDepositAmountFromMeta(tx.meta, wallet.address);
  if (amountBaseUnits <= 0n) return false;

  const amountString = formatUsdcAmount(amountBaseUnits);

  let depositTransaction;

  await sequelize.transaction(async (transaction) => {
    await ensureUserAccount(wallet.user_id, 'USDC');

    depositTransaction = await Transaction.create(
      {
        user_id: wallet.user_id,
        type: 'deposit',
        amount: amountString,
        asset: 'USDC',
        status: 'completed',
        tx_hash: signature,
      },
      { transaction }
    );

    await creditAccount(wallet.user_id, amountString, {
      asset: 'USDC',
      walletId: wallet.id,
      txHash: signature,
      metadata: {
        source: 'deposit_detector',
        transaction_id: depositTransaction.id,
      },
      transaction,
    });
  });

  console.log(`USDC deposit detected: ${amountString} USDC for wallet ${wallet.address}`);
  
  // Log audit event
  await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_DETECTED, {
    user_id: wallet.user_id,
    wallet_id: wallet.id,
    transaction_id: depositTransaction.id,
    tx_hash: signature,
    amount: amountString,
    asset: 'USDC',
    metadata: {
      wallet_address: wallet.address,
      amount_base_units: amountBaseUnits.toString()
    }
  });
  
  return true;
}

/**
 * Main deposit processor: detects and credits both SOL and USDC deposits.
 * Tries both asset types for each transaction.
 * @returns {Boolean} true if any deposit was credited
 */
export async function processDeposit(wallet, signature) {
  try {
    const solResult = await processSolDeposit(wallet, signature);
    const usdcResult = await processUsdcDeposit(wallet, signature);
    return solResult || usdcResult;
  } catch (error) {
    console.error(`Deposit processing failed for ${signature} (${wallet.address}):`, error?.message || error);
    return false;
  }
}

async function withRetry(fn, attempts = 3, delayMs = 3000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`Retry ${attempt} failed:`, error?.message || error);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function scanWalletSignatures(wallet) {
  const publicKey = new PublicKey(wallet.address);
  const batchLimit = 100;
  const checkpoint = wallet.last_scanned_signature;
  let before = undefined;
  let newestSignature = wallet.last_scanned_signature;
  let processedCount = 0;
  let reachedCheckpoint = false;

  while (!reachedCheckpoint) {
    const options = { limit: batchLimit };
    if (before) options.before = before;

    const signatures = await withRetry(() => connection.getSignaturesForAddress(publicKey, options));
    if (!signatures || signatures.length === 0) break;

    if (!newestSignature) {
      newestSignature = signatures[0].signature;
    }

    for (const sig of signatures) {
      if (sig.signature === checkpoint) {
        reachedCheckpoint = true;
        break;
      }

      try {
        const credited = await processDeposit(wallet, sig.signature);
        if (credited) {
          processedCount += 1;
        }
      } catch (error) {
        console.error(`Deposit processing failed for ${sig.signature} (${wallet.address}):`, error?.message || error);
      }
    }

    if (reachedCheckpoint || signatures.length < batchLimit) {
      break;
    }
    before = signatures[signatures.length - 1].signature;
  }

  if (newestSignature && newestSignature !== wallet.last_scanned_signature) {
    await wallet.update({
      last_scanned_signature: newestSignature,
      last_scanned_at: new Date(),
    });
    console.log(`Updated checkpoint for wallet ${wallet.address}: ${newestSignature}`);
  }

  return processedCount;
}

export async function checkDeposits() {
  try {
    const wallets = await getAllCanonicalWallets('solana');

    for (const wallet of wallets) {
      if (!wallet.address || !isSolanaAddress(wallet.address)) continue;

      try {
        await scanWalletSignatures(wallet);
      } catch (error) {
        console.error(`Deposit check error for wallet ${wallet.address}:`, error?.message || error);
      }
    }
  } catch (error) {
    console.error('Deposit check error:', error);
  }
}

setInterval(() => {
  checkDeposits().catch((error) => console.error('Deposit detector failed:', error?.message || error));
}, POLL_INTERVAL_MS);
checkDeposits().catch((error) => console.error('Initial deposit detector failed:', error?.message || error));