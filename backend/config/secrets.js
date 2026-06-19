import dotenv from 'dotenv';

dotenv.config();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseIntEnv(value, defaultValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseFloatEnv(value, defaultValue) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEVELOPMENT = NODE_ENV === 'development';
const PORT = parseIntEnv(process.env.PORT, 5000);
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.LOCAL_DATABASE_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const KOTANI_API_BASE = process.env.KOTANI_API_BASE || 'https://sandbox-api.kotanipay.io/api/v3';
const KOTANI_API_KEY = process.env.KOTANI_API_KEY || '';
const KOTANI_WEBHOOK_SECRET = process.env.KOTANI_WEBHOOK_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';
const RAMP_PROVIDER = (process.env.RAMP_PROVIDER || 'kotani').toLowerCase();
const SYSTEM_GAS_WALLET_ADDRESS = process.env.SYSTEM_GAS_WALLET_ADDRESS || '';
const SYSTEM_GAS_WALLET_ENCRYPTED_KEY = process.env.SYSTEM_GAS_WALLET_ENCRYPTED_KEY || '';
const SOLANA_GAS_TREASURY_PRIVATE_KEY = process.env.SOLANA_GAS_TREASURY_PRIVATE_KEY || '';
const SOLANA_GAS_TREASURY_ADDRESS = process.env.SOLANA_GAS_TREASURY_ADDRESS || '';
const SOLANA_GAS_THRESHOLD = parseFloatEnv(process.env.SOLANA_GAS_THRESHOLD, 0.01);
const SOLANA_GAS_REFILL_AMOUNT_SOL = parseFloatEnv(process.env.SOLANA_GAS_REFILL_AMOUNT_SOL, 0.05);
const SOLANA_GAS_AUTO_REFILL = parseBoolean(process.env.SOLANA_GAS_AUTO_REFILL, false);
const SOLANA_GAS_FALLBACK_FEE_SOL = parseFloatEnv(process.env.SOLANA_GAS_FALLBACK_FEE_SOL, 0.000005);
const SOLANA_RPC_URLS = process.env.SOLANA_RPC_URLS || process.env.SOLANA_RPC_URL || '';
const SOLANA_RPC_CACHE_TTL_MS = parseIntEnv(process.env.SOLANA_RPC_CACHE_TTL_MS, 7000);
const SOLANA_RPC_CONCURRENCY_LIMIT = parseIntEnv(process.env.SOLANA_RPC_CONCURRENCY_LIMIT, 8);
const SOLANA_RPC_MAX_RETRY_CYCLES = parseIntEnv(process.env.SOLANA_RPC_MAX_RETRY_CYCLES, 2);
const SOLANA_RPC_REQUEST_TIMEOUT_MS = parseIntEnv(process.env.SOLANA_RPC_REQUEST_TIMEOUT_MS, 20000);
const BALANCE_SYNC_SIGNATURE_LIMIT = parseIntEnv(process.env.BALANCE_SYNC_SIGNATURE_LIMIT, 50);
const RECONCILIATION_INTERVAL_MS = parseIntEnv(process.env.RECONCILIATION_INTERVAL_MS, 5 * 60 * 1000);
const SOL_GAS_THRESHOLD = parseFloatEnv(process.env.SOL_GAS_THRESHOLD, 0.15);
const WITHDRAWAL_BROADCAST_ALERT_THRESHOLD_MINUTES = parseIntEnv(process.env.WITHDRAWAL_BROADCAST_ALERT_THRESHOLD_MINUTES, 30);
const DEPOSIT_DETECTOR_INTERVAL_MS = parseIntEnv(process.env.DEPOSIT_DETECTOR_INTERVAL_MS, 30 * 1000);
const BALANCE_SYNC_INTERVAL_MS = parseIntEnv(process.env.BALANCE_SYNC_INTERVAL_MS, 10 * 60 * 1000);
const WALLET_RETRY_INTERVAL_MS = parseIntEnv(process.env.WALLET_RETRY_INTERVAL_MS, 5 * 60 * 1000);
const AUTO_RUN_MIGRATIONS = parseBoolean(process.env.AUTO_RUN_MIGRATIONS, true);
const SEQUELIZE_SYNC = parseBoolean(process.env.SEQUELIZE_SYNC, false);
const SYSTEM_USER_EMAIL = process.env.SYSTEM_USER_EMAIL || '';

const REQUIRED_PRODUCTION_VARS = [
  'DATABASE_URL or SUPABASE_DATABASE_URL or LOCAL_DATABASE_URL',
  'JWT_SECRET',
  'SOLANA_RPC_URLS or SOLANA_RPC_URL',
];

const REQUIRED_VARS = [
  'JWT_SECRET',
];

function getMissingRequiredVars() {
  const missing = [];
  if (!DATABASE_URL) {
    missing.push('DATABASE_URL or SUPABASE_DATABASE_URL or LOCAL_DATABASE_URL');
  }
  if (!JWT_SECRET) {
    missing.push('JWT_SECRET');
  }
  if (RAMP_PROVIDER === 'kotani' && !KOTANI_API_KEY && !IS_DEVELOPMENT) {
    missing.push('KOTANI_API_KEY');
  }
  if (!SOLANA_RPC_URLS && !IS_DEVELOPMENT) {
    missing.push('SOLANA_RPC_URLS or SOLANA_RPC_URL');
  }
  return missing;
}

function validateRequiredEnvironment() {
  const missing = getMissingRequiredVars();
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    throw new Error(message);
  }
}

function getSolanaRpcUrls() {
  const urls = String(SOLANA_RPC_URLS).split(',').map((value) => value.trim()).filter(Boolean);
  if (urls.length === 0 && IS_DEVELOPMENT) {
    return ['https://api.mainnet-beta.solana.com'];
  }
  return urls;
}

export const Secrets = {
  NODE_ENV,
  IS_DEVELOPMENT,
  PORT,
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
  PRIVY_APP_ID,
  PRIVY_APP_SECRET,
  KOTANI_API_BASE,
  KOTANI_API_KEY,
  KOTANI_WEBHOOK_SECRET,
  FRONTEND_URL,
  RAMP_PROVIDER,
  SYSTEM_GAS_WALLET_ADDRESS,
  SYSTEM_GAS_WALLET_ENCRYPTED_KEY,
  SOLANA_GAS_TREASURY_PRIVATE_KEY,
  SOLANA_GAS_TREASURY_ADDRESS,
  SOLANA_GAS_THRESHOLD,
  SOLANA_GAS_REFILL_AMOUNT_SOL,
  SOLANA_GAS_AUTO_REFILL,
  SOLANA_RPC_URLS,
  SOLANA_RPC_CACHE_TTL_MS,
  SOLANA_RPC_CONCURRENCY_LIMIT,
  SOLANA_RPC_MAX_RETRY_CYCLES,
  SOLANA_RPC_REQUEST_TIMEOUT_MS,
  BALANCE_SYNC_SIGNATURE_LIMIT,
  RECONCILIATION_INTERVAL_MS,
  SOL_GAS_THRESHOLD,
  WITHDRAWAL_BROADCAST_ALERT_THRESHOLD_MINUTES,
  DEPOSIT_DETECTOR_INTERVAL_MS,
  BALANCE_SYNC_INTERVAL_MS,
  WALLET_RETRY_INTERVAL_MS,
  AUTO_RUN_MIGRATIONS,
  SEQUELIZE_SYNC,
  SYSTEM_USER_EMAIL,
  getSolanaRpcUrls,
  getMissingRequiredVars,
  validateRequiredEnvironment,
};

export default Secrets;
