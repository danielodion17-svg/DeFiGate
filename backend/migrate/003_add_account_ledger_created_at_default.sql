-- Migration: 003_add_account_ledger_created_at_default.sql
-- Ensure account_ledger rows always receive a created_at timestamp.

ALTER TABLE account_ledger
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE account_ledger
  SET created_at = NOW()
  WHERE created_at IS NULL;
