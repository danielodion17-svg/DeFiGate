import { sequelize, Transaction } from '../models/index.js';
import { resolveWallet } from './walletService.js';
import { creditAccount } from './balanceService.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';

const DEFAULT_ASSET = 'USDC';

function normalizeAsset(asset = DEFAULT_ASSET) {
  return String(asset || DEFAULT_ASSET).trim().toUpperCase();
}

function normalizeAmount(amount, asset = DEFAULT_ASSET) {
  const amountString = String(amount || '').trim();
  const precision = asset === 'SOL' ? 9 : 6;
  const amountRegex = new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`);
  if (!amountRegex.test(amountString)) {
    throw new Error('INVALID_AMOUNT');
  }
  if (Number(amountString) <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return amountString;
}

export async function processDeposit({
  wallet_address,
  tx_hash,
  chain = 'solana',
  asset = DEFAULT_ASSET,
  amount,
  source = 'deposit_service',
  metadata = {},
}) {
  const walletAddress = String(wallet_address || '').trim();
  const txHash = String(tx_hash || '').trim();
  const normalizedAsset = normalizeAsset(asset);

  if (!walletAddress || !txHash || !amount) {
    throw new Error('MISSING_DEPOSIT_PAYLOAD');
  }

  const wallet = await resolveWallet(walletAddress, chain);
  if (!wallet) {
    throw new Error('WALLET_NOT_FOUND');
  }

  const depositAmount = normalizeAmount(amount, normalizedAsset);

  const existingTransaction = await Transaction.findOne({ where: { tx_hash: txHash } });
  if (existingTransaction) {
    if (existingTransaction.type !== 'deposit') {
      throw new Error('TX_HASH_CONFLICT');
    }
    return existingTransaction;
  }

  return await sequelize.transaction(async (tx) => {
    const transaction = await Transaction.create(
      {
        user_id: wallet.user_id,
        wallet_id: wallet.id,
        type: 'deposit',
        amount: depositAmount,
        asset: normalizedAsset,
        status: 'confirmed',
        tx_hash: txHash,
        metadata: {
          source,
          wallet_address: walletAddress,
          ...metadata,
        },
        created_at: new Date(),
      },
      { transaction: tx }
    );

    await creditAccount(wallet.user_id, depositAmount, {
      asset: normalizedAsset,
      walletId: wallet.id,
      txHash,
      transactionId: transaction.id,
      metadata: {
        source,
        wallet_address: walletAddress,
        ...metadata,
      },
      transaction: tx,
    });

    await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_DETECTED, {
      user_id: wallet.user_id,
      wallet_id: wallet.id,
      transaction_id: transaction.id,
      tx_hash: txHash,
      amount: depositAmount,
      asset: normalizedAsset,
      metadata: {
        source,
        wallet_address: walletAddress,
        ...metadata,
      },
      severity: 'info',
    });

    return transaction;
  });
}
