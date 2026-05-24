import crypto from "crypto";
import pool from "../db.js";
import bcrypt from "bcrypt";
import sequelize from "../config/database.js";
import { Transaction, User } from "../models/index.js";
import { respondError, respondSuccess } from "../utils/response.js";
import { processUSDCWithdrawal, getWithdrawalStatus } from "../services/withdrawalService.js";
import { logAuditEvent, AUDIT_ACTIONS } from '../services/auditService.js';
import { getDerivedBalance, debitAccount, creditAccount } from '../services/balanceService.js';
import dotenv from "dotenv";

dotenv.config();

// In-memory storage for transfer PINs (use Redis in production)
const inMemoryPINs = new Map();

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Lookup recipient by email or phone number
 */
export const lookupRecipient = async (req, res) => {
  const { recipient } = req.body;

  if (!recipient || typeof recipient !== 'string') {
    return res.status(400).json({ ok: false, error: 'Recipient is required' });
  }

  const normalizedRecipient = recipient.trim();
  if (!normalizedRecipient) {
    return res.status(400).json({ ok: false, error: 'Recipient cannot be empty' });
  }

  try {
    const isEmail = normalizedRecipient.includes('@');
    const query = `SELECT id, name, email, phone FROM users WHERE ${isEmail ? 'LOWER(email) = $1' : 'phone = $1'}`;
    const params = [isEmail ? normalizedRecipient.toLowerCase() : normalizedRecipient];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    if (result.rows.length > 1) {
      console.error('lookupRecipient ambiguity', normalizedRecipient, result.rows);
      return res.status(500).json({ ok: false, error: 'Multiple recipients found' });
    }

    const recipientUser = result.rows[0];

    return res.json({
      ok: true,
      data: {
        userId: recipientUser.id,
        name: recipientUser.name || recipientUser.email || recipientUser.phone || 'Unknown User',
        email: recipientUser.email,
        phone: recipientUser.phone,
      },
    });
  } catch (err) {
    console.error('lookupRecipient error', err);
    res.status(500).json({ ok: false, error: 'Lookup failed' });
  }
};

/**
 * Initiate an internal transfer between users
 * Transfers use the transactions table with type='transfer'
 */
export const transfer = async (req, res) => {
  const senderId = req.user?.id;
  const senderEmail = req.user?.email;
  const { recipient, amount, asset } = req.body;
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["Idempotency-Key"] || req.headers["idempotency_key"] || null;

  if (!senderId) {
    return respondError(res, 401, "Not authenticated", false);
  }

  if (!recipient || typeof recipient !== 'string' || !recipient.trim()) {
    return respondError(res, 400, "Recipient is required", false);
  }

  const recipientInput = recipient.trim();
  if (!amount) {
    return respondError(res, 400, "Amount is required", false);
  }

  const amountString = String(amount).trim();
  const amountRegex = /^\d+(?:\.\d{1,6})?$/;
  if (!amountRegex.test(amountString) || amountString === '0' || /^0+(?:\.0+)?$/.test(amountString)) {
    return respondError(res, 400, "Amount must be a positive decimal with up to 6 decimals", false);
  }

  if (!asset || typeof asset !== 'string') {
    return respondError(res, 400, "Asset is required", false);
  }

  try {
    const isEmail = recipientInput.includes('@');
    const whereClause = isEmail
      ? { email: recipientInput.toLowerCase() }
      : { phone: recipientInput };

    const receiverUser = await User.findOne({ where: whereClause });

    if (!receiverUser) {
      return respondError(res, 404, "Recipient not found", false);
    }

    const receiverId = receiverUser.id;
    if (!receiverId || typeof receiverId !== 'string') {
      throw new Error('CRITICAL: receiverId is not a UUID');
    }

    if (senderId === receiverId) {
      return respondError(res, 400, "Cannot transfer to yourself", false);
    }

    const amountNum = Number(amountString);
    const senderBalance = await getDerivedBalance(senderId, asset.trim());
    if (senderBalance < amountNum) {
      return respondError(res, 400, "Insufficient available balance", false);
    }

    // Create transfer transaction with idempotency
    const txHash = idempotencyKey || `transfer_${senderId}_${receiverId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const transferTx = await sequelize.transaction(async (txn) => {
      // Check for idempotency (existing transaction with same tx_hash)
      const existing = await Transaction.findOne({
        where: { tx_hash: txHash },
        transaction: txn,
      });
      if (existing) {
        return existing;
      }

      // Debit sender
      await debitAccount(senderId, amountString, {
        asset: asset.trim(),
        txHash: txHash,
        metadata: {
          type: 'transfer_debit',
          recipient_id: receiverId,
          recipient_email: receiverUser.email,
        },
        transaction: txn,
      });

      // Credit receiver
      await creditAccount(receiverId, amountString, {
        asset: asset.trim(),
        txHash: txHash,
        metadata: {
          type: 'transfer_credit',
          sender_id: senderId,
          sender_email: senderEmail,
        },
        transaction: txn,
      });

      // Create transaction record
      const transaction = await Transaction.create({
        user_id: senderId,
        type: 'transfer',
        amount: amountString,
        asset: asset.trim(),
        status: 'completed',
        tx_hash: txHash,
        recipient_address: receiverUser.email || receiverUser.phone,
        idempotency_key: idempotencyKey || null,
        confirmed_at: new Date(),
      }, { transaction: txn });

      return transaction;
    });

    // Log audit event
    await logAuditEvent(AUDIT_ACTIONS.TRANSFER_COMPLETED, {
      user_id: senderId,
      transaction_id: transferTx.id,
      amount: amountString,
      asset: asset.trim(),
      metadata: {
        recipient_id: receiverId,
        recipient_email: receiverUser.email,
        tx_hash: txHash,
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
    });

    return res.json({
      ok: true,
      data: {
        transactionId: transferTx.id,
        txHash: transferTx.tx_hash,
        status: transferTx.status,
        amount: amountString,
        asset: asset.trim(),
        recipient: {
          id: receiverId,
          email: receiverUser.email,
          name: receiverUser.name,
        },
      },
    });
  } catch (err) {
    console.error("transfer error", err);
    return respondError(res, 500, "Transfer failed", true, err.message);
  }
};

/**
 * Get transfer history for a user (both sent and received transfers)
 */
export const getTransferHistory = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT
        t.id,
        t.user_id as sender_id,
        t.recipient_address,
        t.amount,
        t.asset,
        t.status,
        t.created_at,
        t.confirmed_at,
        u.email as sender_email
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.type = 'transfer' AND (t.user_id = $1 OR t.recipient_address IN (
         SELECT email FROM users WHERE id = $1
         UNION
         SELECT phone FROM users WHERE id = $1
       ))
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [userId]
    );

    res.json({
      ok: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("getTransferHistory error", err);
    res.status(500).json({ ok: false, error: "Failed to retrieve transfer history" });
  }
};

/**
 * Initiate a PIN-based transfer (multi-step confirmation)
 * For backward compatibility, stores PIN in-memory for confirmation step
 */
export const initiateTransfer = async (req, res) => {
  const senderId = req.user?.id;
  const senderEmail = req.user?.email;
  const { recipientId, amount, tokenSymbol, chain } = req.body;

  if (!senderId || !senderEmail) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  if (!recipientId || !amount || !tokenSymbol || !chain) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields: recipientId, amount, tokenSymbol, chain",
    });
  }

  if (senderId === recipientId) {
    return res.status(400).json({ ok: false, error: "Cannot send to yourself" });
  }

  if (amount <= 0) {
    return res.status(400).json({ ok: false, error: "Amount must be positive" });
  }

  try {
    const amountNum = Number(amount);
    const balance = await getDerivedBalance(senderId, tokenSymbol);
    if (balance < amountNum) {
      return res.status(400).json({ ok: false, error: "Insufficient balance" });
    }

    // Create a temporary transaction record for the initiated transfer
    const transferId = crypto.randomUUID();
    const pin = generatePIN();
    
    inMemoryPINs.set(`${senderId}:${transferId}`, pin);

    res.json({
      ok: true,
      data: {
        transferId,
        status: "pending_confirmation",
        amount,
        tokenSymbol,
        chain,
        message: `Transfer initiated. PIN has been sent to ${senderEmail}.`,
        pin, // In development only - should use email/SMS in production
      },
    });
  } catch (err) {
    console.error("initiateTransfer error", err);
    res.status(500).json({ ok: false, error: "Transfer initiation failed" });
  }
};

/**
 * Confirm a PIN-based transfer with password verification
 */
export const confirmTransfer = async (req, res) => {
  const senderId = req.user?.id;
  const { transferId, pin, password } = req.body;

  if (!senderId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  if (!transferId || !pin || !password) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields: transferId, pin, password",
    });
  }

  try {
    // Verify PIN
    const storedPin = inMemoryPINs.get(`${senderId}:${transferId}`);
    if (storedPin !== pin) {
      return res.status(400).json({ ok: false, error: "Invalid PIN" });
    }

    // Verify password
    const senderResult = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [senderId]
    );

    if (senderResult.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Sender not found" });
    }

    const sender = senderResult.rows[0];
    const validPassword = await bcrypt.compare(password, sender.password_hash);

    if (!validPassword) {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }

    // Clear PIN
    inMemoryPINs.delete(`${senderId}:${transferId}`);

    res.json({
      ok: true,
      data: {
        transferId,
        status: "confirmed",
        message: "PIN and password verified. Transfer is being processed.",
      },
    });
  } catch (err) {
    console.error("confirmTransfer error", err);
    res.status(500).json({ ok: false, error: "Transfer confirmation failed" });
  }
};

/**
 * Withdrawal endpoint (delegates to withdrawal service)
 */
export const initiateWithdrawal = async (req, res) => {
  const userId = req.user?.id;
  const { amount, walletAddress, tokenSymbol } = req.body;

  if (!userId) {
    return respondError(res, 401, "Not authenticated", false);
  }

  if (!amount || !walletAddress || !tokenSymbol) {
    return respondError(res, 400, "Missing required fields", false);
  }

  try {
    const result = await processUSDCWithdrawal(userId, amount, walletAddress, tokenSymbol);
    return respondSuccess(res, result, "Withdrawal initiated");
  } catch (err) {
    console.error("initiateWithdrawal error", err);
    return respondError(res, 500, "Withdrawal initiation failed", true, err.message);
  }
};

/**
 * Get withdrawal status
 */
export const getWithdrawalStatusEndpoint = async (req, res) => {
  const userId = req.user?.id;
  const { transactionId } = req.params;

  if (!userId) {
    return respondError(res, 401, "Not authenticated", false);
  }

  if (!transactionId) {
    return respondError(res, 400, "Transaction ID is required", false);
  }

  try {
    const status = await getWithdrawalStatus(transactionId);
    return respondSuccess(res, status, "Withdrawal status retrieved");
  } catch (err) {
    console.error("getWithdrawalStatusEndpoint error", err);
    return respondError(res, 500, "Failed to get withdrawal status", true, err.message);
  }
};
