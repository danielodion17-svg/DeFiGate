CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  provider TEXT NOT NULL, -- 'privy', 'local', 'safe'
  provider_wallet_id TEXT UNIQUE,

  address TEXT,
  chain TEXT, -- 'celo', 'ethereum', etc.

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
