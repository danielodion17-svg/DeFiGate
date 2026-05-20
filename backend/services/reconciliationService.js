// services/reconciliationService.js
import { Connection, PublicKey } from '@solana/web3.js';
import { sequelize, User, Account, Transaction, Wallet, AuditLog } from '../models/index.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';
import { getCanonicalWallet, getCanonicalWalletByWalletId, getAllCanonicalWallets } from '../services/walletService.js';
import { getDerivedBalance, creditAccount, getOrCreateAccount } from '../services/accountService.js';
import { Op } from 'sequelize';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// SOL Constants
const SOL_DECIMALS = 9;
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Get native SOL balance from Solana blockchain for a wallet address
 */
async function getBlockchainSolBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const balanceLamports = await connection.getBalance(publicKey, 'confirmed');
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    return balanceSol;
  } catch (error) {
    console.error(`Failed to get SOL balance for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Get USDC balance from Solana blockchain for a wallet address
 */
async function getBlockchainUSDCBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: USDC_MINT,
    });

    let totalBalance = 0n;
    for (const tokenAccount of tokenAccounts.value) {
      const accountInfo = await connection.getAccountInfo(tokenAccount.account.owner);
      if (accountInfo) {
        const balance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
        if (balance.value.uiAmount) {
          totalBalance += BigInt(Math.floor(balance.value.uiAmount * 1000000)); // Convert to base units
        }
      }
    }

    return totalBalance;
  } catch (error) {
    console.error(`Failed to get blockchain balance for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Get app ledger balance for a user (only completed transactions)
 */
export async function getAppLedgerBalance(userId, asset = 'USDC') {
  return getDerivedBalance(userId, asset);
}

/**
 * Reconcile a single wallet for a specific asset
 */
async function reconcileWalletAsset(wallet, asset) {
  if (asset === 'SOL') {
    const blockchainBalance = await getBlockchainSolBalance(wallet.address);
    if (blockchainBalance === null) {
      return {
        wallet_id: wallet.id,
        address: wallet.address,
        asset: 'SOL',
        status: 'error',
        error: 'Failed to fetch SOL balance'
      };
    }

    const appBalance = await getAppLedgerBalance(wallet.user_id, 'SOL');
    const difference = blockchainBalance - appBalance;

    const result = {
      wallet_id: wallet.id,
      address: wallet.address,
      asset: 'SOL',
      blockchain_balance: blockchainBalance,
      app_balance: appBalance,
      difference: difference,
      status: Math.abs(difference) < 0.00001 ? 'matched' : 'mismatch'
    };

    // Log reconciliation result
    await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_RUN, {
      user_id: wallet.user_id,
      wallet_id: wallet.id,
      asset: 'SOL',
      metadata: {
        blockchain_balance: blockchainBalance,
        app_balance: appBalance,
        difference: difference,
        status: result.status
      }
    });

    // Log mismatch if found
    if (result.status === 'mismatch') {
      await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
        user_id: wallet.user_id,
        wallet_id: wallet.id,
        amount: difference.toString(),
        asset: 'SOL',
        metadata: {
          blockchain_balance: blockchainBalance,
          app_balance: appBalance,
          difference: difference
        }
      });
    }

    return result;
  }

  // USDC reconciliation (original logic)
  const blockchainBalance = await getBlockchainUSDCBalance(wallet.address);
  if (blockchainBalance === null) {
    return {
      wallet_id: wallet.id,
      address: wallet.address,
      asset: 'USDC',
      status: 'error',
      error: 'Failed to fetch blockchain balance'
    };
  }

  const appBalance = await getAppLedgerBalance(wallet.user_id, 'USDC');
  const blockchainBalanceFloat = parseFloat(blockchainBalance.toString()) / 1000000; // Convert from base units

  const difference = blockchainBalanceFloat - appBalance;

  const result = {
    wallet_id: wallet.id,
    address: wallet.address,
    asset: 'USDC',
    blockchain_balance: blockchainBalanceFloat,
    app_balance: appBalance,
    difference: difference,
    status: Math.abs(difference) < 0.01 ? 'matched' : 'mismatch'
  };

  // Log reconciliation result
  await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_RUN, {
    user_id: wallet.user_id,
    wallet_id: wallet.id,
    asset: 'USDC',
    metadata: {
      blockchain_balance: blockchainBalanceFloat,
      app_balance: appBalance,
      difference: difference,
      status: result.status
    }
  });

  // Log mismatch if found
  if (result.status === 'mismatch') {
    await logAuditEvent(AUDIT_ACTIONS.RECONCILIATION_MISMATCH, {
      user_id: wallet.user_id,
      wallet_id: wallet.id,
      amount: difference.toString(),
      asset: 'USDC',
      metadata: {
        blockchain_balance: blockchainBalanceFloat,
        app_balance: appBalance,
        difference: difference
      }
    });
  }

  return result;
}

/**
 * Reconcile a single wallet for both SOL and USDC
 */
async function reconcileWalletRecord(wallet) {
  try {
    const usdcResult = await reconcileWalletAsset(wallet, 'USDC');
    const solResult = await reconcileWalletAsset(wallet, 'SOL');
    return [usdcResult, solResult];
  } catch (error) {
    return [{
      wallet_id: wallet.id,
      address: wallet.address,
      status: 'error',
      error: error.message
    }];
  }
}

/**
 * Run reconciliation for all wallets
 */
export async function runReconciliation(options = {}) {
  const { walletId, userId } = options;

  let wallets;
  if (walletId) {
    const wallet = await getCanonicalWalletByWalletId(walletId);
    wallets = wallet ? [wallet] : [];
  } else if (userId) {
    const wallet = await getCanonicalWallet(userId, 'solana');
    wallets = wallet ? [wallet] : [];
  } else {
    wallets = await getAllCanonicalWallets('solana');
  }

  const results = [];
  for (const wallet of wallets) {
    if (!wallet.address) continue;
    try {
      const walletResults = await reconcileWalletRecord(wallet);
      // reconcileWalletRecord returns an array of results (USDC and SOL)
      results.push(...walletResults);
    } catch (error) {
      results.push({
        wallet_id: wallet.id,
        address: wallet.address,
        status: 'error',
        error: error.message
      });
    }
  }

  return {
    total_wallets: results.length,
    matched: results.filter(r => r.status === 'matched').length,
    mismatches: results.filter(r => r.status === 'mismatch').length,
    errors: results.filter(r => r.status === 'error').length,
    results
  };
}

export async function reconcileWallet(walletId) {
  const wallet = await getCanonicalWalletByWalletId(walletId);
  if (!wallet || !wallet.address) {
    return {
      wallet_id: walletId,
      status: 'error',
      error: 'Wallet not found or missing address',
    };
  }
  const results = await reconcileWalletRecord(wallet);
  return results;
}

export async function reconcileAllWallets() {
  return runReconciliation();
}

/**
 * Auto-repair safe mismatches (when blockchain > app balance)
 * This handles cases where deposits were missed
 * NEVER repairs when blockchain < app (could indicate fraud/withdrawal issues)
 */
export async function autoRepairSafeMismatches() {
  const reconciliation = await runReconciliation();
  const repairs = [];

  for (const result of reconciliation.results) {
    // Only repair when blockchain has MORE than app (missed deposits)
    // Never repair when blockchain has LESS (could be fraud, failed withdrawals, etc.)
    if (result.status === 'mismatch' && result.difference > 0.00001 && result.difference < 1000000) {
      // Additional safety: don't repair extremely large amounts without manual review
      try {
        // Find the wallet and user
        const wallet = await Wallet.findByPk(result.wallet_id);
        if (!wallet) continue;

        const asset = result.asset || 'USDC';

        // Double-check: ensure this wallet actually received deposits recently
        // This prevents repairing wallets that just happen to have balances
        const recentDeposits = await sequelize.models.Transaction.findAll({
          where: {
            user_id: wallet.user_id,
            type: 'deposit',
            asset: asset,
            status: 'completed',
            created_at: {
              [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          limit: 1
        });

        if (recentDeposits.length === 0) {
          repairs.push({
            wallet_id: result.wallet_id,
            skipped: true,
            reason: `No recent ${asset} deposits found - manual review required`
          });
          continue;
        }

        // Create a repair transaction
        await sequelize.transaction(async (transaction) => {
          const userAccount = await Account.findOne({
            where: { user_id: wallet.user_id, asset },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });

          if (!userAccount) throw new Error('User account not found');

          const systemUser = await User.findOne({
            where: { email: process.env.SYSTEM_USER_EMAIL || SYSTEM_USER_EMAIL },
            transaction,
          });

          if (!systemUser) throw new Error('System user not found');

          const systemAccount = await Account.findOne({
            where: { user_id: systemUser.id, asset },
            transaction,
          });

          if (!systemAccount) throw new Error('System account not found');

          const repairTransaction = await Transaction.create({
            user_id: wallet.user_id,
            type: 'deposit',
            amount: result.difference.toString(),
            asset: asset,
            status: 'completed',
            tx_hash: `repair_${Date.now()}_${wallet.id}_${asset}`,
          }, { transaction });

          await getOrCreateAccount(wallet.user_id, asset, transaction);
          await creditAccount(wallet.user_id, result.difference.toString(), {
            asset,
            walletId: wallet.id,
            txHash: repairTransaction.tx_hash,
            metadata: {
              source: 'auto_repair_reconciliation',
              transaction_id: repairTransaction.id,
            },
            transaction,
          });

          await logAuditEvent(AUDIT_ACTIONS.DEPOSIT_REPROCESSED, {
            user_id: wallet.user_id,
            wallet_id: wallet.id,
            transaction_id: repairTransaction.id,
            amount: result.difference.toString(),
            asset: asset,
            metadata: {
              type: 'auto_repair_reconciliation',
              original_mismatch: result.difference,
              blockchain_balance: result.blockchain_balance,
              app_balance: result.app_balance
            }
          });

          repairs.push({
            wallet_id: result.wallet_id,
            repaired: true,
            amount: result.difference.toString(),
            asset: asset
          });
        });
      } catch (error) {
        repairs.push({
          wallet_id: result.wallet_id,
          skipped: true,
          reason: error.message
        });
      }
    }
  }

  return repairs;
}