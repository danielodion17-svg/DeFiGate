import { supabase } from '../config/supabase.js';
import pool from '../db.js';

function normalizeChain(chainType) {
  return String(chainType || 'solana').toLowerCase();
}

function throwIfSupabaseError(error, context) {
  if (error) {
    const message = error.message || `Supabase error during ${context}`;
    throw new Error(message);
  }
}

function normalizeWalletRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    provider_wallet_id: row.provider_wallet_id,
    address: row.address,
    chain: row.chain,
    encrypted_private_key: row.encrypted_private_key,
    last_scanned_signature: row.last_scanned_signature,
    last_scanned_at: row.last_scanned_at,
    is_primary: row.is_primary,
    is_archived: row.is_archived,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function warnIfDuplicateWallets(userId, chainType = 'solana') {
  if (!supabase) return;

  const { count, error } = await supabase
    .from('wallets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('chain', normalizeChain(chainType));

  throwIfSupabaseError(error, 'warnIfDuplicateWallets');
  if (typeof count === 'number' && count > 1) {
    console.warn(
      `Wallet warning: user ${userId} has ${count} wallets for chain ${chainType}. Using canonical wallet only.`
    );
  }
}

export async function getCanonicalWallet(userId, chainType = 'solana') {
  if (!userId) return null;
  const chain = normalizeChain(chainType);

  if (supabase) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('chain', chain)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    throwIfSupabaseError(error, 'getCanonicalWallet');

    const wallet = (data && data[0]) || null;
    if (wallet) {
      await warnIfDuplicateWallets(userId, chainType);
    }
    return wallet;
  }

  const result = await pool.query(
    `SELECT * FROM wallets WHERE user_id = $1 AND chain = $2 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    [userId, chain]
  );
  const wallet = result.rows[0] || null;
  return normalizeWalletRow(wallet);
}

export async function getOrCreateWallet(userId, chainType = 'solana', walletData = null) {
  if (!userId) return null;
  const chain = normalizeChain(chainType);
  const existingWallet = await getCanonicalWallet(userId, chain);
  if (existingWallet) {
    // Preserve the existing wallet row and do not recreate.
    return existingWallet;
  }

  if (!walletData || !walletData.address) {
    return null;
  }

  const address = String(
    walletData.address || walletData?.accounts?.[0]?.address || ''
  ).trim();
  if (!address) {
    return null;
  }

  const provider = walletData.provider || 'privy';
  const providerWalletId = walletData.id || walletData.provider_wallet_id || null;
  const encryptedPrivateKey = walletData.encrypted_private_key || null;
  const now = new Date().toISOString();

  const insertQuery = `
    INSERT INTO wallets (
      user_id,
      provider,
      provider_wallet_id,
      address,
      chain,
      encrypted_private_key,
      last_accessed_at,
      is_primary,
      is_archived,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, $8, $8)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING *;
  `;

  const result = await pool.query(insertQuery, [
    userId,
    provider,
    providerWalletId,
    address,
    chain,
    encryptedPrivateKey,
    now,
    now,
  ]);

  if (result.rows.length > 0) {
    return normalizeWalletRow(result.rows[0]);
  }

  // If the insert did nothing because a wallet already exists for this user,
  // return the existing canonical wallet for the user regardless of chain.
  if (supabase) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    throwIfSupabaseError(error, 'getOrCreateWalletFallback');
    return (data && data[0]) || null;
  }

  const fallbackResult = await pool.query(
    `SELECT * FROM wallets WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    [userId]
  );
  return normalizeWalletRow(fallbackResult.rows[0] || null);
}

export async function getCanonicalWalletByWalletId(walletId) {
  if (!walletId) return null;

  if (supabase) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }
    throwIfSupabaseError(error, 'getCanonicalWalletByWalletId');

    const wallet = data || null;
    if (!wallet) return null;

    const canonical = await getCanonicalWallet(wallet.user_id, wallet.chain || 'solana');
    if (canonical && canonical.id !== wallet.id) {
      console.error(
        `Wallet fallback: requested wallet ${wallet.id} but using canonical wallet ${canonical.id} for user ${canonical.user_id}.`
      );
    }

    return canonical || wallet;
  }

  const result = await pool.query(`SELECT * FROM wallets WHERE id = $1 LIMIT 1`, [walletId]);
  const wallet = result.rows[0] || null;
  if (!wallet) return null;

  const canonical = await getCanonicalWallet(wallet.user_id, wallet.chain || 'solana');
  if (canonical && canonical.id !== wallet.id) {
    console.error(
      `Wallet fallback: requested wallet ${wallet.id} but using canonical wallet ${canonical.id} for user ${canonical.user_id}.`
    );
  }

  return canonical || normalizeWalletRow(wallet);
}

export async function getAllCanonicalWallets(chainType = 'solana') {
  const chain = normalizeChain(chainType);
  if (supabase) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('chain', chain)
      .order('user_id', { ascending: true })
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    throwIfSupabaseError(error, 'getAllCanonicalWallets');

    const canonicalByUser = new Map();
    for (const wallet of data || []) {
      if (!canonicalByUser.has(wallet.user_id)) {
        canonicalByUser.set(wallet.user_id, wallet);
      }
    }

    for (const row of Array.from(canonicalByUser.values())) {
      const duplicates = data.filter(
        (w) => w.user_id === row.user_id && w.chain === chain
      );
      if (duplicates.length > 1) {
        console.warn(
          `Wallet warning: user ${row.user_id} has ${duplicates.length} wallets for chain ${chainType}. Using canonical wallet only.`
        );
      }
    }

    return Array.from(canonicalByUser.values());
  }

  const result = await pool.query(
    `SELECT * FROM wallets WHERE chain = $1 ORDER BY user_id ASC, is_primary DESC, created_at ASC`,
    [chain]
  );
  const canonicalByUser = new Map();
  for (const wallet of result.rows) {
    if (!canonicalByUser.has(wallet.user_id)) {
      canonicalByUser.set(wallet.user_id, normalizeWalletRow(wallet));
    }
  }

  for (const row of Array.from(canonicalByUser.values())) {
    const duplicates = result.rows.filter(
      (w) => w.user_id === row.user_id && w.chain === chain
    );
    if (duplicates.length > 1) {
      console.warn(
        `Wallet warning: user ${row.user_id} has ${duplicates.length} wallets for chain ${chainType}. Using canonical wallet only.`
      );
    }
  }

  return Array.from(canonicalByUser.values());
}
