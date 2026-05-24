-- Migration 021: Strengthen deposit pipeline uniqueness constraints and wallet mapping safety

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_tx_hash_unique') THEN
    CREATE UNIQUE INDEX idx_transactions_tx_hash_unique ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'wallets_address_unique') THEN
    CREATE UNIQUE INDEX wallets_address_unique ON wallets(address) WHERE address IS NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_account_ledger_tx_hash_asset') THEN
    CREATE UNIQUE INDEX ux_account_ledger_tx_hash_asset ON account_ledger(tx_hash, asset) WHERE tx_hash IS NOT NULL;
  END IF;
END $$;
