// services/auditService.js
import { AuditLog } from '../models/index.js';
import { Op } from 'sequelize';

export const AUDIT_ACTIONS = {
  DEPOSIT_DETECTED: 'deposit_detected',
  TRANSFER_INITIATED: 'transfer_initiated',
  TRANSFER_CONFIRMED: 'transfer_confirmed',
  WITHDRAWAL_INITIATED: 'withdrawal_initiated',
  WITHDRAWAL_BROADCASTED: 'withdrawal_broadcasted',
  WALLET_CREATED: 'wallet_created',
  WALLET_REUSED: 'wallet_reused',
  BALANCE_SYNCED: 'balance_synced',
  ACCOUNT_LEDGER_ENTRY: 'account_ledger_entry',
  RECONCILIATION_RUN: 'reconciliation_run',
  RECONCILIATION_MISMATCH: 'reconciliation_mismatch',
  DEPOSIT_REPROCESSED: 'deposit_reprocessed',
  ADMIN_ACTION: 'admin_action',
};

/**
 * Log an audit event
 * @param {string} action - Action from AUDIT_ACTIONS
 * @param {Object} data - Audit data
 * @param {string} data.user_id - User ID
 * @param {string} data.wallet_id - Wallet ID (optional)
 * @param {string} data.transaction_id - Transaction ID (optional)
 * @param {string} data.tx_hash - Transaction hash (optional)
 * @param {string} data.amount - Amount (optional)
 * @param {string} data.asset - Asset type (optional)
 * @param {Object} data.metadata - Additional metadata (optional)
 * @param {string} data.ip_address - IP address (optional)
 * @param {string} data.user_agent - User agent (optional)
 */
export async function logAuditEvent(action, data = {}) {
  try {
    await AuditLog.create({
      action,
      user_id: data.user_id,
      wallet_id: data.wallet_id,
      transaction_id: data.transaction_id,
      tx_hash: data.tx_hash,
      amount: data.amount,
      asset: data.asset,
      metadata: data.metadata,
      request_id: data.request_id,
      before_state: data.before_state,
      after_state: data.after_state,
      severity: data.severity || 'info',
      ip_address: data.ip_address,
      user_agent: data.user_agent,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging shouldn't break business logic
  }
}

/**
 * Get audit logs with filtering
 * @param {Object} filters
 * @param {string} filters.user_id - Filter by user
 * @param {string} filters.action - Filter by action
 * @param {Date} filters.from_date - From date
 * @param {Date} filters.to_date - To date
 * @param {number} filters.limit - Max results
 * @param {number} filters.offset - Pagination offset
 */
export async function getAuditLogs(filters = {}) {
  const where = {};

  if (filters.user_id) where.user_id = filters.user_id;
  if (filters.action) where.action = filters.action;
  if (filters.from_date || filters.to_date) {
    where.created_at = {};
    if (filters.from_date) where.created_at[Op.gte] = filters.from_date;
    if (filters.to_date) where.created_at[Op.lte] = filters.to_date;
  }

  return await AuditLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 100,
    offset: filters.offset || 0,
  });
}