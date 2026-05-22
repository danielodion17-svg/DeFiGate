import { Connection, PublicKey } from '@solana/web3.js';
import { getAllCanonicalWallets } from '../services/walletService.js';
import { processDeposit } from '../services/depositService.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POLL_INTERVAL_MS = 10000;
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

function isSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
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
        const credited = await processDeposit({
          wallet_address: wallet.address,
          tx_hash: sig.signature,
          source: 'deposit_detector',
          chain: 'solana',
        });
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
