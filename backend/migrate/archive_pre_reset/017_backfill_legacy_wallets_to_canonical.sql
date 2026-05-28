-- Backfill canonical wallets from legacy user wallet fields
-- This establishes the wallets table as the only canonical wallet source.

INSERT INTO wallets (id, user_id, provider, provider_wallet_id, address, chain, created_at, updated_at, is_primary)
SELECT
  gen_random_uuid(),
  u.id,
  CASE WHEN u.privy_wallet_id IS NOT NULL THEN 'privy' ELSE 'legacy' END,
  u.privy_wallet_id,
  u.wallet_address,
  COALESCE(u.preferred_chain, 'solana'),
  NOW(),
  NOW(),
  true
FROM users u
WHERE (u.wallet_address IS NOT NULL OR u.privy_wallet_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM wallets w WHERE w.user_id = u.id
  );

-- Normalize any existing canonical wallets to have a primary wallet per user.
UPDATE wallets
SET is_primary = true
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
    FROM wallets
  ) t
  WHERE t.rn = 1
);
