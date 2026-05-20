import { Connection, PublicKey, Transaction as SolanaTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  transferChecked,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import axios from 'axios';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { sequelize, Transaction, Account, Wallet } from '../models/index.js';
import { creditAccount, reserveFunds, releaseFunds, commitReservedFunds } from '../services/accountService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

dotenv.config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_BASE = 'https://api.privy.io';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

function privyHeaders() {
  const encoded = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'privy-app-id': PRIVY_APP_ID,
    'Content-Type': 'application/json',
  };
}

async function resolvePrivyWalletId(walletId) {
  if (!walletId) return null;
  const wallet = await Wallet.findOne({
    where: {
      [Op.or]: [
        { id: walletId },
        { provider_wallet_id: walletId },
      ],
    },
  });
  return wallet?.provider_wallet_id || null;
}

async function confirmTransaction(txHash, maxRetries = 30) {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      const tx = await connection.getTransaction(txHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (tx && tx.meta) {
        return {
          confirmed: true,
          success: tx.meta.err === null,
          slot: tx.slot,
          fee: tx.meta.fee,
        };
      }
    } catch (error) {
      console.warn(`Confirmation attempt ${i + 1} failed for ${txHash}:`, error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { confirmed: false, success: false };
}

async function buildUSDCTransferTransaction(senderPublicKey, recipientAddress, amount) {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const recipientPublicKey = new PublicKey(recipientAddress);
  const senderATA = await getAssociatedTokenAddress(
    USDC_MINT,
    senderPublicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const recipientATA = await getAssociatedTokenAddress(
    USDC_MINT,
    recipientPublicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  let needsCreateATA = false;
  try {
    await getAccount(connection, recipientATA);
  } catch (error) {
    needsCreateATA = true;
  }
  const instructions = [];
  if (needsCreateATA) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        senderPublicKey,
        recipientATA,
        recipientPublicKey,
        USDC_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  const transferAmount = Math.floor(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));
  instructions.push(
    transferChecked(
      TOKEN_PROGRAM_ID,
      senderATA,
      USDC_MINT,
      recipientATA,
      senderPublicKey,
      [],
      transferAmount,
      USDC_DECIMALS
    )
  );
  return instructions;
}

async function sendTransactionViaPrivy(providerWalletId, instructions) {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const walletResponse = await axios.get(`${PRIVY_BASE}/v1/wallets/${providerWalletId}`, {
    headers: privyHeaders(),
  });
  const walletData = walletResponse.data;
  if (!walletData.address) {
    throw new Error('Wallet address not found');
  }
  const senderPublicKey = new PublicKey(walletData.address);
  const transaction = new SolanaTransaction();
  transaction.instructions = instructions;
  transaction.feePayer = senderPublicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const txBody = {
    chain_type: 'solana',
    method: 'solana_signAndSendTransaction',
    caip2: 'solana:mainnet',
    params: {
      transaction: serializedTx.toString('base64'),
    },
  };
  const response = await axios.post(`${PRIVY_BASE}/v1/wallets/${providerWalletId}/rpc`, txBody, {
    headers: privyHeaders(),
  });
  return response.data;
}

async function updateTransactionStatus(transactionInstance, values, tx) {
  Object.assign(transactionInstance, values);
  await transactionInstance.save({ transaction: tx });
  return transactionInstance;
}

export async function processUSDCWithdrawal(userId, walletId, recipientAddress, amount, idempotencyKey, requestMeta = {}) {
  const withdrawalAmount = parseFloat(amount);
  if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
    throw new Error('Invalid amount');
  }

  return await sequelize.transaction(async (tx) => {
    if (idempotencyKey) {
      const existingTx = await Transaction.findOne({
        where: {
          user_id: userId,
          idempotency_key: idempotencyKey,
          type: 'withdrawal',
        },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (existingTx) {
        return {
          success: true,
          transactionId: existingTx.id,
          status: existingTx.status,
          txHash: existingTx.tx_hash,
          message: `Transaction already exists with status: ${existingTx.status}`,
        };
      }
    }

    const userAccount = await Account.findOne({
      where: { user_id: userId, asset: 'USDC' },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!userAccount) {
      throw new Error('User account not found');
    }

    await reserveFunds(userId, withdrawalAmount, {
      asset: 'USDC',
    });

    const withdrawalTransaction = await Transaction.create(
      {
        user_id: userId,
        wallet_id: walletId,
        type: 'withdrawal',
        amount: withdrawalAmount,
        asset: 'USDC',
        status: 'pending_review',
        recipient_address: recipientAddress,
        idempotency_key: idempotencyKey,
        reference: `USDC withdrawal to ${recipientAddress}`,
      },
      { transaction: tx }
    );

    await logAuditEvent(AUDIT_ACTIONS.WITHDRAWAL_INITIATED, {
      user_id: userId,
      transaction_id: withdrawalTransaction.id,
      amount: withdrawalAmount,
      asset: 'USDC',
      metadata: {
        recipient_address: recipientAddress,
        wallet_id: walletId,
        idempotency_key: idempotencyKey,
      },
      request_id: requestMeta.request_id,
      ip_address: requestMeta.ip_address,
      user_agent: requestMeta.user_agent,
      severity: 'warning',
      after_state: {
        transaction: withdrawalTransaction.toJSON(),
      },
    });

    return {
      success: true,
      transactionId: withdrawalTransaction.id,
      status: withdrawalTransaction.status,
      message: 'Withdrawal queued for review',
    };
  });
}

export async function approveWithdrawal(transactionId, operatorUserId, requestMeta = {}) {
  return await sequelize.transaction(async (tx) => {
    const withdrawalTransaction = await Transaction.findOne({
      where: { id: transactionId, type: 'withdrawal' },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!withdrawalTransaction) {
      throw new Error('Withdrawal not found');
    }
    if (withdrawalTransaction.status !== 'pending_review') {
      throw new Error('Withdrawal not eligible for approval');
    }

    const beforeStatus = withdrawalTransaction.status;
    withdrawalTransaction.status = 'approved';
    await withdrawalTransaction.save({ transaction: tx });

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: operatorUserId,
      transaction_id: withdrawalTransaction.id,
      metadata: {
        action: 'approve_withdrawal',
        previous_status: beforeStatus,
        new_status: withdrawalTransaction.status,
      },
      request_id: requestMeta.request_id,
      ip_address: requestMeta.ip_address,
      user_agent: requestMeta.user_agent,
      severity: 'info',
      before_state: { status: beforeStatus },
      after_state: { status: withdrawalTransaction.status },
    });

    return await broadcastApprovedWithdrawal(transactionId, operatorUserId, requestMeta);
  });
}

export async function rejectWithdrawal(transactionId, operatorUserId, reason = 'Rejected by support', requestMeta = {}) {
  return await sequelize.transaction(async (tx) => {
    const withdrawalTransaction = await Transaction.findOne({
      where: { id: transactionId, type: 'withdrawal' },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!withdrawalTransaction) {
      throw new Error('Withdrawal not found');
    }
    if (!['pending_review', 'approved'].includes(withdrawalTransaction.status)) {
      throw new Error('Withdrawal not eligible for rejection');
    }

    const userAccount = await Account.findOne({
      where: { user_id: withdrawalTransaction.user_id, asset: 'USDC' },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!userAccount) {
      throw new Error('User account not found');
    }

    const amount = parseFloat(withdrawalTransaction.amount || 0);
    await releaseFunds(userAccount.user_id, amount, {
      asset: 'USDC',
    });

    const beforeStatus = withdrawalTransaction.status;
    withdrawalTransaction.status = 'rejected';
    withdrawalTransaction.failure_reason = reason;
    withdrawalTransaction.failed_at = new Date();
    await withdrawalTransaction.save({ transaction: tx });

    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      user_id: operatorUserId,
      transaction_id: withdrawalTransaction.id,
      metadata: {
        action: 'reject_withdrawal',
        reason,
        previous_status: beforeStatus,
      },
      request_id: requestMeta.request_id,
      ip_address: requestMeta.ip_address,
      user_agent: requestMeta.user_agent,
      severity: 'warning',
      before_state: { status: beforeStatus },
      after_state: { status: withdrawalTransaction.status },
    });

    return {
      success: true,
      transactionId: withdrawalTransaction.id,
      status: withdrawalTransaction.status,
      message: 'Withdrawal rejected',
    };
  });
}

async function broadcastApprovedWithdrawal(transactionId, operatorUserId, requestMeta = {}) {
  const withdrawalTransaction = await Transaction.findByPk(transactionId);
  if (!withdrawalTransaction) {
    throw new Error('Withdrawal not found');
  }
  if (withdrawalTransaction.status !== 'approved') {
    throw new Error('Withdrawal must be approved before broadcasting');
  }

  withdrawalTransaction.status = 'broadcasting';
  await withdrawalTransaction.save();

  const providerWalletId = await resolvePrivyWalletId(withdrawalTransaction.wallet_id);
  if (!providerWalletId) {
    throw new Error('Invalid wallet identifier');
  }

  const walletResponse = await axios.get(`${PRIVY_BASE}/v1/wallets/${providerWalletId}`, {
    headers: privyHeaders(),
  });
  const senderAddress = walletResponse.data.address;
  if (!senderAddress) {
    throw new Error('Wallet address not found');
  }

  const senderPublicKey = new PublicKey(senderAddress);
  const instructions = await buildUSDCTransferTransaction(
    senderPublicKey,
    withdrawalTransaction.recipient_address,
    withdrawalTransaction.amount
  );

  let txHash;
  try {
    const txResult = await sendTransactionViaPrivy(providerWalletId, instructions);
    txHash = txResult?.data?.signature || txResult?.signature;
    if (!txHash) {
      throw new Error('Transaction broadcast failed - no signature returned');
    }
  } catch (error) {
    const amountValue = parseFloat(withdrawalTransaction.amount || 0);
    await sequelize.transaction(async (refundTx) => {
      await releaseFunds(withdrawalTransaction.user_id, amountValue, {
        asset: 'USDC',
      });
      withdrawalTransaction.status = 'failed';
      withdrawalTransaction.failed_at = new Date();
      withdrawalTransaction.failure_reason = error.message;
      await withdrawalTransaction.save({ transaction: refundTx });
    });

    throw error;
  }

  withdrawalTransaction.status = 'broadcasted';
  withdrawalTransaction.tx_hash = txHash;
  withdrawalTransaction.broadcasted_at = new Date();
  await withdrawalTransaction.save();

  await logAuditEvent(AUDIT_ACTIONS.WITHDRAWAL_BROADCASTED, {
    user_id: withdrawalTransaction.user_id,
    transaction_id: withdrawalTransaction.id,
    tx_hash: txHash,
    amount: withdrawalTransaction.amount,
    asset: withdrawalTransaction.asset,
    metadata: {
      recipient_address: withdrawalTransaction.recipient_address,
      wallet_id: withdrawalTransaction.wallet_id,
      operator_user_id: operatorUserId,
    },
    request_id: requestMeta.request_id,
    ip_address: requestMeta.ip_address,
    user_agent: requestMeta.user_agent,
    severity: 'warning',
  });

  confirmTransaction(txHash)
    .then(async (confirmation) => {
      const confirmedTx = await Transaction.findByPk(transactionId);
      if (!confirmedTx) return;

      const amountValue = parseFloat(confirmedTx.amount || 0);
      if (confirmation.confirmed && confirmation.success) {
        await sequelize.transaction(async (tx) => {
          await commitReservedFunds(confirmedTx.user_id, amountValue, {
            asset: 'USDC',
            walletId: confirmedTx.wallet_id,
            txHash,
            metadata: {
              source: 'withdrawal_confirmation',
              withdrawal_id: confirmedTx.id,
            },
          });

          await confirmedTx.update(
            {
              status: 'confirmed',
              confirmed_at: new Date(),
              network_fee: confirmation.fee || 0,
            },
            { transaction: tx }
          );
        });
      } else {
        await sequelize.transaction(async (refundTx) => {
          await releaseFunds(confirmedTx.user_id, amountValue, {
            asset: 'USDC',
          });
          await confirmedTx.update(
            {
              status: 'failed',
              failed_at: new Date(),
              failure_reason: confirmation.confirmed ? 'Transaction failed on-chain' : 'Transaction confirmation timeout',
            },
            { transaction: refundTx }
          );
        });
      }
    })
    .catch(async (error) => {
      console.error('Post-broadcast confirmation error:', error.message || error);
      const confirmedTx = await Transaction.findByPk(transactionId);
      if (!confirmedTx) return;

      const amountValue = parseFloat(confirmedTx.amount || 0);
      await sequelize.transaction(async (refundTx) => {
        await releaseFunds(confirmedTx.user_id, amountValue, {
          asset: 'USDC',
        });
        await confirmedTx.update(
          {
            status: 'failed',
            failed_at: new Date(),
            failure_reason: 'Confirmation flow error',
          },
          { transaction: refundTx }
        );
      });
    });

  return {
    success: true,
    transactionId: withdrawalTransaction.id,
    status: withdrawalTransaction.status,
    txHash,
    message: 'Withdrawal broadcasted successfully, awaiting confirmation',
  };
}

export async function getWithdrawalStatus(transactionId, userId) {
  const tx = await Transaction.findOne({
    where: {
      id: transactionId,
      user_id: userId,
      type: 'withdrawal',
    },
  });
  if (!tx) {
    throw new Error('Transaction not found');
  }
  return tx;
}

export async function getPendingWithdrawals() {
  return await Transaction.findAll({
    where: {
      type: 'withdrawal',
      status: {
        [Op.in]: ['pending_review', 'approved', 'broadcasting'],
      },
    },
    order: [['created_at', 'DESC']],
  });
}
