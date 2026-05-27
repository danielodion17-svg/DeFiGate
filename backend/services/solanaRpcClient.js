import { Connection, PublicKey } from '@solana/web3.js';

const rawRpcUrls = (process.env.SOLANA_RPC_URLS || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

if (rawRpcUrls.length === 0) {
  throw new Error('No Solana RPC endpoints configured. Set SOLANA_RPC_URLS or SOLANA_RPC_URL.');
}

const rpcUrls = Array.from(new Set(rawRpcUrls));
const connections = new Map();
const cacheTtlMs = Number(process.env.SOLANA_RPC_CACHE_TTL_MS || '7000');
const maxConcurrentRequests = Number(process.env.SOLANA_RPC_CONCURRENCY_LIMIT || '8');
const maxRetryCycles = Number(process.env.SOLANA_RPC_MAX_RETRY_CYCLES || '2');
const requestTimeoutMs = Number(process.env.SOLANA_RPC_REQUEST_TIMEOUT_MS || '20000');

const pendingRequests = new Map();
const cacheResults = new Map();
const queue = [];
let activeRequests = 0;
let endpointIndex = 0;

function normalizeKey(value) {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return JSON.stringify(value);
}

function getRequestKey(method, args) {
  const argString = args.map((arg) => normalizeKey(arg)).join('|');
  return `${method}:${argString}`;
}

function getCachedResult(key) {
  const cacheEntry = cacheResults.get(key);
  if (!cacheEntry) return null;
  if (Date.now() > cacheEntry.expiresAt) {
    cacheResults.delete(key);
    return null;
  }
  console.debug('[solanaRpcClient] cache hit', key);
  return cacheEntry.value;
}

function setCachedResult(key, value) {
  cacheResults.set(key, {
    value,
    expiresAt: Date.now() + cacheTtlMs,
  });
}

function queueRequest(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
  });
}

function drainQueue() {
  if (activeRequests >= maxConcurrentRequests || queue.length === 0) return;
  const { task, resolve, reject } = queue.shift();
  activeRequests += 1;
  task()
    .then((result) => resolve(result))
    .catch((error) => reject(error))
    .finally(() => {
      activeRequests -= 1;
      drainQueue();
    });
}

function withConcurrency(task) {
  if (activeRequests >= maxConcurrentRequests) {
    console.warn('[solanaRpcClient] throttling request; active=', activeRequests, 'queue=', queue.length + 1);
    return queueRequest(task).finally(() => drainQueue());
  }

  activeRequests += 1;
  return task().finally(() => {
    activeRequests -= 1;
    drainQueue();
  });
}

function getConnection(url) {
  if (connections.has(url)) return connections.get(url);
  const connection = new Connection(url, 'confirmed');
  connections.set(url, connection);
  return connection;
}

export function getRpcConnection() {
  const endpoint = rpcUrls[getNextEndpoint() % rpcUrls.length];
  return getConnection(endpoint);
}

function getNextEndpoint() {
  const next = endpointIndex % rpcUrls.length;
  endpointIndex += 1;
  return next;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return false;
  return [
    '429',
    'rate limit',
    'too many requests',
    'timeout',
    'timed out',
    'econnreset',
    'ecancelled',
    'etimedout',
    '502',
    '503',
    '504',
    'failed to fetch',
    'connection refused',
    'invalid json rpc response',
  ].some((token) => message.includes(token));
}

async function executeRpcCall(method, args, connectionUrl) {
  const connection = getConnection(connectionUrl);
  console.debug('[solanaRpcClient] rpc call', method, connectionUrl);
  const call = async () => {
    if (typeof connection[method] !== 'function') {
      throw new Error(`Solana RPC method not supported: ${method}`);
    }

    return await connection[method](...args);
  };

  if (requestTimeoutMs > 0) {
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Solana RPC timeout after ${requestTimeoutMs}ms`));
      }, requestTimeoutMs);
    });
    return await Promise.race([call(), timeoutPromise]);
  }

  return await call();
}

async function requestRpc(method, args, options = {}) {
  const cacheable = options.cacheable ?? false;
  const key = getRequestKey(method, args);

  if (cacheable) {
    const cached = getCachedResult(key);
    if (cached !== null) {
      return cached;
    }
  }

  if (pendingRequests.has(key)) {
    console.debug('[solanaRpcClient] dedup pending request', method, key);
    return pendingRequests.get(key);
  }

  const promise = withConcurrency(async () => {
    let lastError = null;
    const startIndex = getNextEndpoint();
    for (let cycle = 0; cycle < maxRetryCycles; cycle += 1) {
      for (let attempt = 0; attempt < rpcUrls.length; attempt += 1) {
        const endpoint = rpcUrls[(startIndex + attempt) % rpcUrls.length];
        try {
          const result = await executeRpcCall(method, args, endpoint);
          if (cacheable) setCachedResult(key, result);
          return result;
        } catch (error) {
          lastError = error;
          if (!isRetryableError(error)) {
            throw error;
          }
          console.warn('[solanaRpcClient] retryable RPC error', { method, endpoint, attempt: attempt + 1, cycle: cycle + 1, message: error.message });
        }
      }
      if (cycle < maxRetryCycles - 1) {
        const backoff = 200 * 2 ** cycle;
        await delay(backoff + Math.floor(Math.random() * 100));
      }
    }
    throw lastError || new Error(`[solanaRpcClient] RPC failed for method ${method}`);
  });

  pendingRequests.set(key, promise);
  promise.finally(() => {
    pendingRequests.delete(key);
  });
  return promise;
}

function parseKeyOrPublicKey(value) {
  if (value instanceof PublicKey) return value;
  return new PublicKey(String(value));
}

export async function getBalance(address, commitment = 'confirmed') {
  const publicKey = parseKeyOrPublicKey(address);
  return await requestRpc('getBalance', [publicKey, commitment], { cacheable: true });
}

export async function getSignaturesForAddress(address, options = {}) {
  const publicKey = parseKeyOrPublicKey(address);
  return await requestRpc('getSignaturesForAddress', [publicKey, options], { cacheable: true });
}

export async function getParsedTransaction(signature, options = {}) {
  return await requestRpc('getParsedTransaction', [signature, options]);
}

export async function getTransaction(signature, options = {}) {
  return await requestRpc('getTransaction', [signature, options]);
}

export async function confirmTransaction(signature, options = {}) {
  const statuses = await requestRpc('getSignatureStatuses', [[signature], options], { cacheable: true });
  const status = statuses?.value?.[0];
  return {
    signature,
    confirmed: Boolean(status && status.confirmations !== null),
    success: status?.err == null,
    confirmations: status?.confirmations,
    err: status?.err || null,
    errMessage: status?.err ? JSON.stringify(status.err) : null,
    slot: status?.slot || null,
  };
}

export async function getTokenAccountsByOwner(address, options = {}) {
  const publicKey = parseKeyOrPublicKey(address);
  return await requestRpc('getTokenAccountsByOwner', [publicKey, options], {});
}

export async function getTokenAccountBalance(address, commitment = 'confirmed') {
  const publicKey = parseKeyOrPublicKey(address);
  return await requestRpc('getTokenAccountBalance', [publicKey, commitment], {});
}

export async function getAccountInfo(address, commitment = 'confirmed') {
  const publicKey = parseKeyOrPublicKey(address);
  return await requestRpc('getAccountInfo', [publicKey, commitment], {});
}

export async function getLatestBlockhash() {
  return await requestRpc('getLatestBlockhash', []);
}

export default {
  getBalance,
  getSignaturesForAddress,
  getParsedTransaction,
  getTransaction,
  confirmTransaction,
  getTokenAccountsByOwner,
  getTokenAccountBalance,
  getAccountInfo,
  getLatestBlockhash,
};
