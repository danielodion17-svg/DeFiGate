-- Add support fields for email verification and encrypted local wallets

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS preferred_chain TEXT DEFAULT 'celo';

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
