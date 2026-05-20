-- Add user freeze support, withdrawal approval workflow fields, and audit metadata

-- Users: freeze fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- Transactions: workflow fields and foreign key
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recipient_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS broadcasted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS network_fee DECIMAL(20, 6) DEFAULT 0;

-- Add idempotency index
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_idempotency_key') THEN
    CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Add withdrawal address constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'check_withdrawal_address'
                   AND table_name = 'transactions') THEN
    ALTER TABLE transactions ADD CONSTRAINT check_withdrawal_address
      CHECK ((type = 'withdrawal' AND recipient_address IS NOT NULL) OR (type != 'withdrawal' AND recipient_address IS NULL));
  END IF;
END $$;

-- Add transaction status check extension for approval workflow
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='transactions' AND column_name='status') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                   WHERE constraint_name = 'transactions_status_check') THEN
      ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
        CHECK (status IN ('pending','pending_review','approved','broadcasting','broadcasted','confirmed','completed','failed','rejected'));
    ELSE
      ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
      ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
        CHECK (status IN ('pending','pending_review','approved','broadcasting','broadcasted','confirmed','completed','failed','rejected'));
    END IF;
  END IF;
END $$;

-- Audit logs metadata columns
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS before_state JSONB,
  ADD COLUMN IF NOT EXISTS after_state JSONB,
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info';

-- Ensure audit log indexes exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_request_id') THEN
    CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
  END IF;
END $$;
