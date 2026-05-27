import { PublicKey } from '@solana/web3.js';
import { getAllCanonicalWallets } from '../services/walletService.js';
import { processDeposit } from '../services/depositService.js';
import { getSignaturesForAddress, getTransaction } from './solanaRpcClient.js';

const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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
  return BigInt(String(tokenBalance.uiTokenAmount.amount || '0'));
}

function formatUsdcAmount(amountBaseUnits) {
  const units = 1000000n;
  const whole = amountBaseUnits / units;
  const remainder = amountBaseUnits % units;
  return `${whole}.${remainder.toString().padStart(6, '0')}`;
}

function formatSolAmount(lamports) {
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(9);
}

function getSolDepositAmountFromMeta(tx, walletAddress) {
  if (!tx?.meta || tx.meta.err || !Array.isArray(tx.meta.preBalances) || !Array.isArray(tx.meta.postBalances) || !Array.isArray(tx.transaction?.message?.accountKeys)) {
    return 0n;
  }
  const accountKeys = tx.transaction.message.accountKeys.map((key) => key.toString());
  const accountIndex = accountKeys.indexOf(walletAddress);
  if (accountIndex < 0) return 0n;
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
    if (delta > 0n) totalDeposit += delta;
  }
  return totalDeposit;
}

function detectDepositPayload(tx, walletAddress) {
  const solAmount = getSolDepositAmountFromMeta(tx, walletAddress);
  if (solAmount > 0n) {
    return { asset: 'SOL', amount: formatSolAmount(solAmount) };
  }
  const usdcAmount = getDepositAmountFromMeta(tx.meta, walletAddress);
  if (usdcAmount > 0n) {
    return { asset: 'USDC', amount: formatUsdcAmount(usdcAmount) };
  }
  return null;
}

async function fetchTransaction(signature) {
  return await getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
}

async function scanWalletSignatures(wallet) {
  const publicKey = new PublicKey(wallet.address);
  const batchLimit = 100;
  let before;
  let processedCount = 0;

  while (true) {
    const options = { limit: batchLimit };
    if (before) options.before = before;
    const signatures = await getSignaturesForAddress(publicKey, options);
    if (!signatures || signatures.length === 0) break;
    for (const sig of signatures) {
      try {
        const tx = await fetchTransaction(sig.signature);
        if (!tx) continue;
        const payload = detectDepositPayload(tx, wallet.address);
        if (!payload) continue;
        const credited = await processDeposit({
          wallet_address: wallet.address,
          tx_hash: sig.signature,
          chain: wallet.chain || 'solana',
          asset: payload.asset,
          amount: payload.amount,
          source: 'deposit_detector',
        });
        if (credited) processedCount += 1;
      } catch (error) {
        console.error(`Deposit processing failed for ${sig.signature} (${wallet.address}):`, error?.message || error);
      }
    }
    if (signatures.length < batchLimit) break;
    before = signatures[signatures.length - 1].signature;
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
    console.error('Deposit check error:', error?.message || error);
  }
}

const DEPOSIT_DETECTOR_INTERVAL_MS = parseInt(process.env.DEPOSIT_DETECTOR_INTERVAL_MS || String(30 * 1000), 10);

setInterval(() => {
  checkDeposits().catch((error) => console.error('Deposit detector failed:', error?.message || error));
}, DEPOSIT_DETECTOR_INTERVAL_MS);
checkDeposits().catch((error) => console.error('Initial deposit detector failed:', error?.message || error));
