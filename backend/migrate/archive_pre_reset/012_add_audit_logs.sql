-- Add audit logs table for compliance and debugging
-- Migration: 012_add_audit_logs.sql

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id),
    wallet_id UUID REFERENCES wallets(id),
    transaction_id UUID REFERENCES transactions(id),
    tx_hash VARCHAR(200),
    amount DECIMAL(36,18),
    asset VARCHAR(20),
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tx_hash ON audit_logs(tx_hash);

-- Comments for clarity
COMMENT ON TABLE audit_logs IS 'Audit trail for all financial operations and sensitive actions';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (deposit_detected, transfer_initiated, withdrawal_broadcasted, etc.)';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context data as JSON';