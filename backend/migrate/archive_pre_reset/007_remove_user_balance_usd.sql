-- Remove legacy user-level fiat balance field.
-- The authoritative balance data lives in balances and ledger_entries.

ALTER TABLE users
  DROP COLUMN IF EXISTS balance_usd;
