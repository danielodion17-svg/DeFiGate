-- Add wallet persistence fields and enforce one wallet per user-chain

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'wallets_user_chain_unique'
  ) THEN
    CREATE UNIQUE INDEX wallets_user_chain_unique ON wallets(user_id, chain);
  END IF;
END $$;
