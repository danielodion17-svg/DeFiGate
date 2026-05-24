-- Enforce one permanent wallet per user and add wallet sync metadata

ALTER TABLE wallets
  ALTER COLUMN is_primary SET DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'wallets_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX wallets_user_id_unique ON wallets(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'wallets_address_unique'
  ) THEN
    CREATE UNIQUE INDEX wallets_address_unique ON wallets(address) WHERE address IS NOT NULL;
  END IF;
END $$;
