// controllers/adminController.js
import { runReconciliation, autoRepairSafeMismatches } from '../services/reconciliationService.js';
import { repairMissingDeposits } from '../services/balanceSyncService.js';
import { processDeposit } from '../services/depositDetector.js';
import { approveWithdrawal, rejectWithdrawal, getPendingWithdrawals } from '../services/withdrawalService.js';
import { Wallet, Transaction, User } from '../models/index.js';
import { adjustAccount } from '../services/accountService.js';
import { logAuditEvent, AUDIT_ACTIONS, getAuditLogs } from '../services/auditService.js';
import { respondError, respondSuccess } from '../utils/response.js';

/**
 * POST /admin/reconcile
 * Run reconciliation for all wallets or specific wallet/user
 */
export const reconcile = async (req, res) => {
  try {
    const { walletId, userId, autoRepair } = req.body;

    const result = await runReconciliation({ walletId, userId });

    // Optionally auto-repair safe mismatches
    let repairResult = null;
    if (autoRepair && result.mismatches > 0) {
      repairResult = await autoRepairSafeMismatches();
    }

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'reconciliation_run',
        wallet_id: walletId,
        user_id: userId,
        auto_repair: autoRepair,
        results: result
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    respondSuccess(res, {
      reconciliation: result,
      repairs: repairResult
    });
  } catch (error) {
    console.error('Reconciliation error:', error);
    respondError(res, 500, 'Reconciliation failed', true, error.message);
  }
};

export const reconcileWallet = async (req, res) => {
  try {
    const walletId = req.params.walletId;
    const { autoRepair = false } = req.body;

    if (!walletId) {
      return respondError(res, 400, 'walletId is required');
    }

    const result = await runReconciliation({ walletId });
    const repairResult = await repairMissingDeposits({ walletId });

    if (autoRepair && result.mismatches > 0) {
      await autoRepairSafeMismatches();
    }

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'reconciliation_run_wallet',
        wallet_id: walletId,
        auto_repair: autoRepair,
        results: result,
        repair_result: repairResult,
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    respondSuccess(res, {
      reconciliation: result,
      repairs: repairResult,
    });
  } catch (error) {
    console.error('Wallet reconciliation error:', error);
    respondError(res, 500, 'Reconciliation failed', true, error.message);
  }
};

/**
 * POST /admin/deposits/reprocess
 * Manually reprocess a deposit transaction
 */
export const reprocessDeposit = async (req, res) => {
  try {
    const { txHash } = req.body;

    if (!txHash) {
      return respondError(res, 400, 'txHash is required');
    }

    // Check if transaction already exists
    const existingTx = await Transaction.findOne({
      where: { tx_hash: txHash, type: 'deposit' }
    });

    if (existingTx) {
      return respondError(res, 409, 'Transaction already processed');
    }

    // Find wallet that should receive this deposit
    // This is a simplified version - in production you'd need to determine
    // which wallet the tx_hash belongs to
    const wallets = await Wallet.findAll({
      where: { chain: 'solana' },
      attributes: ['id', 'user_id', 'address']
    });

    let processed = false;
    let processedWallet = null;

    for (const wallet of wallets) {
      if (!wallet.address) continue;

      try {
        const credited = await processDeposit(wallet, txHash);
        if (credited) {
          processed = true;
          processedWallet = wallet;
          break;
        }
      } catch (error) {
        console.error(`Failed to process ${txHash} for wallet ${wallet.address}:`, error);
      }
    }

    if (!processed) {
      return respondError(res, 404, 'Transaction not found or not a valid deposit');
    }

    await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_REPROCESSED, {
      user_id: req.user?.id,
      wallet_id: processedWallet?.id,
      tx_hash: txHash,
      metadata: {
        type: 'manual_reprocess',
        admin_user_id: req.user?.id
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    respondSuccess(res, {
      message: 'Deposit reprocessed successfully',
      tx_hash: txHash,
      wallet_id: processedWallet?.id
    });
  } catch (error) {
    console.error('Deposit reprocessing error:', error);
    respondError(res, 500, 'Deposit reprocessing failed', true, error.message);
  }
};

export const adjustUserBalance = async (req, res) => {
  try {
    const { userId, asset, amount, reason } = req.body;
    if (!userId || !asset || typeof amount !== 'number') {
      return respondError(res, 400, 'userId, asset and numeric amount are required');
    }

    const adjustedAccount = await adjustAccount(parseInt(userId, 10), amount, {
      asset,
      txHash: `admin-adjust-${Date.now()}`,
      metadata: { reason: reason || 'manual adjustment', admin_user_id: req.user?.id },
    });

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'adjust_account_balance',
        target_user_id: userId,
        asset,
        amount,
        reason,
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    respondSuccess(res, {
      adjustedAccount,
    }, 'Account balance adjusted');
  } catch (error) {
    console.error('Balance adjustment error:', error);
    respondError(res, 500, 'Balance adjustment failed', true, error.message);
  }
};

/**
 * GET /admin/audit-logs
 * Get audit logs with filtering
 */
export const getAuditLogsEndpoint = async (req, res) => {
  try {
    const {
      user_id,
      action,
      from_date,
      to_date,
      limit = 100,
      offset = 0
    } = req.query;

    const filters = {
      user_id,
      action,
      from_date: from_date ? new Date(from_date) : undefined,
      to_date: to_date ? new Date(to_date) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const logs = await getAuditLogs(filters);

    respondSuccess(res, {
      logs,
      filters
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    respondError(res, 500, 'Failed to fetch audit logs', true, error.message);
  }
};

export const getUsers = async (req, res) => {
  try {
    const { role, limit = 100, offset = 0 } = req.query;
    const where = {};

    if (role) {
      where.role = role;
    }

    const users = await User.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      attributes: ['id', 'email', 'name', 'role', 'is_frozen', 'freeze_reason', 'created_at'],
    });

    respondSuccess(res, { users });
  } catch (error) {
    console.error('Get users error:', error);
    respondError(res, 500, 'Failed to fetch users', true, error.message);
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const validRoles = ['user', 'support', 'admin'];

    if (!userId) {
      return respondError(res, 400, 'User id is required');
    }
    if (!role || !validRoles.includes(role)) {
      return respondError(res, 400, 'Invalid role');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return respondError(res, 404, 'User not found');
    }

    const beforeState = user.toJSON();
    await user.update({ role });

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'update_user_role',
        target_user_id: userId,
        previous_role: beforeState.role,
        new_role: role,
      },
      before_state: beforeState,
      after_state: user.toJSON(),
      severity: 'warning',
      request_id: req.requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    respondSuccess(res, { user: user.toJSON() });
  } catch (error) {
    console.error('Update user role error:', error);
    respondError(res, 500, 'Failed to update user role', true, error.message);
  }
};

export const freezeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    if (!userId) {
      return respondError(res, 400, 'User id is required');
    }

    await User.update(
      { is_frozen: true, freeze_reason: reason || 'Under review' },
      { where: { id: userId } }
    );

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'freeze_user',
        target_user_id: userId,
        reason,
      },
      severity: 'warning',
      request_id: req.requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    respondSuccess(res, { userId, is_frozen: true });
  } catch (error) {
    console.error('Freeze user error:', error);
    respondError(res, 500, 'Failed to freeze user', true, error.message);
  }
};

export const unfreezeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return respondError(res, 400, 'User id is required');
    }

    await User.update(
      { is_frozen: false, freeze_reason: null },
      { where: { id: userId } }
    );

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: req.user?.id,
      metadata: {
        action: 'unfreeze_user',
        target_user_id: userId,
      },
      severity: 'info',
      request_id: req.requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    respondSuccess(res, { userId, is_frozen: false });
  } catch (error) {
    console.error('Unfreeze user error:', error);
    respondError(res, 500, 'Failed to unfreeze user', true, error.message);
  }
};

export const approveWithdrawalEndpoint = async (req, res) => {
  try {
    const { transactionId } = req.params;
    if (!transactionId) {
      return respondError(res, 400, 'Transaction ID is required');
    }

    const result = await approveWithdrawal(transactionId, req.user.id, {
      request_id: req.requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    respondSuccess(res, result, 'Withdrawal approved and broadcasted');
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    respondError(res, 500, 'Failed to approve withdrawal', true, error.message);
  }
};

export const rejectWithdrawalEndpoint = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    if (!transactionId) {
      return respondError(res, 400, 'Transaction ID is required');
    }

    const result = await rejectWithdrawal(transactionId, req.user.id, reason || 'Rejected by support', {
      request_id: req.requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    respondSuccess(res, result, 'Withdrawal rejected');
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    respondError(res, 500, 'Failed to reject withdrawal', true, error.message);
  }
};

export const getPendingWithdrawalsEndpoint = async (req, res) => {
  try {
    const result = await getPendingWithdrawals();
    respondSuccess(res, { withdrawals: result }, 'Pending withdrawals retrieved');
  } catch (error) {
    console.error('Get pending withdrawals error:', error);
    respondError(res, 500, 'Failed to retrieve pending withdrawals', true, error.message);
  }
};
