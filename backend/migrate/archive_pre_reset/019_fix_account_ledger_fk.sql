-- Migration 019: Fix account_ledger.user_id foreign key to reference users(id)
BEGIN;

-- Find any foreign key constraints on account_ledger.user_id that reference balances(id) and drop them
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'account_ledger'
      AND kcu.column_name = 'user_id'
      AND ccu.table_name = 'balances'
  LOOP
    EXECUTE format('ALTER TABLE account_ledger DROP CONSTRAINT %I;', r.constraint_name);
  END LOOP;
END$$;

-- Ensure correct foreign key from account_ledger.user_id -> users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_account_ledger_user' AND table_name = 'account_ledger'
  ) THEN
    ALTER TABLE account_ledger ADD CONSTRAINT fk_account_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END$$;

COMMIT;
