import { Connection, PublicKey } from '@solana/web3.js';
import { Op } from 'sequelize';
import { Wallet, Transaction } from '../models/index.js';
import { getAllCanonicalWallets } from '../services/walletService.js';
import { runReconciliation, autoRepairSafeMismatches } from './reconciliationService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const RECONCILIATION_INTERVAL_MS = parseInt(process.env.RECONCILIATION_INTERVAL_MS || String(5 * 60 * 1000), 10);
const SOL_GAS_THRESHOLD = parseFloat(process.env.SOL_GAS_THRESHOLD || '0.15');
const SOLANA_DECIMALS = 9;
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function checkSolGasBalances() {
  const wallets = await getAllCanonicalWallets('solana');

  for (const wallet of wallets) {
    if (!wallet.address) continue;

    try {
      const balanceLamports = await connection.getBalance(new PublicKey(wallet.address), 'confirmed');
      const balanceSol = balanceLamports / 1e9;
      if (balanceSol < SOL_GAS_THRESHOLD) {
        await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
          user_id: wallet.user_id,
          wallet_id: wallet.id,
          amount: balanceSol.toString(),
          asset: 'SOL',
          severity: 'critical',
          metadata: {
            type: 'low_sol_gas_balance',
            balance_sol: balanceSol,
            threshold: SOL_GAS_THRESHOLD,
          },
        });
        console.warn(`Low SOL gas balance alert for wallet ${wallet.address}: ${balanceSol} SOL`);
      }
    } catch (error) {
      console.error('Sol gas balance check failed for wallet', wallet.address, error.message || error);
    }
  }
}

async function checkFailedWithdrawalBroadcasts() {
  const thresholdMinutes = parseInt(process.env.WITHDRAWAL_BROADCAST_ALERT_THRESHOLD_MINUTES || '30', 10);
  const result = await Transaction.findAll({
    where: {
      type: 'withdrawal',
      status: {
        [Op.in]: ['approved', 'broadcasting', 'broadcasted'],
      },
    },
  });

  const now = Date.now();
  const leaking = result.filter((tx) => {
    const broadcastedAt = tx.broadcasted_at ? new Date(tx.broadcasted_at).getTime() : 0;
    return tx.status !== 'confirmed' && tx.status !== 'failed' && broadcastedAt > 0 && now - broadcastedAt > thresholdMinutes * 60 * 1000;
  });

  if (leaking.length > 0) {
    await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
      action: 'withdrawal_broadcast_alert',
      metadata: {
        count: leaking.length,
        threshold_minutes: thresholdMinutes,
        withdrawals: leaking.map((tx) => ({ id: tx.id, status: tx.status, tx_hash: tx.tx_hash })),
      },
      severity: 'warning',
    });
    console.warn(`Failed withdrawal broadcast alert: ${leaking.length} withdrawal(s) remain broadcasted/approved longer than ${thresholdMinutes} minutes`);
  }
}

export async function runOperationalHealthChecks(requestContext = {}) {
  try {
    const reconciliation = await runReconciliation();
    if (reconciliation.mismatches > 0) {
      await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
        metadata: {
          total_wallets: reconciliation.total_wallets,
          mismatches: reconciliation.mismatches,
          matched: reconciliation.matched,
          errors: reconciliation.errors,
        },
        severity: 'warning',
        request_id: requestContext.requestId,
      });
    }

    const repairs = await autoRepairSafeMismatches();
    if (repairs.successful_repairs > 0 || repairs.failed_repairs > 0) {
      await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
        metadata: {
          type: 'reconciliation_auto_repair',
          repairs,
        },
        severity: 'info',
        request_id: requestContext.requestId,
      });
    }

    await checkSolGasBalances();
    await checkFailedWithdrawalBroadcasts();
  } catch (error) {
    console.error('Operational health check failed:', error);
    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      metadata: {
        type: 'operational_health_error',
        error: error.message,
      },
      severity: 'critical',
      request_id: requestContext.requestId,
    });
  }
}

export function startReconciliationJob(requestContext = {}) {
  runOperationalHealthChecks(requestContext).catch((error) => console.error(error));
  setInterval(() => runOperationalHealthChecks(requestContext), RECONCILIATION_INTERVAL_MS);
}
