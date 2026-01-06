-- SQL (Postgres) migrations for DeFiGate minimal schema
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  privy_wallet_id VARCHAR(255),
  kyc_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  provider_payment_id VARCHAR(255),
  amount_fiat NUMERIC(18,2),
  currency CHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'init',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crypto_jobs (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER REFERENCES payments(id),
  user_id INTEGER REFERENCES users(id),
  amount_crypto NUMERIC(36,18),
  crypto_symbol VARCHAR(20),
  target_chain VARCHAR(50),
  status VARCHAR(20) DEFAULT 'queued',
  tx_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT now()
);
