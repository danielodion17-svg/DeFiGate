// Test script for reconciliation and audit logging
import { runReconciliation } from '../services/reconciliationService.js';
import { getAuditLogs } from '../services/auditService.js';

async function testReconciliation() {
  console.log('🧪 Testing reconciliation service...');

  try {
    const result = await runReconciliation();
    console.log('✅ Reconciliation completed:', {
      total_wallets: result.total_wallets,
      matched: result.matched,
      mismatches: result.mismatches,
      errors: result.errors
    });

    if (result.results.length > 0) {
      console.log('📊 Sample result:', result.results[0]);
    }
  } catch (error) {
    console.error('❌ Reconciliation test failed:', error);
  }
}

async function testAuditLogs() {
  console.log('🧪 Testing audit logs...');

  try {
    const logs = await getAuditLogs({ limit: 5 });
    console.log('✅ Found', logs.length, 'audit log entries');

    if (logs.length > 0) {
      console.log('📊 Sample log:', logs[0]);
    }
  } catch (error) {
    console.error('❌ Audit logs test failed:', error);
  }
}

async function main() {
  await testReconciliation();
  await testAuditLogs();
  console.log('🎉 All tests completed');
  process.exit(0);
}

main().catch(console.error);