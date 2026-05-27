import { Connection, PublicKey } from '@solana/web3.js';
import { Op } from 'sequelize';
import {
  sequelize,
  User,
  Account,
  Transaction,
  Wallet,
  AccountLedger,
} from '../models/index.js';
import { logAuditEvent, AUDIT_ACTIONS } from './auditService.js';
import { processDeposit } from './depositService.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

function parseTokenAmount(tokenBalance) {
  if (!tokenBalance) return 0n;
  const amount = tokenBalance.uiAmountString || tokenBalance.amount || tokenBalance.uiAmount || '0';
  try {
    return BigInt(amount.toString().replace('.', ''));
  } catch {
    return BigInt(Math.floor(Number(amount) * 1e6));
  }
}

function formatUsdcAmount(amountBaseUnits) {
  const units = 1000000n;
  const whole = amountBaseUnits / units;
  const remainder = amountBaseUnits % units;
  return `${whole}.${remainder.toString().padStart(6, '0')}`;
}

async function getBlockchainBalances(address) {
  const balances = { sol: null, usdc: null };
  try {
    const publicKey = new PublicKey(address);
    const lamports = await connection.getBalance(publicKey, 'confirmed');
    balances.sol = Number(lamports) / 1e9;

    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: new PublicKey(USDC_MINT_ADDRESS),
    });

    let totalUsdc = 0n;
    for (const tokenAccount of tokenAccounts.value) {
      const tokenBalance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
      totalUsdc += BigInt(Math.floor((tokenBalance.value.uiAmount || 0) * 1e6));
    }

    balances.usdc = Number(totalUsdc) / 1e6;
  } catch (error) {
    console.error(`Blockchain balance fetch failed for ${address}:`, error?.message || error);
  }

  return balances;
}

async function getDerivedLedgerBalances(userId) {
  const rows = await sequelize.query(
    `SELECT asset, COALESCE(SUM(amount::numeric), 0) AS amount FROM account_ledger WHERE user_id = ? GROUP BY asset`,
    {
      replacements: [userId],
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return rows.reduce((map, row) => {
    map[row.asset] = Number(row.amount);
    return map;
  }, {});
}

async function getCachedBalances(userId) {
  const balances = await Account.findAll({ where: { user_id: userId } });
  return balances.map((balance) => ({
    asset: balance.asset,
    available_balance: Number(balance.available_balance),
    pending_balance: Number(balance.pending_balance),
  }));
}

async function getMissingTransactionCount(userId) {
  return Transaction.count({
    where: {
      user_id: userId,
      [Op.or]: [
        { tx_hash: null },
        { tx_hash: '' },
        { reference_id: null },
        { reference_id: '' },
      ],
    },
  });
}

async function getDuplicateWalletCount(userId) {
  const wallets = await Wallet.findAll({ where: { user_id: userId } });
  if (wallets.length <= 1) return 0;

  const addressCounts = wallets.reduce((count, wallet) => {
    if (!wallet.address) return count;
    count[wallet.address] = (count[wallet.address] || 0) + 1;
    return count;
  }, {});

  return wallets.filter((wallet) => wallet.address && addressCounts[wallet.address] > 1).length;
}

async function getCanonicalWallet(userId) {
  const primaryWallet = await Wallet.findOne({ where: { user_id: userId, is_primary: true } });
  if (primaryWallet) return primaryWallet;
  return Wallet.findOne({ where: { user_id: userId }, order: [['created_at', 'ASC']] });
}

function getSolDepositAmount(tx, walletAddress) {
  if (!tx?.meta || tx.meta.err || !Array.isArray(tx.meta.preBalances) || !Array.isArray(tx.meta.postBalances) || !Array.isArray(tx.transaction?.message?.accountKeys)) {
    return 0n;
  }
  const accountKeys = tx.transaction.message.accountKeys.map((key) => key.toString());
  const index = accountKeys.indexOf(walletAddress);
  if (index < 0) return 0n;
  const before = BigInt(tx.meta.preBalances[index] || 0);
  const after = BigInt(tx.meta.postBalances[index] || 0);
  const delta = after - before;
  return delta > 0n ? delta : 0n;
}

function getUsdcDepositAmount(tx, walletAddress) {
  if (!tx?.meta) return 0n;
  const before = new Map();
  for (const pre of tx.meta.preTokenBalances || []) {
    if (pre.owner !== walletAddress || pre.mint !== USDC_MINT_ADDRESS) continue;
    before.set(pre.accountIndex, parseTokenAmount(pre.uiTokenAmount || pre));
  }

  let total = 0n;
  for (const post of tx.meta.postTokenBalances || []) {
    if (post.owner !== walletAddress || post.mint !== USDC_MINT_ADDRESS) continue;
    const index = post.accountIndex;
    const preAmount = before.get(index) || 0n;
    const postAmount = parseTokenAmount(post.uiTokenAmount || post);
    const delta = postAmount - preAmount;
    if (delta > 0n) total += delta;
  }

  return total;
}

export async function generateForensicReport({ scanBlockchain = false, limit = 100 } = {}) {
  const users = await User.findAll({ limit, order: [['created_at', 'ASC']] });
  const report = [];
  let totalMismatches = 0;
  let totalDuplicates = 0;
  let totalMissingTx = 0;

  for (const user of users) {
    const canonicalWallet = await getCanonicalWallet(user.id);
    const cachedBalances = await getCachedBalances(user.id);
    const ledgerBalances = await getDerivedLedgerBalances(user.id);
    const missingTxCount = await getMissingTransactionCount(user.id);
    const duplicateWalletCount = await getDuplicateWalletCount(user.id);
    const blockchainBalances = canonicalWallet && scanBlockchain && canonicalWallet.address ? await getBlockchainBalances(canonicalWallet.address) : { sol: null, usdc: null };

    const mismatchAmounts = cachedBalances.reduce((acc, balance) => {
      const derived = ledgerBalances[balance.asset] ?? 0;
      const mismatch = Number(balance.available_balance) - Number(derived);
      if (Math.abs(mismatch) > 0.000001) acc[balance.asset] = mismatch;
      return acc;
    }, {});

    if (Object.keys(mismatchAmounts).length > 0) totalMismatches += 1;
    totalDuplicates += duplicateWalletCount;
    totalMissingTx += missingTxCount;

    report.push({
      user_id: user.id,
      email: user.email,
      canonical_wallet: canonicalWallet ? {
        id: canonicalWallet.id,
        address: canonicalWallet.address,
        provider: canonicalWallet.provider,
        chain: canonicalWallet.chain,
        is_primary: canonicalWallet.is_primary,
      } : null,
      blockchain_balances: blockchainBalances,
      ledger_balances: ledgerBalances,
      cached_balances: cachedBalances,
      mismatch_amounts: mismatchAmounts,
      missing_transactions_count: missingTxCount,
      duplicate_wallet_count: duplicateWalletCount,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    total_users: users.length,
    users_with_mismatches: totalMismatches,
    total_duplicate_wallets: totalDuplicates,
    total_missing_transaction_flags: totalMissingTx,
    report,
    recommendations: [
      'Archive duplicate canonical wallets and keep the oldest primary wallet.',
      'Ensure canonical wallet rows exist for all users before removing legacy columns.',
      'Rebuild balances cache from account_ledger and reconcile any mismatches.',
      'Scan wallet history for missing on-chain deposits and repair missing deposits idempotently.',
      'Use offline data migration to handle any legacy ledger_entries cleanup.',
      'Verify financial integrity with blockchain balances, ledger totals, and cache projections.',
    ],
  };
}

export async function archiveDuplicateWallets() {
  const wallets = await Wallet.findAll({ order: [['created_at', 'ASC']] });
  const grouped = wallets.reduce((acc, wallet) => {
    if (!wallet.user_id) return acc;
    acc[wallet.user_id] = acc[wallet.user_id] || [];
    acc[wallet.user_id].push(wallet);
    return acc;
  }, {});

  const archivedIds = [];

  for (const userId of Object.keys(grouped)) {
    const userWallets = grouped[userId];
    if (userWallets.length <= 1) continue;

    const primary = userWallets.find((wallet) => wallet.is_primary) || userWallets[0];
    for (const wallet of userWallets) {
      if (wallet.id === primary.id) continue;
      if (wallet.is_archived && wallet.archived_at) continue;
      wallet.is_archived = true;
      wallet.is_primary = false;
      wallet.archived_at = new Date();
      await wallet.save();
      archivedIds.push(wallet.id);
    }

    if (!primary.is_primary) {
      primary.is_primary = true;
      await primary.save();
    }
  }

  return {
    archived_wallet_ids: archivedIds,
    archived_count: archivedIds.length,
    message: archivedIds.length > 0 ? 'Duplicate canonical wallets archived.' : 'No duplicate canonical wallets found.',
  };
}

export async function backfillCanonicalWallets() {
  return {
    disabled: true,
    message: 'Legacy wallet backfill is disabled in the canonical runtime. Use an offline migration to populate canonical wallets from legacy data sources.',
  };
}

export async function repairWallet(walletId) {
  const wallet = await Wallet.findByPk(walletId);
  if (!wallet) throw new Error('Wallet not found');

  const repairs = {
    wallet_id: walletId,
    updated_fields: {},
    scanned: null,
    balance_rebuild: null,
  };

  const updates = {};
  if (!wallet.chain) updates.chain = 'solana';
  if (!wallet.provider) updates.provider = 'solana';
  if (wallet.is_archived) updates.is_archived = false;
  if (Object.keys(updates).length > 0) {
    await wallet.update(updates);
    repairs.updated_fields = updates;
  }

  const primaryCandidate = await Wallet.findOne({ where: { user_id: wallet.user_id, is_primary: true } });
  if (!primaryCandidate) {
    await wallet.update({ is_primary: true });
    repairs.updated_fields.is_primary = true;
  }

  repairs.scanned = await recoverMissingOnchainDeposits({ walletId });
  repairs.balance_rebuild = await rebuildBalancesFromLedger();

  return repairs;
}

export async function rebuildBalancesFromLedger() {
  const completedStatuses = ['completed', 'confirmed'];
  const pendingStatuses = ['pending', 'pending_review', 'approved', 'broadcasting', 'broadcasted'];

  const ledgerRows = await sequelize.query(
    `SELECT
      al.user_id,
      al.asset,
      COALESCE(SUM(CASE WHEN t.status IN (${completedStatuses.map((s) => `'${s}'`).join(',')}) THEN al.amount::numeric ELSE 0 END), 0) AS available_balance,
      COALESCE(SUM(CASE WHEN t.status IN (${pendingStatuses.map((s) => `'${s}'`).join(',')}) THEN al.amount::numeric ELSE 0 END), 0) AS pending_balance
    FROM account_ledger al
    LEFT JOIN transactions t ON t.id = al.transaction_id
    GROUP BY al.user_id, al.asset`,
    {
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const updates = [];

  await sequelize.transaction(async (transaction) => {
    for (const row of ledgerRows) {
      const available = Math.max(0, Number(row.available_balance || 0));
      const pending = Math.max(0, Number(row.pending_balance || 0));

      const [account] = await Account.findOrCreate({
        where: { user_id: row.user_id, asset: row.asset },
        defaults: {
          available_balance: available,
          pending_balance: pending,
        },
        transaction,
      });

      const before = {
        available_balance: Number(account.available_balance),
        pending_balance: Number(account.pending_balance),
      };
      const after = { available_balance: available, pending_balance: pending };

      if (before.available_balance !== after.available_balance || before.pending_balance !== after.pending_balance) {
        await account.update(after, { transaction });
        updates.push({ balance_id: account.id, user_id: row.user_id, asset: row.asset, before, after });
      }
    }
  });

  for (const update of updates) {
    await logAuditEvent(AUDIT_ACTIONS.ADMIN_ACTION, {
      action: 'rebuild_balances_from_ledger',
      user_id: update.user_id,
      amount: update.after.available_balance - update.before.available_balance,
      asset: update.asset,
      metadata: {
        balance_id: update.balance_id,
        before: update.before,
        after: update.after,
      },
      severity: 'info',
    });
  }

  return {
    updated_count: updates.length,
    updates,
  };
}

async function fetchTransaction(signature) {
  return connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
}

export async function recoverMissingOnchainDeposits({ walletId, batchSize = 50 } = {}) {
  if (!walletId) throw new Error('walletId is required');

  const wallet = await Wallet.findByPk(walletId);
  if (!wallet || !wallet.address) {
    throw new Error('Wallet not found or missing address');
  }

  const publicKey = new PublicKey(wallet.address);
  const results = { processed: 0, skipped: 0, errors: [] };
  let before;

  while (true) {
    const options = { limit: batchSize };
    if (before) options.before = before;
    const signatures = await connection.getSignaturesForAddress(publicKey, options);
    if (!signatures || signatures.length === 0) break;

    for (const signatureInfo of signatures) {
      try {
        const tx = await fetchTransaction(signatureInfo.signature);
        if (!tx) {
          results.skipped += 1;
          continue;
        }

        const solAmount = getSolDepositAmount(tx, wallet.address);
        const usdcAmount = getUsdcDepositAmount(tx, wallet.address);
        if (solAmount <= 0n && usdcAmount <= 0n) {
          results.skipped += 1;
          continue;
        }

        const asset = usdcAmount > 0n ? 'USDC' : 'SOL';
        const amount = usdcAmount > 0n ? formatUsdcAmount(usdcAmount) : (Number(solAmount) / 1e9).toFixed(9);

        await processDeposit({
          wallet_address: wallet.address,
          tx_hash: signatureInfo.signature,
          chain: wallet.chain || 'solana',
          asset,
          amount,
          source: 'repair_missing_onchain_deposit',
          metadata: { wallet_id: wallet.id },
        });

        results.processed += 1;
      } catch (error) {
        if (String(error.message).includes('TX_HASH_CONFLICT') || String(error.message).includes('already processed')) {
          results.skipped += 1;
        } else {
          results.errors.push({ signature: signatureInfo.signature, error: String(error.message) });
        }
      }
    }

    before = signatures[signatures.length - 1].signature;
    if (!before) break;
  }

  await wallet.update({ last_scanned_signature: before, last_scanned_at: new Date() });
  return results;
}

export async function migrateLegacyLedgerEntries({ batchSize = 500 } = {}) {
  const tableExists = await sequelize.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries' AND table_schema = 'public') AS exists`,
    { type: sequelize.QueryTypes.SELECT }
  );

  if (!tableExists[0]?.exists) {
    return { migrated_entries: 0, migrated_ids: [], message: 'No legacy ledger_entries table present' };
  }

  const legacyRows = await sequelize.query(
    `SELECT le.id, le.transaction_id, le.debit_account_id, le.credit_account_id, le.amount, le.created_at, t.user_id, COALESCE(t.asset, 'USDC') AS asset, t.reference AS reference_id
      FROM ledger_entries le
      LEFT JOIN transactions t ON t.id = le.transaction_id
      WHERE COALESCE(le.is_deprecated, FALSE) IS NOT TRUE
      ORDER BY le.created_at ASC
      LIMIT ?`,
    {
      replacements: [batchSize],
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const migrated = [];
  await sequelize.transaction(async (transaction) => {
    for (const row of legacyRows) {
      const exists = await AccountLedger.findOne({
        where: {
          transaction_id: row.transaction_id,
          debit_account_id: row.debit_account_id,
          credit_account_id: row.credit_account_id,
          amount: row.amount,
        },
        transaction,
      });
      if (exists) continue;

      await AccountLedger.create(
        {
          transaction_id: row.transaction_id,
          user_id: row.user_id,
          wallet_id: null,
          asset: row.asset,
          amount: row.amount,
          entry_type: 'legacy',
          reference_id: row.reference_id,
          metadata: { migrated_from: 'ledger_entries', legacy_id: row.id },
          created_at: row.created_at || new Date(),
        },
        { transaction }
      );

      await sequelize.query(`UPDATE ledger_entries SET is_deprecated = TRUE WHERE id = ?`, {
        replacements: [row.id],
        transaction,
      });

      migrated.push(row.id);
    }
  });

  return { migrated_entries: migrated.length, migrated_ids: migrated };
}

export async function verifyFinancialIntegrity({ scanBlockchain = false, walletLimit = 50 } = {}) {
  const issues = {
    balance_mismatches: [],
    negative_balances: [],
    duplicate_tx_hashes: [],
    orphan_transactions: [],
    orphan_ledger_entries: [],
    missing_assets: [],
    invalid_wallet_references: [],
    inconsistent_transfer_states: [],
    blockchain_shortages: [],
  };

  const balanceRows = await sequelize.query(
    `SELECT b.id AS balance_id, b.user_id, b.asset, b.available_balance, b.pending_balance,
      COALESCE(SUM(CASE WHEN al.credit_account_id = b.id THEN al.amount::numeric ELSE 0 END), 0) AS ledger_credits,
      COALESCE(SUM(CASE WHEN al.debit_account_id = b.id THEN al.amount::numeric ELSE 0 END), 0) AS ledger_debits
    FROM balances b
    LEFT JOIN account_ledger al ON al.debit_account_id = b.id OR al.credit_account_id = b.id
    GROUP BY b.id, b.user_id, b.asset, b.available_balance, b.pending_balance`,
    { type: sequelize.QueryTypes.SELECT }
  );

  for (const row of balanceRows) {
    const ledgerBalance = Number(row.ledger_credits) - Number(row.ledger_debits);
    if (Math.abs(Number(row.available_balance) - ledgerBalance) > 0.000001) {
      issues.balance_mismatches.push({
        balance_id: row.balance_id,
        user_id: row.user_id,
        asset: row.asset,
        cached: Number(row.available_balance),
        ledger: ledgerBalance,
      });
    }
    if (Number(row.available_balance) < 0 || Number(row.pending_balance) < 0) {
      issues.negative_balances.push({
        balance_id: row.balance_id,
        available_balance: Number(row.available_balance),
        pending_balance: Number(row.pending_balance),
      });
    }
  }

  const txDuplicates = await sequelize.query(
    `SELECT tx_hash, COUNT(*) AS count FROM transactions WHERE tx_hash IS NOT NULL GROUP BY tx_hash HAVING COUNT(*) > 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  issues.duplicate_tx_hashes = txDuplicates;

  const orphanTxs = await sequelize.query(
    `SELECT t.id, t.user_id, t.wallet_id FROM transactions t
      LEFT JOIN wallets w ON t.wallet_id = w.id
      WHERE t.wallet_id IS NOT NULL AND w.id IS NULL`,
    { type: sequelize.QueryTypes.SELECT }
  );
  issues.invalid_wallet_references = orphanTxs;

  const orphanLedger = await sequelize.query(
    `SELECT al.id, al.transaction_id, al.debit_account_id, al.credit_account_id FROM account_ledger al
      LEFT JOIN transactions t ON al.transaction_id = t.id
      LEFT JOIN balances bd ON al.debit_account_id = bd.id
      LEFT JOIN balances bc ON al.credit_account_id = bc.id
      WHERE t.id IS NULL OR bd.id IS NULL OR bc.id IS NULL`,
    { type: sequelize.QueryTypes.SELECT }
  );
  issues.orphan_ledger_entries = orphanLedger;

  const missingAssetRows = await sequelize.query(
    `SELECT id, user_id, type FROM transactions WHERE asset IS NULL OR TRIM(asset) = ''`,
    { type: sequelize.QueryTypes.SELECT }
  );
  issues.missing_assets = missingAssetRows;

  const inconsistentTransfers = await sequelize.query(
    `SELECT id, user_id, status FROM transactions WHERE type = 'transfer' AND status IN ('pending', 'failed', 'rejected')`,
    { type: sequelize.QueryTypes.SELECT }
  );
  issues.inconsistent_transfer_states = inconsistentTransfers;

  if (scanBlockchain) {
    const wallets = await Wallet.findAll({ where: { chain: 'solana', address: { [Op.ne]: null } }, limit: walletLimit });
    for (const wallet of wallets) {
      const blockchain = await getBlockchainBalances(wallet.address);
      const userLedger = await getDerivedLedgerBalances(wallet.user_id);
      const ledgerAsset = userLedger['USDC'] ?? 0;
      if (blockchain.usdc !== null && blockchain.usdc < ledgerAsset) {
        issues.blockchain_shortages.push({
          wallet_id: wallet.id,
          address: wallet.address,
          blockchain_usdc: blockchain.usdc,
          ledger_usdc: ledgerAsset,
        });
      }
    }
  }

  const issueCount = Object.values(issues).reduce((sum, list) => sum + list.length, 0);
  const riskScore = Math.max(0, 100 - issueCount * 5);

  return {
    generated_at: new Date().toISOString(),
    issue_count: issueCount,
    risk_score: riskScore,
    issues,
    summary: {
      balance_mismatches: issues.balance_mismatches.length,
      negative_balances: issues.negative_balances.length,
      duplicate_tx_hashes: issues.duplicate_tx_hashes.length,
      orphan_transactions: issues.invalid_wallet_references.length,
      orphan_ledger_entries: issues.orphan_ledger_entries.length,
      missing_assets: issues.missing_assets.length,
      inconsistent_transfer_states: issues.inconsistent_transfer_states.length,
      blockchain_shortages: issues.blockchain_shortages.length,
    },
  };
}
