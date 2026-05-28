-- Add wallet checkpointing for efficient deposit scanning
-- Migration: 011_add_wallet_checkpointing.sql

-- Add checkpoint columns to wallets table
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS last_scanned_signature TEXT,
ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_wallets_last_scanned_at 
ON wallets(last_scanned_at) 
WHERE last_scanned_at IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN wallets.last_scanned_signature IS 'Signature of the last processed transaction to avoid re-scanning';
COMMENT ON COLUMN wallets.last_scanned_at IS 'Timestamp of last successful scan for this wallet';
