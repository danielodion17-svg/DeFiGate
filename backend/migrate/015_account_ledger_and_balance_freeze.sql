-- Add immutable account ledger and balance freeze fields

ALTER TABLE balances
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

CREATE TABLE IF NOT EXISTS account_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  asset TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'adjustment', 'reconciliation')),
  amount NUMERIC(20,6) NOT NULL,
  tx_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_ledger_user_asset ON account_ledger(user_id, asset);
CREATE INDEX IF NOT EXISTS idx_account_ledger_wallet_id ON account_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_tx_hash ON account_ledger(tx_hash);
