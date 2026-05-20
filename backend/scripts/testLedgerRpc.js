import assert from 'assert';
import { supabase } from '../config/supabase.js';
import crypto from 'crypto';

function rpcCall(functionName, params = {}) {
  return supabase.rpc(functionName, params).then(({ data, error }) => {
    if (error) {
      const err = new Error(error.message || `RPC ${functionName} failed`);
      err.details = error;
      throw err;
    }
    return data;
  });
}

async function ensureTestUser(email) {
  const normalizedEmail = email.toLowerCase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  if (error) throw new Error(`Failed to query test user: ${error.message}`);
  if (data && data.length > 0) return data[0];

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert([{ email: normalizedEmail, name: 'Supabase RPC Test User' }])
    .select('*')
    .limit(1);

  if (createError) throw new Error(`Failed to create test user: ${createError.message}`);
  return created[0];
}

async function resetBalance(userId, asset = 'USDC') {
  const { error } = await supabase
    .from('balances')
    .upsert({ user_id: userId, asset, available_balance: 0, pending_balance: 0, is_frozen: false, freeze_reason: null, updated_at: new Date().toISOString() }, { onConflict: ['user_id', 'asset'] });
  if (error) throw new Error(`Failed to reset balance: ${error.message}`);
}

async function getBalance(userId, asset = 'USDC') {
  const { data, error } = await supabase
    .from('balances')
    .select('available_balance, pending_balance')
    .eq('user_id', userId)
    .eq('asset', asset)
    .limit(1)
    .single();

  if (error) throw new Error(`Failed to fetch balance: ${error.message}`);
  return {
    available: parseFloat(data.available_balance || 0),
    pending: parseFloat(data.pending_balance || 0),
  };
}

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

async function runTests() {
  console.log('🔧 Starting ledger RPC tests...');

  const alice = await ensureTestUser('rpc-test-alice@example.com');
  const bob = await ensureTestUser('rpc-test-bob@example.com');
  await resetBalance(alice.id);
  await resetBalance(bob.id);

  console.log('1) Testing duplicate credit by tx_hash');
  const txHash = `rpc-credit-${randomId()}`;
  await rpcCall('credit_account', {
    p_user_id: alice.id,
    p_amount: 100,
    p_asset: 'USDC',
    p_tx_hash: txHash,
    p_reference_id: `ref-${randomId()}`,
  });
  const firstCount = await supabase.from('account_ledger').select('*', { count: 'exact' }).eq('tx_hash', txHash);
  assert.strictEqual(firstCount.error, null);
  assert.strictEqual(firstCount.count, 1);

  await rpcCall('credit_account', {
    p_user_id: alice.id,
    p_amount: 100,
    p_asset: 'USDC',
    p_tx_hash: txHash,
    p_reference_id: `ref-${randomId()}`,
  });
  const secondCount = await supabase.from('account_ledger').select('*', { count: 'exact' }).eq('tx_hash', txHash);
  assert.strictEqual(secondCount.error, null);
  assert.strictEqual(secondCount.count, 1);

  console.log('✅ Duplicate deposit by tx_hash is idempotent');

  console.log('2) Testing insufficient balance rejection');
  try {
    await rpcCall('debit_account', {
      p_user_id: bob.id,
      p_amount: 10,
      p_asset: 'USDC',
      p_tx_hash: `rpc-debit-${randomId()}`,
    });
    throw new Error('Expected insufficient funds error');
  } catch (error) {
    assert.ok(/INSUFFICIENT_FUNDS/.test(error.message));
  }
  console.log('✅ Insufficient balance correctly rejected');

  console.log('3) Testing concurrent transfer locking');
  await rpcCall('credit_account', {
    p_user_id: alice.id,
    p_amount: 50,
    p_asset: 'USDC',
    p_tx_hash: `rpc-credit-${randomId()}`,
    p_reference_id: `ref-${randomId()}`,
  });

  const transferPromises = [
    rpcCall('transfer_funds', {
      p_sender_id: alice.id,
      p_receiver_id: bob.id,
      p_amount: 40,
      p_asset: 'USDC',
      p_reference_id: `concurrent-${randomId()}`,
      p_transfer_id: crypto.randomUUID(),
      p_metadata: { note: 'concurrent-transfer-1' },
    }).then(() => 'success1').catch((err) => ({ err1: err.message })),
    rpcCall('transfer_funds', {
      p_sender_id: alice.id,
      p_receiver_id: bob.id,
      p_amount: 40,
      p_asset: 'USDC',
      p_reference_id: `concurrent-${randomId()}`,
      p_transfer_id: crypto.randomUUID(),
      p_metadata: { note: 'concurrent-transfer-2' },
    }).then(() => 'success2').catch((err) => ({ err2: err.message })),
  ];

  const transferResults = await Promise.all(transferPromises);
  const successes = transferResults.filter((result) => result === 'success1' || result === 'success2');
  assert.strictEqual(successes.length, 1);
  console.log('✅ Concurrent transfer locking prevented double spend');

  console.log('4) Testing transfer_id replay protection');
  const transferId = crypto.randomUUID();
  await rpcCall('transfer_funds', {
    p_sender_id: alice.id,
    p_receiver_id: bob.id,
    p_amount: 5,
    p_asset: 'USDC',
    p_reference_id: `replay-${randomId()}`,
    p_transfer_id: transferId,
    p_metadata: { note: 'replay-transfer' },
  });

  const replayResult = await rpcCall('transfer_funds', {
    p_sender_id: alice.id,
    p_receiver_id: bob.id,
    p_amount: 5,
    p_asset: 'USDC',
    p_reference_id: `replay-${randomId()}`,
    p_transfer_id: transferId,
    p_metadata: { note: 'replay-transfer-duplicate' },
  });

  assert.ok(replayResult.idempotent || replayResult.existing_entries);
  console.log('✅ Replay by transfer_id is deduplicated');

  const finalAlice = await getBalance(alice.id);
  const finalBob = await getBalance(bob.id);
  assert(finalAlice.available >= 0);
  assert(finalBob.available >= 0);

  console.log('🎉 Ledger RPC tests completed successfully');
}

runTests().catch((error) => {
  console.error('❌ Ledger RPC tests failed:', error);
  process.exit(1);
});
