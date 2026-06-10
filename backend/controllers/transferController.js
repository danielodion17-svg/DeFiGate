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
  throw new Error('INTERNAL_TRANSFERS_TEMPORARILY_DISABLED');
};

/**
 * Initiate an internal transfer between users
 * Transfers use the transactions table with type='transfer'
 */
export const transfer = async (req, res) => {
  throw new Error('INTERNAL_TRANSFERS_TEMPORARILY_DISABLED');
};

/**
 * Get transfer history for a user (both sent and received transfers)
 */
export const getTransferHistory = async (req, res) => {
  throw new Error('INTERNAL_TRANSFERS_TEMPORARILY_DISABLED');
};

/**
 * Initiate a PIN-based transfer (multi-step confirmation)
 * For backward compatibility, stores PIN in-memory for confirmation step
 */
export const initiateTransfer = async (req, res) => {
  throw new Error('INTERNAL_TRANSFERS_TEMPORARILY_DISABLED');
};

/**
 * Confirm a PIN-based transfer with password verification
 */
export const confirmTransfer = async (req, res) => {
  throw new Error('INTERNAL_TRANSFERS_TEMPORARILY_DISABLED');
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
