import { supabase } from '../config/supabase.js';

function normalizeChain(chainType) {
  return String(chainType || 'solana').toLowerCase();
}

function throwIfSupabaseError(error, context) {
  if (error) {
    const message = error.message || `Supabase error during ${context}`;
    throw new Error(message);
  }
}

export async function warnIfDuplicateWallets(userId, chainType = 'solana') {
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

  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('chain', normalizeChain(chainType))
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

export async function getCanonicalWalletByWalletId(walletId) {
  if (!walletId) return null;

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

export async function getAllCanonicalWallets(chainType = 'solana') {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('chain', normalizeChain(chainType))
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
      (w) => w.user_id === row.user_id && w.chain === normalizeChain(chainType)
    );
    if (duplicates.length > 1) {
      console.warn(
        `Wallet warning: user ${row.user_id} has ${duplicates.length} wallets for chain ${chainType}. Using canonical wallet only.`
      );
    }
  }

  return Array.from(canonicalByUser.values());
}
