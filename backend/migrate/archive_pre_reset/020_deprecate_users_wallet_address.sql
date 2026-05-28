-- Migration 020: Deprecate users.wallet_address as canonical source
BEGIN;

-- Drop unique constraint on users.wallet_address if present
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname ILIKE '%%wallet_address%%' LOOP
    RAISE NOTICE 'Dropping index %', idx.indexname;
    EXECUTE format('DROP INDEX IF EXISTS %I;', idx.indexname);
  END LOOP;
END$$;

-- Make wallet_address nullable and remove any NOT NULL constraint
ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL;

-- Optionally remove privy_wallet_id uniqueness or not; keep column for legacy/admin use.
-- Leave data in place for backfills; no runtime reads should rely on this field.

COMMIT;
