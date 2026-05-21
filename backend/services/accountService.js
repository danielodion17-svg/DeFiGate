import { supabase as supabaseDefault, supabaseAnonClient, supabaseServiceClient, requireServiceClient } from '../config/supabase.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const DEFAULT_ASSET = 'USDC';
const ASSET_DECIMALS = {
  USDC: 6,
  SOL: 9,
};

function normalizeAsset(asset) {
  return String(asset || DEFAULT_ASSET).trim().toUpperCase();
}

function getAssetPrecision(asset) {
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

async function rpcCall(functionName, params = {}) {
  const svc = requireServiceClient(`RPC ${functionName}`);
  const { data, error } = await svc.rpc(functionName, params);
  if (error) {
    throw new Error(error.message || `RPC ${functionName} failed`);
  }
  return data;
}

export async function getOrCreateAccount(userId, asset = DEFAULT_ASSET) {
  const normalized = normalizeAsset(asset);
  const payload = {
    user_id: userId,
    asset: normalized,
    available_balance: 0,
    pending_balance: 0,
    is_frozen: false,
    freeze_reason: null,
    updated_at: new Date().toISOString(),
  };

  const svc = requireServiceClient('getOrCreateAccount upsert');
  const { data, error } = await svc
    .from('balances')
    .upsert(payload, { onConflict: ['user_id', 'asset'] })
    .select('*')
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Failed to get or create account');
  }
  return (data && data[0]) || null;
}

async function getRawDerivedBalance(userId, asset = DEFAULT_ASSET) {
  const normalized = normalizeAsset(asset);
  const readClient = supabaseAnonClient || supabaseServiceClient;
  if (!readClient) throw new Error('Supabase client not configured for reads');
  const { data, error } = await readClient
    .from('account_ledger')
    .select('amount', { count: 'exact' })
    .eq('user_id', userId)
    .eq('asset', normalized);

  if (error) {
    throw new Error(error.message || 'Failed to fetch derived balance');
  }

  let sum = 0;
  for (const row of data || []) {
    sum += parseFloat(row.amount || 0);
  }
  return sum;
}

async function syncAccountCache(userId, asset = DEFAULT_ASSET) {
  const derivedBalance = await getRawDerivedBalance(userId, asset);
  const account = await getOrCreateAccount(userId, asset);
  const cachedBalance = parseFloat(account.available_balance || 0);

  if (Math.abs(cachedBalance - derivedBalance) > 0.000001) {
    const updatePayload = { available_balance: derivedBalance, updated_at: new Date().toISOString() };
    const svc = requireServiceClient('syncAccountCache update');
    const { error } = await svc
      .from('balances')
      .update(updatePayload)
      .match({ user_id: userId, asset: normalizeAsset(asset) });

    if (error) {
      throw new Error(error.message || 'Failed to update account cache');
    }

    await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
      user_id: userId,
      wallet_id: account.id,
      amount: (derivedBalance - cachedBalance).toString(),
      asset: normalizeAsset(asset),
      metadata: {
        derived_balance: derivedBalance,
        cached_balance: cachedBalance,
      },
    });
  }

  return derivedBalance;
}

async function addLedgerEntry({
  userId,
  walletId = null,
  asset = DEFAULT_ASSET,
  type = 'adjustment',
  amount,
  txHash = null,
  referenceId = null,
  transferId = null,
  metadata = null,
  auditActorId = null,
  transactionId = null,
}) {
  if (!userId || !amount) {
    throw new Error('INVALID_LEDGER_ENTRY');
  }

  const normalizedAmount = normalizeAmount(amount, asset);
  const normalizedAsset = normalizeAsset(asset);
  const rpcParams = {
    p_user_id: userId,
    p_amount: normalizedAmount,
    p_asset: normalizedAsset,
    p_wallet_id: walletId,
    p_tx_hash: txHash,
    p_reference_id: referenceId,
    p_transfer_id: transferId,
    p_metadata: metadata || {},
    p_audit_actor_id: auditActorId,
    p_transaction_id: transactionId,
  };

  switch (type) {
    case 'deposit':
      return await rpcCall('credit_account', rpcParams);
    case 'withdrawal':
      return await rpcCall('debit_account', rpcParams);
    case 'adjustment':
      return await rpcCall('adjust_account', rpcParams);
    case 'reserve':
      return await rpcCall('reserve_funds', rpcParams);
    case 'release':
      return await rpcCall('release_funds', rpcParams);
    default:
      throw new Error(`Unsupported ledger entry type: ${type}`);
  }
}

export async function getDerivedBalance(userId, asset = DEFAULT_ASSET) {
  const balance = await syncAccountCache(userId, asset);
  return balance;
}

export async function creditAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, referenceId = null, transferId = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return addLedgerEntry({
    userId,
    walletId,
    asset,
    type: 'deposit',
    amount,
    txHash,
    referenceId,
    transferId,
    metadata,
    auditActorId,
    transactionId,
  });
}

export async function debitAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, referenceId = null, transferId = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return addLedgerEntry({
    userId,
    walletId,
    asset,
    type: 'withdrawal',
    amount,
    txHash,
    referenceId,
    transferId,
    metadata,
    auditActorId,
    transactionId,
  });
}

export async function adjustAccount(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, referenceId = null, transferId = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) === 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return addLedgerEntry({
    userId,
    walletId,
    asset,
    type: 'adjustment',
    amount,
    txHash,
    referenceId,
    transferId,
    metadata,
    auditActorId,
    transactionId,
  });
}

export async function freezeAccount(userId, asset = DEFAULT_ASSET, reason = 'system freeze') {
  const account = await getOrCreateAccount(userId, asset);
  const update = {
    is_frozen: true,
    freeze_reason: String(reason || 'frozen by system'),
    updated_at: new Date().toISOString(),
  };

  const svc = requireServiceClient('freezeAccount update');
  const { error } = await svc
    .from('balances')
    .update(update)
    .match({ user_id: userId, asset: normalizeAsset(asset) });

  if (error) throw new Error(error.message || 'Failed to freeze account');

  await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
    user_id: userId,
    wallet_id: account.id,
    metadata: {
      action: 'freeze_account',
      asset: normalizeAsset(asset),
      reason,
    },
  });
  return await getOrCreateAccount(userId, asset);
}

export async function reserveFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, metadata = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  return await rpcCall('reserve_funds', {
    p_user_id: userId,
    p_amount: normalizeAmount(amount),
    p_asset: normalizeAsset(asset),
    p_metadata: metadata || {},
    p_audit_actor_id: auditActorId,
    p_transaction_id: transactionId,
  });
}

export async function releaseFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, metadata = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  return await rpcCall('release_funds', {
    p_user_id: userId,
    p_amount: normalizeAmount(amount),
    p_asset: normalizeAsset(asset),
    p_metadata: metadata || {},
    p_audit_actor_id: auditActorId,
    p_transaction_id: transactionId,
  });
}

export async function commitReservedFunds(userId, amount, options = {}) {
  const { asset = DEFAULT_ASSET, walletId = null, txHash = null, metadata = null, referenceId = null, transferId = null, auditActorId = null, transactionId = null } = options;
  if (parseFloat(amount) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  return await rpcCall('commit_reserved_funds', {
    p_user_id: userId,
    p_amount: normalizeAmount(amount),
    p_asset: normalizeAsset(asset),
    p_wallet_id: walletId,
    p_tx_hash: txHash,
    p_reference_id: referenceId,
    p_transfer_id: transferId,
    p_metadata: metadata || {},
    p_audit_actor_id: auditActorId,
    p_transaction_id: transactionId,
  });
}

export async function getAccountCache(userId, asset = DEFAULT_ASSET) {
  return await getOrCreateAccount(userId, asset);
}
