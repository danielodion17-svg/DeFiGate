-- Migration: 014_add_account_ledger_and_archived_wallets.sql

-- Add primary and archive metadata to wallets
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE wallets
ALTER COLUMN is_primary SET DEFAULT false;
ALTER TABLE wallets
ALTER COLUMN is_archived SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wallets_is_primary ON wallets(is_primary);
CREATE INDEX IF NOT EXISTS idx_wallets_is_archived ON wallets(is_archived);

-- Add optional reference_id to transactions for audit and canonical reconciliation
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reference_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_id_unique ON transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Add account ledger canonical table
CREATE TABLE IF NOT EXISTS account_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES wallets(id),
    asset VARCHAR(50) NOT NULL DEFAULT 'USDC',
    debit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
    credit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
    amount DECIMAL(36, 18) NOT NULL,
    entry_type VARCHAR(100) NOT NULL DEFAULT 'ledger',
    reference_id TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'account_ledger'
      AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'account_ledger'
      AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE account_ledger RENAME COLUMN type TO entry_type;
  END IF;
END$$;

ALTER TABLE account_ledger
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id),
  ADD COLUMN IF NOT EXISTS asset VARCHAR(50) NOT NULL DEFAULT 'USDC',
  ADD COLUMN IF NOT EXISTS debit_account_id UUID REFERENCES balances(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES balances(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(36, 18) NOT NULL,
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(100) NOT NULL DEFAULT 'ledger',
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_account_ledger_transaction ON account_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_user ON account_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_wallet ON account_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_asset ON account_ledger(asset);

-- Add archived wallets table for safe duplicate cleanup
CREATE TABLE IF NOT EXISTS archived_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL,
    user_id UUID,
    provider VARCHAR(255),
    provider_wallet_id VARCHAR(255),
    address VARCHAR(255),
    chain VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    encrypted_private_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_reason TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_archived_wallets_wallet_id ON archived_wallets(wallet_id);
CREATE INDEX IF NOT EXISTS idx_archived_wallets_user_id ON archived_wallets(user_id);

-- Mark legacy ledger entries as deprecated when migrated
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_is_deprecated ON ledger_entries(is_deprecated);
