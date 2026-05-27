// routes/admin.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireSupport } from '../middleware/requireSupport.js';
import * as admin from '../controllers/adminController.js';

const router = express.Router();

router.use(authenticate);

// Admin-only routes
router.post('/reconcile', requireRole('admin'), admin.reconcile);
router.post('/reconcile/:walletId', requireRole('admin'), admin.reconcileWallet);
router.post('/deposits/reprocess', requireRole('admin'), admin.reprocessDeposit);
router.post('/balances/adjust', requireRole('admin'), admin.adjustUserBalance);
router.get('/audit-logs', requireRole('admin'), admin.getAuditLogsEndpoint);
router.get('/dashboard', requireRole('admin'), admin.getAdminDashboard);
router.get('/wallet-health', requireRole('admin'), admin.getWalletHealth);
router.get('/transactions', requireRole('admin'), admin.getTransactions);
router.post('/transactions/:transactionId/retry', requireRole('admin'), admin.retryTransaction);
router.get('/forensic-report', requireRole('admin'), admin.getForensicReport);
router.post('/archive-duplicate-wallets', requireRole('admin'), admin.archiveDuplicateWalletsController);
router.post('/backfill-wallet-relations', requireRole('admin'), admin.backfillWalletRelations);
router.post('/rebuild-balances', requireRole('admin'), admin.rebuildBalances);
router.post('/repair-wallet/:walletId', requireRole('admin'), admin.repairWalletEndpoint);
router.post('/scan-wallet-history/:walletId', requireRole('admin'), admin.scanWalletHistory);
router.post('/migrate-legacy-ledger', requireRole('admin'), admin.migrateLegacyLedger);
router.get('/financial-integrity-report', requireRole('admin'), admin.getFinancialIntegrityReport);

// Support-safe operational controls
router.get('/users', requireSupport, admin.getUsers);
router.post('/users/:userId/role', requireRole('admin'), admin.updateUserRole);
router.post('/users/:userId/freeze', requireSupport, admin.freezeUser);
router.post('/users/:userId/unfreeze', requireSupport, admin.unfreezeUser);
router.post('/withdrawals/:transactionId/approve', requireSupport, admin.approveWithdrawalEndpoint);
router.post('/withdrawals/:transactionId/reject', requireSupport, admin.rejectWithdrawalEndpoint);
router.get('/withdrawals/pending', requireSupport, admin.getPendingWithdrawalsEndpoint);

export default router;