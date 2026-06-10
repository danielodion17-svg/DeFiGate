-- Migration 004: System gas wallet and gas treasury support

BEGIN;

CREATE TABLE IF NOT EXISTS system_gas_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL DEFAULT 'system_gas',
  address TEXT NOT NULL UNIQUE,
  encrypted_private_key TEXT,
  external_signer BOOLEAN NOT NULL DEFAULT FALSE,
  current_balance DECIMAL(20, 9) NOT NULL DEFAULT 0,
  last_refilled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_gas_wallets_purpose_unique ON system_gas_wallets(purpose);

COMMIT;
