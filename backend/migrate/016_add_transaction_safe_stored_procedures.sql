-- Migration: 016_add_transaction_safe_stored_procedures.sql

-- Ensure UUID generation extensions are available for function and default values.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add idempotency columns to the account_ledger table.
ALTER TABLE account_ledger
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

-- Allow reserve/release ledger entry types.
ALTER TABLE account_ledger DROP CONSTRAINT IF EXISTS account_ledger_type_check;
ALTER TABLE account_ledger
  ADD CONSTRAINT account_ledger_type_check
  CHECK (type IN ('deposit', 'withdrawal', 'adjustment', 'reconciliation', 'reserve', 'release'));

-- Idempotency and concurrency-safe indexes for ledger entries.
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_ledger_tx_hash_asset ON account_ledger(tx_hash, asset) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_ledger_reference_id ON account_ledger(reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_ledger_transfer_user_type ON account_ledger(transfer_id, user_id, type) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_ledger_transfer_id ON account_ledger(transfer_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_reference_id ON account_ledger(reference_id);

-- Helper: ensure a balance row exists and lock it before mutation.
CREATE OR REPLACE FUNCTION ensure_balance_row(p_user_id UUID, p_asset TEXT)
RETURNS balances AS $$
DECLARE
  account_row balances%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
BEGIN
  INSERT INTO balances(user_id, asset, available_balance, pending_balance, updated_at)
  VALUES (p_user_id, normalized_asset, 0, 0, NOW())
  ON CONFLICT (user_id, asset) DO NOTHING;

  SELECT * INTO account_row
  FROM balances
  WHERE user_id = p_user_id AND asset = normalized_asset
  FOR UPDATE;

  RETURN account_row;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION credit_account(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_wallet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  account_row.available_balance := account_row.available_balance + p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET available_balance = account_row.available_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_user_id, p_wallet_id, normalized_asset, 'deposit', p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, wallet_id, transaction_id, tx_hash, amount, asset, metadata, created_at)
  VALUES ('deposit', p_user_id, p_wallet_id, p_transaction_id, p_tx_hash, p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION debit_account(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_wallet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  IF account_row.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  account_row.available_balance := account_row.available_balance - p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET available_balance = account_row.available_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_user_id, p_wallet_id, normalized_asset, 'withdrawal', -p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, wallet_id, transaction_id, tx_hash, amount, asset, metadata, created_at)
  VALUES ('withdrawal', p_user_id, p_wallet_id, p_transaction_id, p_tx_hash, -p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION adjust_account(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_wallet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  IF account_row.available_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  account_row.available_balance := account_row.available_balance + p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET available_balance = account_row.available_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_user_id, p_wallet_id, normalized_asset, 'adjustment', p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, wallet_id, transaction_id, tx_hash, amount, asset, metadata, created_at)
  VALUES ('adjustment', p_user_id, p_wallet_id, p_transaction_id, p_tx_hash, p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_funds(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  IF account_row.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  account_row.available_balance := account_row.available_balance - p_amount;
  account_row.pending_balance := account_row.pending_balance + p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET available_balance = account_row.available_balance,
      pending_balance = account_row.pending_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, asset, type, amount, metadata, created_at
  ) VALUES (
    p_user_id, normalized_asset, 'reserve', -p_amount, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, transaction_id, amount, asset, metadata, created_at)
  VALUES ('reserve_funds', p_user_id, p_transaction_id, -p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_funds(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  IF account_row.pending_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_PENDING_FUNDS';
  END IF;

  account_row.available_balance := account_row.available_balance + p_amount;
  account_row.pending_balance := account_row.pending_balance - p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET available_balance = account_row.available_balance,
      pending_balance = account_row.pending_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, asset, type, amount, metadata, created_at
  ) VALUES (
    p_user_id, normalized_asset, 'release', p_amount, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, transaction_id, amount, asset, metadata, created_at)
  VALUES ('release_funds', p_user_id, p_transaction_id, p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION commit_reserved_funds(
  p_user_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_wallet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  account_row balances%ROWTYPE;
  ledger_row account_ledger%ROWTYPE;
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  audit_payload JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  account_row := ensure_balance_row(p_user_id, normalized_asset);
  IF account_row.pending_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_PENDING_FUNDS';
  END IF;

  account_row.pending_balance := account_row.pending_balance - p_amount;
  account_row.updated_at := NOW();

  UPDATE balances
  SET pending_balance = account_row.pending_balance,
      updated_at = account_row.updated_at
  WHERE id = account_row.id;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_user_id, p_wallet_id, normalized_asset, 'withdrawal', -p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO ledger_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id
  );

  INSERT INTO audit_logs(action, user_id, wallet_id, transaction_id, tx_hash, amount, asset, metadata, created_at)
  VALUES ('commit_reserved_funds', p_user_id, p_wallet_id, p_transaction_id, p_tx_hash, -p_amount, normalized_asset, audit_payload, NOW());

  RETURN jsonb_build_object('account', row_to_json(account_row), 'ledger_entry', row_to_json(ledger_row));
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION transfer_funds(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_amount NUMERIC,
  p_asset TEXT DEFAULT 'USDC',
  p_wallet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_audit_actor_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  normalized_asset TEXT := UPPER(COALESCE(TRIM(p_asset), 'USDC'));
  sender_account balances%ROWTYPE;
  receiver_account balances%ROWTYPE;
  debit_row account_ledger%ROWTYPE;
  credit_row account_ledger%ROWTYPE;
  existing_entries JSONB;
  audit_payload JSONB;
BEGIN
  IF p_sender_id IS NULL OR p_receiver_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARTIES';
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'SELF_TRANSFER_NOT_ALLOWED';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF p_transfer_id IS NOT NULL THEN
    SELECT jsonb_agg(row_to_json(al)) INTO existing_entries
    FROM account_ledger al
    WHERE al.transfer_id = p_transfer_id;
    IF existing_entries IS NOT NULL THEN
      RETURN jsonb_build_object('existing_entries', existing_entries, 'idempotent', true);
    END IF;
  END IF;

  IF p_reference_id IS NOT NULL THEN
    SELECT jsonb_agg(row_to_json(al)) INTO existing_entries
    FROM account_ledger al
    WHERE al.reference_id = p_reference_id;
    IF existing_entries IS NOT NULL THEN
      RETURN jsonb_build_object('existing_entries', existing_entries, 'idempotent', true);
    END IF;
  END IF;

  IF p_tx_hash IS NOT NULL THEN
    SELECT jsonb_agg(row_to_json(al)) INTO existing_entries
    FROM account_ledger al
    WHERE al.tx_hash = p_tx_hash AND al.asset = normalized_asset;
    IF existing_entries IS NOT NULL THEN
      RETURN jsonb_build_object('existing_entries', existing_entries, 'idempotent', true);
    END IF;
  END IF;

  sender_account := ensure_balance_row(p_sender_id, normalized_asset);
  receiver_account := ensure_balance_row(p_receiver_id, normalized_asset);

  IF sender_account.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  sender_account.available_balance := sender_account.available_balance - p_amount;
  sender_account.updated_at := NOW();
  receiver_account.available_balance := receiver_account.available_balance + p_amount;
  receiver_account.updated_at := NOW();

  UPDATE balances
  SET available_balance = sender_account.available_balance,
      updated_at = sender_account.updated_at
  WHERE id = sender_account.id;

  UPDATE balances
  SET available_balance = receiver_account.available_balance,
      updated_at = receiver_account.updated_at
  WHERE id = receiver_account.id;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_sender_id, p_wallet_id, normalized_asset, 'withdrawal', -p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO debit_row;

  INSERT INTO account_ledger(
    user_id, wallet_id, asset, type, amount,
    tx_hash, reference_id, transfer_id, metadata, created_at
  ) VALUES (
    p_receiver_id, p_wallet_id, normalized_asset, 'deposit', p_amount,
    p_tx_hash, p_reference_id, p_transfer_id, p_metadata, NOW()
  ) RETURNING * INTO credit_row;

  audit_payload := jsonb_build_object(
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'audit_actor_id', p_audit_actor_id,
    'transaction_id', p_transaction_id,
    'sender_id', p_sender_id,
    'receiver_id', p_receiver_id
  );

  INSERT INTO audit_logs(action, user_id, transaction_id, tx_hash, amount, asset, metadata, created_at)
  VALUES ('transfer_confirmed', p_sender_id, p_transaction_id, p_tx_hash, p_amount, normalized_asset, audit_payload, NOW());

  IF p_transaction_id IS NOT NULL THEN
    UPDATE transactions
    SET status = 'completed', confirmed_at = NOW()
    WHERE id = p_transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'sender_account', row_to_json(sender_account),
    'receiver_account', row_to_json(receiver_account),
    'debit_entry', row_to_json(debit_row),
    'credit_entry', row_to_json(credit_row)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;
