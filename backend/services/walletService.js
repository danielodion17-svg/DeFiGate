import axios from 'axios';
import { Wallet } from '../models/index.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_BASE = 'https://api.privy.io';

function normalizeChain(chainType = 'solana') {
  return String(chainType || 'solana').trim().toLowerCase();
}

function validateAddress(address) {
  return String(address || '').trim();
}

function privyHeaders() {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error('Privy credentials not configured');
  }
  const encoded = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'privy-app-id': PRIVY_APP_ID,
    'Content-Type': 'application/json',
  };
}

export async function warnIfDuplicateWallets(userId) {
  if (!userId) return;
  const count = await Wallet.count({ where: { user_id: userId } });
  if (count > 1) {
    console.warn(`Wallet warning: user ${userId} has ${count} wallets. Using canonical wallet only.`);
  }
}

export async function getCanonicalWallet(userId, chainType = 'solana') {
  if (!userId) return null;
  const chain = normalizeChain(chainType);
  const wallet = await Wallet.findOne({
    where: { user_id: userId, chain, provider: 'privy', is_archived: false },
    order: [['is_primary', 'DESC'], ['created_at', 'ASC']],
  });
  if (wallet) {
    await warnIfDuplicateWallets(userId);
  }
  return wallet;
}

export async function resolveWallet(address, chainType = 'solana') {
  const normalizedAddress = validateAddress(address);
  if (!normalizedAddress) {
    throw new Error('MISSING_WALLET_ADDRESS');
  }
  const chain = normalizeChain(chainType);
  const wallet = await Wallet.findOne({ where: { address: normalizedAddress, chain, provider: 'privy', is_archived: false } });
  return wallet;
}

async function insertOrFetchWallet(userId, walletPayload) {
  try {
    const wallet = await Wallet.create(walletPayload);
    await logAuditEvent(AUDIT_ACTIONS.WALLET_CREATED, {
      user_id: userId,
      wallet_id: wallet.id,
      metadata: {
        provider: wallet.provider,
        provider_wallet_id: wallet.provider_wallet_id,
        wallet_address: wallet.address,
        chain: wallet.chain,
      },
      severity: 'info',
    });
    return wallet;
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === '23505') {
      return await getCanonicalWallet(userId, walletPayload.chain);
    }
    throw error;
  }
}

export async function getOrCreateWallet(userId, chainType = 'solana', walletData = {}) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }

  const chain = normalizeChain(chainType);
  const existingWallet = await getCanonicalWallet(userId, chain);
  if (existingWallet) {
    return existingWallet;
  }

  const provider = String(walletData.provider || '').trim().toLowerCase();
  if (provider !== 'privy') {
    throw new Error('ONLY_PRIVY_WALLET_CREATION_ALLOWED');
  }

  const providerWalletId = walletData.provider_wallet_id || walletData.id || null;
  const address = validateAddress(walletData.address || walletData.accounts?.[0]?.address || '');
  if (!providerWalletId || !address) {
    throw new Error('MISSING_PRIVY_WALLET_DATA');
  }

  const walletPayload = {
    user_id: userId,
    provider,
    provider_wallet_id: providerWalletId,
    address,
    chain,
    is_primary: true,
    is_archived: false,
  };

  return await insertOrFetchWallet(userId, walletPayload);
}

export async function getCanonicalWalletByWalletId(walletId) {
  if (!walletId) return null;
  return Wallet.findByPk(walletId);
}

async function createPrivyWallet(chainType = 'solana') {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error('Privy credentials are not configured');
  }
  if (normalizeChain(chainType) !== 'solana') {
    throw new Error('Only Solana wallet creation is supported');
  }
  const body = { chain_type: 'solana' };
  const response = await axios.post(`${PRIVY_BASE}/v1/wallets`, body, { headers: privyHeaders() });
  return response.data;
}

export async function createPrivyWalletForUser(userId, chainType = 'solana') {
  const chain = normalizeChain(chainType);
  const existingWallet = await getCanonicalWallet(userId, chain);
  if (existingWallet) {
    await logAuditEvent(AUDIT_ACTIONS.WALLET_REUSED, {
      user_id: userId,
      wallet_id: existingWallet.id,
      metadata: {
        wallet_address: existingWallet.address,
        provider: existingWallet.provider,
        provider_wallet_id: existingWallet.provider_wallet_id,
      },
    });
    return existingWallet;
  }

  const privyWallet = await createPrivyWallet(chain);
  const address = validateAddress(privyWallet.accounts?.[0]?.address || privyWallet.address);
  if (!address) {
    throw new Error('Privy wallet response did not include an address');
  }

  return await getOrCreateWallet(userId, chain, {
    provider: 'privy',
    provider_wallet_id: privyWallet.id,
    address,
  });
}

export async function syncPrivyWallet(userId) {
  const wallet = await getCanonicalWallet(userId, 'solana');
  if (!wallet || wallet.provider !== 'privy') {
    throw new Error('Privy wallet not found for user');
  }
  if (!wallet.provider_wallet_id) {
    throw new Error('Privy wallet metadata missing provider_wallet_id');
  }

  const response = await axios.get(`${PRIVY_BASE}/v1/wallets/${wallet.provider_wallet_id}`, {
    headers: privyHeaders(),
  });

  const address = validateAddress(response.data.accounts?.[0]?.address || response.data.address);
  const chain = normalizeChain(response.data.chain_type || wallet.chain || 'solana');
  if (!address) {
    throw new Error('Privy wallet response did not include a valid address');
  }

  if (address !== wallet.address || chain !== wallet.chain) {
    await wallet.update({ address, chain });
  }

  return wallet;
}

export async function getAllCanonicalWallets(chainType = 'solana') {
  const chain = normalizeChain(chainType);
  const wallets = await Wallet.findAll({
    where: { chain, is_archived: false },
    order: [['user_id', 'ASC'], ['is_primary', 'DESC'], ['created_at', 'ASC']],
  });
  return wallets;
}
