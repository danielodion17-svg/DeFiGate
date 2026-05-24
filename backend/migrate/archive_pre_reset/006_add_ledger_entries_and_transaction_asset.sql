-- Add transfer ledger entries and transaction asset auditing

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS asset VARCHAR(50) DEFAULT 'USDC';

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  debit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
  credit_account_id UUID NOT NULL REFERENCES balances(id) ON DELETE CASCADE,
  amount DECIMAL(20, 6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit_account ON ledger_entries(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit_account ON ledger_entries(credit_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_unique
  ON transactions(reference, user_id, type)
  WHERE reference IS NOT NULL;
