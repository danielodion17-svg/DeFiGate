# Canonical Architecture Rebuild - Quick Reference

## Status: ✅ COMPLETE

The DeFiGate backend has been rebuilt from scratch with a clean canonical financial architecture on a new empty Supabase database.

---

## Key Changes at a Glance

### Database
- **Migrations:** 2 clean, logical phases (was 21+ legacy migrations)
  - `001_initial_schema.sql` - Tables & indexes
  - `002_append_only_triggers.sql` - Immutability enforcement
- **Schema:** 6 canonical tables (users, wallets, transactions, account_ledger, balances, audit_logs)
- **No legacy fields:** wallet_address and privy_wallet_id removed

### Code
- **Models:** 6 canonical (was 11, removed Transfer/LedgerEntry/ArchivedWallet)
- **Services:** 12 active (was 16, removed 4 dead services)
- **Controllers:** All updated to use canonical paths
- **Startup:** Added schema validation on server start

### Guarantees
- ✅ One wallet per user (enforced by unique index)
- ✅ Wallet address uniqueness (enforced by unique index)
- ✅ Append-only ledger (triggers prevent UPDATE/DELETE)
- ✅ Idempotent deposits (unique tx_hash index + runtime check)
- ✅ No direct balance mutations (only through balanceService)
- ✅ Address-based wallet resolution only (no user.wallet_address fallback)

---

## Critical Files

### Migrations
- [001_initial_schema.sql](migrate/001_initial_schema.sql)
- [002_append_only_triggers.sql](migrate/002_append_only_triggers.sql)

### Models (Canonical Only)
- User.js - Identity only
- Wallet.js - Canonical ownership
- Transaction.js - Immutable records
- AccountLedger.js - Append-only source of truth
- Account.js - Maps to balances (derived cache)
- AuditLog.js - Immutable audit trail

### Key Services
- **walletService.js** - `createPrivyWalletForUser()` is the ONLY wallet creation entry point
- **depositService.js** - `processDeposit()` is idempotent and is the ONLY deposit entry point
- **balanceService.js** - `creditAccount()` and `debitAccount()` are the ONLY balance mutation entry points

### Startup Validation
- [scripts/startupValidation.js](scripts/startupValidation.js) - Validates env vars and schema integrity
- Integrated into server.js startup sequence

### Documentation
- [CANONICAL_ARCHITECTURE_VERIFICATION.md](CANONICAL_ARCHITECTURE_VERIFICATION.md) - Full verification report

---

## Runtime Rules

### ✅ ALLOWED
- Create wallets through `createPrivyWalletForUser()`
- Process deposits through `depositService.processDeposit()`
- Manage balances through `balanceService`
- Resolve wallets by address using `walletService.resolveWallet()`
- Query balances from cache (read-only)

### ❌ NOT ALLOWED
- Directly mutate balances table
- Create wallets outside `createPrivyWalletForUser()`
- Process deposits without going through `depositService`
- Resolve wallets by `users.wallet_address` or `users.privy_wallet_id`
- UPDATE or DELETE from `account_ledger` or `audit_logs` (triggers prevent)
- Create duplicate wallet addresses (unique constraint)

---

## Deployment

### Pre-Deployment
1. Create new empty Supabase database
2. Set environment variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_ANON_KEY
3. Run migrations (001, 002)
4. Start server (validation runs automatically)

### Health Check
```bash
curl http://localhost:5000/api/health
# Expected: {"ok": true, "service": "DeFiGate API", "timestamp": "..."}
```

### Verify Schema
Check startup logs for:
```
✅ All required environment variables present
✅ All 6 canonical tables present
✅ All N canonical indexes present
✅ All 2 append-only triggers present
✅ No legacy wallet fields in users table
✅ All startup validations passed
```

---

## Statistics

| Category | Before | After |
|----------|--------|-------|
| Migrations | 21+ | 2 |
| Models | 11 | 6 |
| Services | 16 | 12 |
| Dead Code | ~40% | 0% |
| Legacy Fields | 2 | 0 |
| Wallet Creation Paths | 3 | 1 |
| Lines of Setup Logic | ~200 | ~50 |

---

## Questions?

Refer to [CANONICAL_ARCHITECTURE_VERIFICATION.md](CANONICAL_ARCHITECTURE_VERIFICATION.md) for detailed sections on:
- Architecture compliance
- Schema validation
- Runtime rules enforcement
- Idempotency guarantees
- Deployment checklist
