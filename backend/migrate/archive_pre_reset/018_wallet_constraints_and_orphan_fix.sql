-- Migration: enforce wallet constraints and archive duplicate wallets
BEGIN;

-- Archive duplicate wallet rows for the same user, keeping the oldest primary wallet.
WITH ranked_by_user AS (
  SELECT w.*, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY is_primary DESC, created_at ASC, id ASC
  ) AS rn
  FROM wallets w
)
INSERT INTO archived_wallets (
  wallet_id,
  user_id,
  provider,
  provider_wallet_id,
  address,
  chain,
  is_primary,
  encrypted_private_key,
  created_at,
  updated_at,
  archived_at,
  archived_reason,
  metadata
)
SELECT
  id,
  user_id,
  provider,
  provider_wallet_id,
  address,
  chain,
  is_primary,
  encrypted_private_key,
  created_at,
  updated_at,
  NOW(),
  'duplicate wallet archiving',
  jsonb_build_object('migration', '018_wallet_constraints_and_orphan_fix', 'rank', rn)
FROM ranked_by_user
WHERE rn > 1;

WITH ranked_by_user AS (
  SELECT w.*, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY is_primary DESC, created_at ASC, id ASC
  ) AS rn
  FROM wallets w
)
DELETE FROM wallets
WHERE id IN (
  SELECT id FROM ranked_by_user WHERE rn > 1
);

-- Archive duplicate wallet rows for the same address across users, keeping the first user/primary wallet.
WITH ranked_by_address AS (
  SELECT w.*, ROW_NUMBER() OVER (
    PARTITION BY address
    ORDER BY (user_id IS NULL) ASC, is_primary DESC, created_at ASC, id ASC
  ) AS rn
  FROM wallets w
  WHERE address IS NOT NULL
)
INSERT INTO archived_wallets (
  wallet_id,
  user_id,
  provider,
  provider_wallet_id,
  address,
  chain,
  is_primary,
  encrypted_private_key,
  created_at,
  updated_at,
  archived_at,
  archived_reason,
  metadata
)
SELECT
  id,
  user_id,
  provider,
  provider_wallet_id,
  address,
  chain,
  is_primary,
  encrypted_private_key,
  created_at,
  updated_at,
  NOW(),
  'duplicate address archiving',
  jsonb_build_object('migration', '018_wallet_constraints_and_orphan_fix', 'rank', rn)
FROM ranked_by_address
WHERE rn > 1;

WITH ranked_by_address AS (
  SELECT w.*, ROW_NUMBER() OVER (
    PARTITION BY address
    ORDER BY (user_id IS NULL) ASC, is_primary DESC, created_at ASC, id ASC
  ) AS rn
  FROM wallets w
  WHERE address IS NOT NULL
)
DELETE FROM wallets
WHERE id IN (
  SELECT id FROM ranked_by_address WHERE rn > 1
);

-- Attach the orphan wallet address to the correct user if the wallet is unowned or incorrectly owned.
UPDATE wallets w
SET user_id = '0ccbf88a-ea77-4f83-a2c5-22bf5b21dc27'
WHERE w.address = 'J8hbXzvmLrqTZ57TEwyCsqW3sagWJwkcDrP7nueSN1He'
  AND (w.user_id IS NULL OR w.user_id <> '0ccbf88a-ea77-4f83-a2c5-22bf5b21dc27')
  AND NOT EXISTS (
    SELECT 1 FROM wallets w2
    WHERE w2.user_id = '0ccbf88a-ea77-4f83-a2c5-22bf5b21dc27'
      AND w2.address = w.address
      AND w2.id <> w.id
  );

-- Ensure canonical uniqueness constraints are present.
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_unique ON wallets (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_address_unique ON wallets (address);

DROP INDEX IF EXISTS wallets_user_chain_unique;

COMMIT;
