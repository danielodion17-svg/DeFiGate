-- Complete Database Schema for My-DeFiGate
-- Generated from Sequelize models
-- Tables: users, balances, wallets, transactions, transfers

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    wallet_address VARCHAR(255),
    phone VARCHAR(255),
    company VARCHAR(255),
    is_verified BOOLEAN DEFAULT true,
    email_verification_token VARCHAR(255),
    email_verified_at TIMESTAMP WITH TIME ZONE,
    kyc_status VARCHAR(255) DEFAULT 'pending',
    preferred_chain VARCHAR(255) DEFAULT 'solana',
    privy_wallet_id VARCHAR(255),
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_reason TEXT,
    status VARCHAR(255) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Balances table
CREATE TABLE IF NOT EXISTS balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset VARCHAR(50) NOT NULL DEFAULT 'USDC',
    available_balance DECIMAL(20, 6) DEFAULT 0,
    pending_balance DECIMAL(20, 6) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_asset UNIQUE (user_id, asset),
    CONSTRAINT chk_available_balance_nonnegative CHECK (available_balance >= 0)
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(255) NOT NULL,
    provider_wallet_id VARCHAR(255),
    address VARCHAR(255),
    chain VARCHAR(255),
    encrypted_private_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL CHECK (type IN ('deposit', 'transfer', 'withdrawal')),
    amount DECIMAL(20, 6) NOT NULL,
    asset VARCHAR(50) DEFAULT 'USDC',
    status VARCHAR(255) DEFAULT 'pending' CHECK (status IN ('pending', 'pending_review', 'approved', 'broadcasting', 'broadcasted', 'confirmed', 'completed', 'failed', 'rejected')),
    tx_hash VARCHAR(255),
    recipient_address TEXT,
    wallet_id UUID REFERENCES wallets(id),
    idempotency_key TEXT,
    broadcasted_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    network_fee DECIMAL(20, 6) DEFAULT 0,
    reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_transaction_hash UNIQUE (tx_hash)
);

-- Ledger entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    debit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
    credit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
    amount DECIMAL(20, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id),
    wallet_id UUID REFERENCES wallets(id),
    transaction_id UUID REFERENCES transactions(id),
    tx_hash VARCHAR(200),
    amount DECIMAL(36, 18),
    asset VARCHAR(20),
    metadata JSONB,
    request_id VARCHAR(100),
    before_state JSONB,
    after_state JSONB,
    severity VARCHAR(20) DEFAULT 'info',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tx_hash ON audit_logs(tx_hash);

-- Transfers table
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(20, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_balances_user_id ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_id ON transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_transfers_receiver_id ON transfers(receiver_id);

-- Add constraints to prevent self-transfers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'check_sender_receiver_different'
                   AND table_name = 'transfers') THEN
        ALTER TABLE transfers ADD CONSTRAINT check_sender_receiver_different
            CHECK (sender_id != receiver_id);
    END IF;
END $$;