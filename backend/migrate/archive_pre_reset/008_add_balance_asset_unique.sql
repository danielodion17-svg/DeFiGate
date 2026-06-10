-- Add asset support and stronger balance constraints to balances
ALTER TABLE balances
  ADD COLUMN IF NOT EXISTS asset VARCHAR(50) NOT NULL DEFAULT 'USDC';

UPDATE balances
  SET asset = 'USDC'
  WHERE asset IS NULL;

ALTER TABLE balances
  DROP CONSTRAINT IF EXISTS balances_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_asset'
  ) THEN
    ALTER TABLE balances ADD CONSTRAINT unique_user_asset UNIQUE (user_id, asset);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_available_balance_nonnegative'
  ) THEN
    ALTER TABLE balances ADD CONSTRAINT chk_available_balance_nonnegative CHECK (available_balance >= 0);
  END IF;
END$$;
