-- Migration: enforce wallet constraints and attach orphan wallet

-- Remove duplicate wallet rows for the same user, keeping the oldest primary wallet.
WITH ranked_by_user AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY is_primary DESC, created_at ASC, id ASC
         ) AS rn
  FROM wallets
)
DELETE FROM wallets
WHERE id IN (SELECT id FROM ranked_by_user WHERE rn > 1);

-- Remove duplicate wallet rows for the same address, keeping the first one with a user_id when possible.
WITH ranked_by_address AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY address
           ORDER BY (user_id IS NULL) ASC, is_primary DESC, created_at ASC, id ASC
         ) AS rn
  FROM wallets
  WHERE address IS NOT NULL
)
DELETE FROM wallets
WHERE id IN (SELECT id FROM ranked_by_address WHERE rn > 1);

-- Attach the orphan wallet address to the correct user if we can identify the user from users.wallet_address.
UPDATE wallets w
SET user_id = u.id
FROM users u
WHERE w.user_id IS NULL
  AND w.address = 'J8hbXzvmLrqTZ57TEwyCsqW3sagWJwkcDrP7nueSN1He'
  AND u.wallet_address = w.address;

-- Clean up legacy unique index and rely on existing wallet uniqueness migration.
DROP INDEX IF EXISTS wallets_user_chain_unique;
