import { supabase } from '../config/supabase.js';

export function supabaseQuery(table) {
  return supabase.from(table);
}

export async function fetchOne(table, filterBuilder) {
  const query = filterBuilder(supabase.from(table).select('*'));
  const { data, error } = await query.limit(1).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Supabase query failed');
  }
  return data || null;
}

export async function fetchMany(table, filterBuilder, options = {}) {
  let query = filterBuilder(supabase.from(table).select('*'));
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
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) {
    throw new Error(error.message || 'Supabase insert failed');
  }
  return data;
}

export async function updateOne(table, filterBuilder, payload) {
  const query = filterBuilder(supabase.from(table).update(payload).select('*'));
  const { data, error } = await query.limit(1).single();
  if (error) {
    throw new Error(error.message || 'Supabase update failed');
  }
  return data;
}
