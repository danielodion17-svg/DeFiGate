import {
  generateForensicReport,
  archiveDuplicateWallets,
  backfillCanonicalWallets,
  rebuildBalancesFromLedger,
  recoverMissingOnchainDeposits,
  migrateLegacyLedgerEntries,
  verifyFinancialIntegrity,
} from '../services/repairService.js';

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  if (!command) {
    console.log('Usage: node scripts/repairPhase.js <command> [walletId]');
    console.log('Commands: forensic-report, archive-duplicates, backfill-wallets, rebuild-balances, scan-wallet-history, migrate-ledger, verify-integrity');
    process.exit(0);
  }

  try {
    switch (command) {
      case 'forensic-report': {
        const report = await generateForensicReport({ scanBlockchain: false });
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      case 'archive-duplicates': {
        const result = await archiveDuplicateWallets();
        console.log('Archived duplicate wallets:', result);
        break;
      }
      case 'backfill-wallets': {
        const result = await backfillCanonicalWallets();
        console.log('Backfilled canonical wallet relationships:', result);
        break;
      }
      case 'rebuild-balances': {
        const result = await rebuildBalancesFromLedger();
        console.log('Rebuild balances result:', result);
        break;
      }
      case 'scan-wallet-history': {
        const walletId = arg;
        const result = await recoverMissingOnchainDeposits({ walletId });
        console.log('Wallet history scan result:', result);
        break;
      }
      case 'migrate-ledger': {
        const result = await migrateLegacyLedgerEntries();
        console.log('Legacy ledger migration result:', result);
        break;
      }
      case 'verify-integrity': {
        const result = await verifyFinancialIntegrity({ scanBlockchain: false });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.error('Unknown command:', command);
        process.exit(1);
    }
  } catch (error) {
    console.error('Repair phase error:', error);
    process.exit(1);
  }
}

main();
