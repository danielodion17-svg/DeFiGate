-- Ensure transaction hashes are unique to prevent duplicate deposit processing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'unique_transaction_hash'
                   AND table_name = 'transactions') THEN
        ALTER TABLE transactions ADD CONSTRAINT unique_transaction_hash UNIQUE (tx_hash);
    END IF;
END $$;
