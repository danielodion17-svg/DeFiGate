import { User } from '../models/index.js';
import { createPrivyWalletForUser } from './walletService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

export async function retryMissingWallets(limit = 100) {
  const users = await User.findAll({
    where: {},
    order: [['created_at', 'ASC']],
    limit,
  });

  const summary = {
    attempted: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const user of users) {
    summary.attempted += 1;
    try {
      const wallet = await createPrivyWalletForUser(user.id, user.preferred_chain || 'solana');
      if (wallet) {
        if (wallet.provider === 'privy' || wallet.provider === 'dev') {
          summary.created += 1;
        } else {
          summary.skipped += 1;
        }
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ userId: user.id, error: String(error.message || error) });
      console.error('wallet retry failed for user', user.id, error.message || error);
      await logAuditEvent(AUDIT_ACTIONS.WALLET_RETRY_FAILED, {
        user_id: user.id,
        metadata: {
          error: String(error.message || error),
        },
        severity: 'warning',
      });
    }
  }

  await logAuditEvent(AUDIT_ACTIONS.WALLET_RETRY, {
    metadata: {
      attempted: summary.attempted,
      created: summary.created,
      skipped: summary.skipped,
      failed: summary.failed,
    },
    severity: summary.failed > 0 ? 'warning' : 'info',
  });

  return summary;
}
