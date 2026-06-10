-- Migration 002: Append-only triggers
-- Enforce immutability on account_ledger and audit_logs.

BEGIN;

-- Prevent updates and deletes on account_ledger.
CREATE OR REPLACE FUNCTION prevent_update_or_delete_account_ledger()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'account_ledger is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_ledger_prevent_update_delete ON account_ledger;
CREATE TRIGGER trg_account_ledger_prevent_update_delete
BEFORE UPDATE OR DELETE ON account_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete_account_ledger();

-- Prevent updates and deletes on audit_logs.
CREATE OR REPLACE FUNCTION prevent_update_or_delete_audit_logs()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_update_delete
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete_audit_logs();

COMMIT;
