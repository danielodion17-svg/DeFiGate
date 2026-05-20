-- Migration: 015_harden_financial_constraints.sql

-- Unique tx_hash index already exists in schema, add safety guard if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_tx_hash_unique') THEN
    CREATE UNIQUE INDEX idx_transactions_tx_hash_unique ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
  END IF;
END $$;

-- Add append-only protections for account_ledger and audit_logs
CREATE OR REPLACE FUNCTION prevent_update_or_delete_account_ledger()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'account_ledger is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_account_ledger_prevent_update_delete
BEFORE UPDATE OR DELETE ON account_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete_account_ledger();

CREATE OR REPLACE FUNCTION prevent_update_or_delete_audit_logs()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_audit_logs_prevent_update_delete
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete_audit_logs();

-- Enforce foreign key integrity on audit log references explicitly
ALTER TABLE audit_logs
  ADD CONSTRAINT IF NOT EXISTS fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT IF NOT EXISTS fk_audit_logs_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE SET NULL,
  ADD CONSTRAINT IF NOT EXISTS fk_audit_logs_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;

-- Add foreign key support for account_ledger to balances
ALTER TABLE account_ledger
  ADD CONSTRAINT IF NOT EXISTS fk_account_ledger_debit_balance FOREIGN KEY (debit_account_id) REFERENCES balances(id) ON DELETE CASCADE,
  ADD CONSTRAINT IF NOT EXISTS fk_account_ledger_credit_balance FOREIGN KEY (credit_account_id) REFERENCES balances(id) ON DELETE CASCADE;

-- Ensure transaction reference_id uniqueness protection
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_reference_id_unique') THEN
    CREATE UNIQUE INDEX idx_transactions_reference_id_unique ON transactions(reference_id) WHERE reference_id IS NOT NULL;
  END IF;
END $$;
