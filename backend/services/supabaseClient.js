import { supabase as supabaseDefault, supabaseAnonClient, supabaseServiceClient, requireServiceClient } from '../config/supabase.js';

function readClient() {
  return supabaseAnonClient || supabaseServiceClient;
}

export function supabaseQuery(table) {
  const client = readClient();
  if (!client) throw new Error('Supabase client not configured for reads');
  return client.from(table);
}

export async function fetchOne(table, filterBuilder) {
  const client = readClient();
  if (!client) throw new Error('Supabase client not configured for reads');
  const query = filterBuilder(client.from(table).select('*'));
  const { data, error } = await query.limit(1).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Supabase query failed');
  }
  return data || null;
}

export async function fetchMany(table, filterBuilder, options = {}) {
  const client = readClient();
  if (!client) throw new Error('Supabase client not configured for reads');
  let query = filterBuilder(client.from(table).select('*'));
  if (options.order) {
    for (const ord of options.order) {
      query = query.order(ord.column, { ascending: ord.ascending });
    }
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Supabase query failed');
  }
  return data || [];
}

export async function insertOne(table, payload) {
  const svc = requireServiceClient(`insert into ${table}`);
  const { data, error } = await svc.from(table).insert(payload).select().single();
  if (error) {
    throw new Error(error.message || 'Supabase insert failed');
  }
  return data;
}

export async function updateOne(table, filterBuilder, payload) {
  const svc = requireServiceClient(`update ${table}`);
  const query = filterBuilder(svc.from(table).update(payload).select('*'));
  const { data, error } = await query.limit(1).single();
  if (error) {
    throw new Error(error.message || 'Supabase update failed');
  }
  return data;
}
