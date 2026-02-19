-- SQL (Postgres) migrations for DeFiGate schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  privy_wallet_id TEXT,
  kyc_status TEXT DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'active',
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_wallet_id TEXT UNIQUE,
  address TEXT,
  chain TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  provider_payment_id TEXT,
  amount_fiat NUMERIC(18,2),
  currency CHAR(3) DEFAULT 'NGN',
  status TEXT DEFAULT 'init',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crypto_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id),
  user_id UUID REFERENCES users(id),
  amount_crypto NUMERIC(36,18),
  crypto_symbol VARCHAR(20),
  target_chain VARCHAR(50),
  status TEXT DEFAULT 'queued',
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
