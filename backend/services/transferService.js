import { supabase } from '../config/supabase.js';

const DEFAULT_ASSET = 'USDC';
const AMOUNT_REGEX = /^\d+(?:\.\d{1,6})?$/;

function normalizeAmount(amount) {
  const amountString = String(amount).trim();
  if (!AMOUNT_REGEX.test(amountString)) {
    throw new Error('INVALID_AMOUNT');
  }
  if (amountString === '0' || /^0+(\.0+)?$/.test(amountString)) {
    throw new Error('INVALID_AMOUNT');
  }
  return amountString;
}

async function rpcCall(functionName, params = {}) {
  const { data, error } = await supabase.rpc(functionName, params);
  if (error) {
    throw new Error(error.message || `RPC ${functionName} failed`);
  }
  return data;
}

export async function transferFunds(senderId, receiverId, amount, options = {}) {
  if (!senderId || !receiverId) {
    throw new Error('INVALID_PARTIES');
  }
  if (senderId === receiverId) {
    throw new Error('SELF_TRANSFER_NOT_ALLOWED');
  }

  const asset = options.asset || DEFAULT_ASSET;
  const idempotencyKey = options.idempotencyKey?.trim() || null;
  const reference = options.reference?.trim() || idempotencyKey || null;
  const amountString = normalizeAmount(amount);

  if (reference) {
    const { data: existingTx, error: queryErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', senderId)
      .eq('type', 'transfer')
      .eq('reference', reference)
      .eq('asset', asset)
      .limit(1);

    if (queryErr) {
      throw new Error(queryErr.message || 'Failed to query transactions');
    }
    if (existingTx && existingTx.length > 0) {
      return existingTx[0];
    }
  }

  const { data: createdTx, error: createErr } = await supabase
    .from('transactions')
    .insert([
      {
        user_id: senderId,
        type: 'transfer',
        status: 'pending',
        amount: amountString,
        asset,
        reference,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
      },
    ])
    .select('*');

  if (createErr) {
    throw new Error(createErr.message || 'Failed to create transaction');
  }
  const transactionRecord = (createdTx && createdTx[0]) || null;
  if (!transactionRecord) throw new Error('Failed to create transaction record');

  try {
    const rpcResult = await rpcCall('transfer_funds', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
      p_amount: amountString,
      p_asset: asset,
      p_wallet_id: null,
      p_tx_hash: `transfer_${transactionRecord.id}`,
      p_reference_id: reference,
      p_transfer_id: transactionRecord.id,
      p_metadata: {
        sender_id: senderId,
        receiver_id: receiverId,
      },
      p_audit_actor_id: senderId,
      p_transaction_id: transactionRecord.id,
    });

    await supabase
      .from('transactions')
      .update({ status: 'completed', confirmed_at: new Date().toISOString() })
      .eq('id', transactionRecord.id);

    return transactionRecord;
  } catch (error) {
    await supabase.from('transactions').update({ status: 'failed' }).eq('id', transactionRecord.id);
    throw error;
  }
}
