import pool from '../db.js';

async function checkSchema() {
  try {
    console.log('🔍 Checking database schema...');

    const checks = [
      { table: 'transactions', column: 'asset' },
      { table: 'users', column: 'is_frozen' },
      { table: 'transactions', column: 'recipient_address' },
      { table: 'transactions', column: 'wallet_id' },
      { table: 'audit_logs', column: 'request_id' }
    ];

    for (const check of checks) {
      const result = await pool.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
        [check.table, check.column]
      );
      console.log(`${check.table}.${check.column}: ${result.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
    }

    // Test the actual query
    console.log('\n🧪 Testing getTransactions query...');
    const testQuery = `
      SELECT id, type, amount, asset, status, tx_hash, reference, recipient_address, created_at, broadcasted_at, confirmed_at, failed_at, failure_reason, network_fee, 'outgoing'::text AS direction
      FROM transactions
      WHERE user_id = $1
      LIMIT 1
    `;

    // Use a dummy UUID for testing
    const dummyUserId = '00000000-0000-0000-0000-000000000000';
    await pool.query(testQuery, [dummyUserId]);
    console.log('✅ Query syntax is valid');

  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
  } finally {
    process.exit(0);
  }
}

checkSchema();