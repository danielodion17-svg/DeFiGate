import { createClient } from '@supabase/supabase-js';
import { Secrets } from './secrets.js';

const supabaseUrl = Secrets.SUPABASE_URL;
const supabaseAnonKey = Secrets.SUPABASE_ANON_KEY;
const supabaseServiceKey = Secrets.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAnonClient = null;
let supabaseServiceClient = null;

if (!supabaseUrl) {
  console.warn('⚠️ SUPABASE_URL (or VITE_SUPABASE_URL) not set — Supabase functionality disabled.');
} else {
  if (supabaseAnonKey) {
    supabaseAnonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    (async () => {
      try {
        const { error } = await supabaseAnonClient.from('users').select('id').limit(1);
        if (error) {
          console.warn('⚠️ Supabase anon client initialized, test query returned error:', error.message);
        } else {
          console.log('✅ Supabase anon client initialized');
        }
      } catch (err) {
        console.warn('⚠️ Supabase anon client initialized, but connection verification failed:', err?.message || err);
      }
    })();
  } else {
    console.warn('⚠️ SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) not set — read-only Supabase features will be disabled.');
  }

  if (supabaseServiceKey) {
    supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    (async () => {
      try {
        const { error } = await supabaseServiceClient.from('users').select('id').limit(1);
        if (error) {
          console.warn('⚠️ Supabase service client initialized, test query returned error:', error.message);
        } else {
          console.log('✅ Supabase service client initialized');
        }
      } catch (err) {
        console.warn('⚠️ Supabase service client initialized, but connection verification failed:', err?.message || err);
      }
    })();
  } else {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not set — admin/service Supabase functionality will be disabled.');
  }
}

// Backwards-compatible default named export `supabase` -> prefer anon client when present.
const supabase = supabaseAnonClient || supabaseServiceClient || null;

function hasServiceClient() {
  return !!supabaseServiceClient;
}

function requireServiceClient(action = 'this operation') {
  if (!supabaseServiceClient) {
    const err = new Error(`Supabase service role key not available — cannot perform ${action}.`);
    err.code = 'SUPABASE_SERVICE_KEY_MISSING';
    err.status = 503; // common HTTP status for unavailable server-side feature
    throw err;
  }
  return supabaseServiceClient;
}

export { supabaseAnonClient as supabaseAnonClient, supabaseServiceClient as supabaseServiceClient, supabase };
export { hasServiceClient, requireServiceClient };
export default supabase;
