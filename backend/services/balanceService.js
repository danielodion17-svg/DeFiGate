import { sequelize, Account, AccountLedger } from '../models/index.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const DEFAULT_ASSET = 'USDC';
const ASSET_DECIMALS = {
  USDC: 6,
  SOL: 9,
};

function normalizeAsset(asset = DEFAULT_ASSET) {
  return String(asset || DEFAULT_ASSET).trim().toUpperCase();
}

function getAssetPrecision(asset = DEFAULT_ASSET) {
  const normalizedAsset = normalizeAsset(asset);
  return ASSET_DECIMALS[normalizedAsset] ?? 18;
}

function normalizeAmount(amount, asset = DEFAULT_ASSET) {
  const amountString = String(amount).trim();
  const precision = getAssetPrecision(asset);
  const amountRegex = new RegExp(`^-?\\d+(?:\\.\\d{1,${precision}})?$`);
  if (!amountRegex.test(amountString)) {
    throw new Error('INVALID_AMOUNT');
  }
  return amountString;
}

function normalizeEntryType(entryType = 'ledger') {
  return String(entryType || 'ledger').trim().toLowerCase();
}

async function updateBalanceCache(userId, asset = DEFAULT_ASSET, transaction = null) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }

  const normalizedAsset = normalizeAsset(asset);
  const rows = await sequelize.query(
    `SELECT COALESCE(SUM(amount::numeric), 0) AS derived_balance
     FROM account_ledger
     WHERE user_id = :userId AND asset = :asset`,
    {
      replacements: { userId, asset: normalizedAsset },
      type: sequelize.QueryTypes.SELECT,
      transaction,
    }
  );

  const derivedBalance = rows?.[0]?.derived_balance ?? 0;
  await Account.upsert(
    {
      user_id: userId,
      asset: normalizedAsset,
      available_balance: derivedBalance,
      pending_balance: 0,
      updated_at: new Date(),
    },
    { transaction }
  );

  return Number(derivedBalance);
}

export async function getOrCreateBalance(userId, asset = DEFAULT_ASSET) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }

  const normalizedAsset = normalizeAsset(asset);
  const [balance] = await Account.findOrCreate({
    where: { user_id: userId, asset: normalizedAsset },
    defaults: {
      available_balance: 0,
      pending_balance: 0,
      is_frozen: false,
      freeze_reason: null,
      updated_at: new Date(),
    },
  });

  return balance;
}

export async function getDerivedBalance(userId, asset = DEFAULT_ASSET) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }

  const normalizedAsset = normalizeAsset(asset);
  const rows = await sequelize.query(
    `SELECT COALESCE(SUM(amount::numeric), 0) AS derived_balance
     FROM account_ledger
     WHERE user_id = :userId AND asset = :asset`,
    {
      replacements: { userId, asset: normalizedAsset },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return Number(rows?.[0]?.derived_balance ?? 0);
}

export async function rebuildBalancesFromLedger(userId = null) {
  const userClause = userId ? 'WHERE user_id = :userId' : '';
  const rows = await sequelize.query(
    `SELECT user_id, asset, COALESCE(SUM(amount::numeric), 0) AS derived_balance
     FROM account_ledger
     ${userClause}
     GROUP BY user_id, asset`,
    {
      replacements: userId ? { userId } : {},
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const updated = [];
  const userAssets = new Set();

  for (const row of rows) {
    const normalizedAsset = normalizeAsset(row.asset);
    const balanceValue = Number(row.derived_balance || 0);
    await Account.upsert({
      user_id: row.user_id,
      asset: normalizedAsset,
      available_balance: balanceValue,
      pending_balance: 0,
      updated_at: new Date(),
    });
    updated.push({ user_id: row.user_id, asset: normalizedAsset, available_balance: balanceValue });
    userAssets.add(`${row.user_id}:${normalizedAsset}`);
  }

  if (userId) {
    const balances = await Account.findAll({ where: { user_id: userId } });
    for (const balance of balances) {
      const key = `${balance.user_id}:${normalizeAsset(balance.asset)}`;
      if (!userAssets.has(key)) {
        await balance.update({ available_balance: 0, pending_balance: 0, updated_at: new Date() });
        updated.push({ user_id: balance.user_id, asset: balance.asset, available_balance: 0 });
      }
    }
  }

  return updated;
}

export async function createLedgerEntry({
  userId,
  walletId = null,
  transactionId,
  txHash = null,
  entryType = 'ledger',
  asset = DEFAULT_ASSET,
  amount,
  metadata = null,
  transaction = null,
}) {
  if (!userId || !transactionId || amount == null) {
    throw new Error('INVALID_LEDGER_ENTRY');
  }

  const normalizedAsset = normalizeAsset(asset);
  const normalizedAmount = normalizeAmount(amount, normalizedAsset);
  const normalizedEntryType = normalizeEntryType(entryType);

  try {
    const ledgerEntry = await AccountLedger.create(
      {
        transaction_id: transactionId,
        user_id: userId,
        wallet_id: walletId,
        asset: normalizedAsset,
        entry_type: normalizedEntryType,
        amount: normalizedAmount,
        tx_hash: txHash || null,
        metadata: metadata || {},
        created_at: new Date(),
      },
      { transaction }
    );

    await updateBalanceCache(userId, normalizedAsset, transaction);
    await logAuditEvent(AUDIT_ACTIONS.ACCOUNT_LEDGER_ENTRY, {
      user_id: userId,
      wallet_id: walletId,
      transaction_id: transactionId,
      tx_hash: txHash,
      amount: normalizedAmount,
      asset: normalizedAsset,
      metadata: { entryType: normalizedEntryType, ...metadata },
      severity: 'info',
    });

    return ledgerEntry;
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === '23505') {
      return await AccountLedger.findOne({ where: { tx_hash: txHash, asset: normalizedAsset }, transaction });
    }
    throw error;
  }
}

export async function creditAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId,
    transactionId,
    txHash,
    entryType: 'deposit',
    asset,
    amount,
    metadata,
    transaction,
  });
}

export async function debitAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId,
    transactionId,
    txHash,
    entryType: 'withdrawal',
    asset,
    amount: `-${normalizeAmount(amount, asset)}`,
    metadata,
    transaction,
  });
}

export async function adjustAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) === 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId,
    transactionId,
    txHash,
    entryType: 'adjustment',
    asset,
    amount,
    metadata,
    transaction,
  });
}

export async function reserveFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId: null,
    transactionId,
    txHash: null,
    entryType: 'reserve',
    asset,
    amount: `-${normalizeAmount(amount, asset)}`,
    metadata,
    transaction,
  });
}

export async function releaseFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId: null,
    transactionId,
    txHash: null,
    entryType: 'release',
    asset,
    amount: normalizeAmount(amount, asset),
    metadata,
    transaction,
  });
}

export async function commitReservedFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, transactionId = null, transaction = null } = options;
  if (Number(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return await createLedgerEntry({
    userId,
    walletId,
    transactionId,
    txHash,
    entryType: 'withdrawal',
    asset,
    amount: `-${normalizeAmount(amount, asset)}`,
    metadata,
    transaction,
  });
}

export async function getAccountCache(userId, asset = DEFAULT_ASSET) {
  return await getOrCreateBalance(userId, asset);
}
