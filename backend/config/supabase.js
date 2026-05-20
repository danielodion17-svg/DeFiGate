import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL and key are required for backend Supabase client configuration.');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️ Backend Supabase client is using a non-service key. For production, set SUPABASE_SERVICE_ROLE_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

(async () => {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.warn('⚠️ Supabase client initialized, but test query returned error:', error.message);
    } else {
      console.log('✅ Supabase client initialized');
    }
  } catch (err) {
    console.warn('⚠️ Supabase client initialized, but connection verification failed:', err.message);
  }
})();

export default supabase;