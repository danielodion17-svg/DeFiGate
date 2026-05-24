-- Add withdrawal state machine and idempotency support
-- Migration: 010_add_withdrawal_state_machine.sql

-- First, alter the enum type to include new status values
DO $$
BEGIN
    -- Add new enum values if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'enum_transactions_status'
                   AND e.enumlabel = 'broadcasted') THEN
        ALTER TYPE enum_transactions_status ADD VALUE 'broadcasted';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e
                   JOIN pg_type t ON e.enumtypid = t.oid
                   WHERE t.typname = 'enum_transactions_status'
                   AND e.enumlabel = 'confirmed') THEN
        ALTER TYPE enum_transactions_status ADD VALUE 'confirmed';
    END IF;
END $$;

-- Drop existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'transactions_status_check'
               AND table_name = 'transactions') THEN
        ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
    END IF;
END $$;

-- Add idempotency key and additional fields for withdrawal state machine
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS broadcasted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_address TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS network_fee DECIMAL(20, 6) DEFAULT 0;

-- Add unique constraint on idempotency_key if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'transactions_idempotency_key_key'
                   AND table_name = 'transactions') THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_idempotency_key_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- Create index for idempotency key lookups (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_idempotency_key') THEN
        CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

-- Create index for status-based queries (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_status_updated') THEN
        CREATE INDEX idx_transactions_status_updated ON transactions(status, created_at DESC);
    END IF;
END $$;

-- Add constraint to ensure only withdrawals have recipient_address (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'check_withdrawal_address'
                   AND table_name = 'transactions') THEN
        ALTER TABLE transactions ADD CONSTRAINT check_withdrawal_address
            CHECK ((type = 'withdrawal' AND recipient_address IS NOT NULL) OR (type != 'withdrawal' AND recipient_address IS NULL));
    END IF;
END $$;