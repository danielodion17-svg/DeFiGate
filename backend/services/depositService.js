import { Connection, PublicKey } from '@solana/web3.js';
import { sequelize, Transaction, Wallet, Account, AccountLedger } from '../models/index.js';
import { creditAccount } from './accountService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_ADDRESS = USDC_MINT.toBase58();
const SOL_DECIMALS = 9;
const LAMPORTS_PER_SOL = 1_000_000_000;
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

function isSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

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

function formatSolAmount(lamports) {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol.toFixed(SOL_DECIMALS);
}

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

function detectDepositPayload(tx, walletAddress) {
  const solAmount = getSolDepositAmountFromMeta(tx, walletAddress);
  if (solAmount > 0n) {
    return { asset: 'SOL', amountString: formatSolAmount(solAmount) };
  }

  const usdcAmount = getDepositAmountFromMeta(tx.meta, walletAddress);
  if (usdcAmount > 0n) {
    return { asset: 'USDC', amountString: formatUsdcAmount(usdcAmount) };
  }

  return null;
}

export async function resolveWallet(walletAddress, chain = 'solana') {
  if (!walletAddress || String(walletAddress).trim().length === 0) {
    throw new Error('MISSING_WALLET_ADDRESS');
  }

  const normalizedAddress = String(walletAddress).trim();
  const wallet = await Wallet.findOne({ where: { address: normalizedAddress, chain } });
  if (!wallet) {
    return null;
  }

  console.log(`wallet resolved: ${normalizedAddress} -> user_id=${wallet.user_id}`);
  return wallet;
}

async function findExistingTransaction(txHash) {
  if (!txHash) return null;
  return await Transaction.findOne({ where: { tx_hash: txHash } });
}

async function hasExistingLedgerEntry(transactionId) {
  if (!transactionId) return false;
  const count = await AccountLedger.count({ where: { transaction_id: transactionId } });
  return count > 0;
}

async function createDepositTransaction(wallet, txHash, asset, amountString) {
  try {
    return await Transaction.create({
      user_id: wallet.user_id,
      wallet_id: wallet.id,
      type: 'deposit',
      amount: amountString,
      asset,
      status: 'confirmed',
      tx_hash: txHash,
    });
  } catch (error) {
    if (error.code === '23505') {
      return await Transaction.findOne({ where: { tx_hash: txHash } });
    }
    throw error;
  }
}

async function ensureDepositLedger(wallet, transactionRow, asset, amountString, txHash, source) {
  const alreadyWritten = await hasExistingLedgerEntry(transactionRow.id);
  if (alreadyWritten) {
    console.log(`ledger already exists for transaction ${transactionRow.id} tx_hash=${txHash}`);
    return false;
  }

  await creditAccount(wallet.user_id, amountString, {
    asset,
    walletId: wallet.id,
    txHash,
    metadata: {
      source,
      wallet_address: wallet.address,
    },
    transactionId: transactionRow.id,
  });

  console.log(`ledger written for tx_hash=${txHash} wallet=${wallet.address}`);
  return true;
}

export async function rebuildBalancesFromLedgerForUser(userId) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }

  const ledgerRows = await sequelize.query(
    `SELECT asset, COALESCE(SUM(amount::numeric), 0) AS derived_balance
     FROM account_ledger
     WHERE user_id = ?
     GROUP BY asset`,
    {
      replacements: [userId],
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const assetBalances = ledgerRows.reduce((memo, row) => {
    memo[String(row.asset).toUpperCase()] = Number(row.derived_balance || 0);
    return memo;
  }, {});

  const accounts = await Account.findAll({ where: { user_id: userId } });
  const updates = [];

  for (const asset of Object.keys(assetBalances)) {
    const derivedBalance = assetBalances[asset];
    const [account] = await Account.findOrCreate({
      where: { user_id: userId, asset },
      defaults: {
        available_balance: derivedBalance,
        pending_balance: 0,
      },
    });

    const before = {
      available_balance: Number(account.available_balance),
      pending_balance: Number(account.pending_balance),
    };
    const after = {
      available_balance: derivedBalance,
      pending_balance: 0,
    };

    if (before.available_balance !== after.available_balance || before.pending_balance !== after.pending_balance) {
      await account.update(after);
      updates.push({ balance_id: account.id, before, after });
    }
  }

  for (const account of accounts) {
    const asset = String(account.asset).toUpperCase();
    if (!(asset in assetBalances) && (Number(account.available_balance) !== 0 || Number(account.pending_balance) !== 0)) {
      const before = {
        available_balance: Number(account.available_balance),
        pending_balance: Number(account.pending_balance),
      };
      const after = { available_balance: 0, pending_balance: 0 };
      await account.update(after);
      updates.push({ balance_id: account.id, before, after });
    }
  }

  if (updates.length > 0) {
    console.log(`balance rebuild completed for user ${userId}: ${updates.length} updates`);
  }

  return updates;
}

export async function processDeposit(event = {}) {
  const walletAddress = String(event.wallet_address || event.address || '').trim();
  const txHash = String(event.tx_hash || event.signature || '').trim();
  const source = String(event.source || 'deposit_service').trim();
  const chain = String(event.chain || 'solana').trim();

  console.log(`deposit received source=${source} wallet_address=${walletAddress} tx_hash=${txHash}`);

  if (!walletAddress || !txHash) {
    throw new Error('MISSING_DEPOSIT_PAYLOAD');
  }

  if (chain !== 'solana') {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  if (!isSolanaAddress(walletAddress)) {
    throw new Error(`Invalid Solana wallet address: ${walletAddress}`);
  }

  const wallet = await resolveWallet(walletAddress, chain);
  if (!wallet) {
    console.warn(`Wallet not found for address ${walletAddress}`);
    return false;
  }

  const existingTransaction = await findExistingTransaction(txHash);
  if (existingTransaction) {
    const alreadyWritten = await hasExistingLedgerEntry(existingTransaction.id);
    if (alreadyWritten) {
      console.log(`deposit already processed: tx_hash=${txHash} wallet=${wallet.address}`);
      return false;
    }
    console.log(`deposit transaction exists but ledger missing for tx_hash=${txHash}; repairing ledger`);
    await ensureDepositLedger(wallet, existingTransaction, existingTransaction.asset, existingTransaction.amount, txHash, source);
    await rebuildBalancesFromLedgerForUser(wallet.user_id);
    return true;
  }

  const tx = await connection.getParsedTransaction(txHash, { commitment: 'confirmed' });
  if (!tx || !tx.meta || tx.meta.err) {
    console.warn(`Skipping invalid or errored transaction ${txHash} for wallet ${wallet.address}`);
    return false;
  }

  const payload = detectDepositPayload(tx, wallet.address);
  if (!payload) {
    console.log(`No deposit payload found for ${txHash} on wallet ${wallet.address}`);
    return false;
  }

  const transactionRow = await createDepositTransaction(wallet, txHash, payload.asset, payload.amountString);
  console.log(`transaction created tx_hash=${txHash} id=${transactionRow.id}`);

  await ensureDepositLedger(wallet, transactionRow, payload.asset, payload.amountString, txHash, source);
  await rebuildBalancesFromLedgerForUser(wallet.user_id);

  await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_DETECTED, {
    user_id: wallet.user_id,
    wallet_id: wallet.id,
    transaction_id: transactionRow.id,
    tx_hash: txHash,
    amount: payload.amountString,
    asset: payload.asset,
    metadata: {
      source,
      wallet_address: wallet.address,
    },
  });

  console.log(`deposit pipeline completed for tx_hash=${txHash} wallet=${wallet.address}`);
  return true;
}
