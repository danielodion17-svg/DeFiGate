-- Migration 001: Initial canonical schema
-- Baseline tables for users, wallets, transactions, and account_ledger.

BEGIN;

-- Identity table only (no wallet fields).
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  phone TEXT,
  company TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  email_verification_token TEXT,
  email_verified_at TIMESTAMP WITH TIME ZONE,
  kyc_status TEXT NOT NULL DEFAULT 'pending',
  preferred_chain TEXT NOT NULL DEFAULT 'solana',
  is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Canonical wallets table (one per user, wallets.address UNIQUE).
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'solana',
  provider_wallet_id TEXT,
  address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  encrypted_private_key TEXT,
  last_scanned_signature TEXT,
  last_scanned_at TIMESTAMP WITH TIME ZONE,
  last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user_id_unique ON wallets(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_address_unique ON wallets(address);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- Transaction types.
CREATE TYPE IF NOT EXISTS transaction_type AS ENUM ('deposit', 'transfer', 'withdrawal');
CREATE TYPE IF NOT EXISTS transaction_status AS ENUM (
  'pending',
  'pending_review',
  'approved',
  'broadcasting',
  'broadcasted',
  'confirmed',
  'completed',
  'failed',
  'rejected'
);

-- Immutable transaction log.
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  type transaction_type NOT NULL,
  amount DECIMAL(20, 6) NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDC',
  status transaction_status NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  recipient_address TEXT,
  idempotency_key TEXT,
  broadcasted_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  network_fee DECIMAL(20, 6) NOT NULL DEFAULT 0,
  reference_id TEXT,
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash_unique ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_id_unique ON transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);

-- Append-only account ledger (source of truth for balances).
CREATE TABLE IF NOT EXISTS account_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  asset TEXT NOT NULL DEFAULT 'USDC',
  entry_type TEXT NOT NULL DEFAULT 'ledger',
  amount DECIMAL(36, 18) NOT NULL,
  tx_hash TEXT,
  reference_id TEXT,
  transfer_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_account_ledger_tx_hash_asset ON account_ledger(tx_hash, asset) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_ledger_user ON account_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_wallet ON account_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_asset ON account_ledger(asset);

-- Derived balances cache (never canonical, rebuilt from account_ledger).
CREATE TABLE IF NOT EXISTS balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL DEFAULT 'USDC',
  available_balance DECIMAL(20, 6) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(20, 6) NOT NULL DEFAULT 0,
  is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_reason TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_balances_user_asset_unique ON balances(user_id, asset);

-- Immutable audit log.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  wallet_id UUID REFERENCES wallets(id),
  transaction_id UUID REFERENCES transactions(id),
  tx_hash TEXT,
  amount DECIMAL(36, 18),
  asset TEXT,
  metadata JSONB,
  request_id TEXT,
  before_state JSONB,
  after_state JSONB,
  severity TEXT NOT NULL DEFAULT 'info',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

COMMIT;
