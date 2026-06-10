/**
 * Startup validation module
 * Checks critical environment variables and database schema integrity
 */

import { sequelize } from '../models/index.js';

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
];

const OPTIONAL_ENV_VARS_WITH_DEFAULTS = {
  'NODE_ENV': 'development',
  'PORT': '5000',
};
// Note: Do NOT default SOLANA RPC to a public endpoint. Require SOLANA_RPC_URLS or SOLANA_RPC_URL to be set in production.

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables() {
  const missing = [];
  
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    const msg = `❌ Missing required environment variables: ${missing.join(', ')}`;
    console.error(msg);
    throw new Error(msg);
  }
  
  console.log('✅ All required environment variables present');
}

/**
 * Validate database schema integrity
 * Checks for canonical tables and append-only triggers
 */
export async function validateDatabaseSchema() {
  const requiredTables = [
    'users',
    'wallets',
    'transactions',
    'account_ledger',
    'balances',
    'audit_logs',
  ];

  const requiredIndexes = {
    'users': [['idx_users_email']],
    'wallets': [['idx_wallets_user_id_unique', 'wallets_user_id_unique'], ['idx_wallets_address_unique', 'wallets_address_unique']],
    'transactions': [['idx_transactions_tx_hash_unique']],
    'account_ledger': [['ux_account_ledger_tx_hash_asset']],
    'balances': [['idx_balances_user_asset_unique', 'unique_user_asset', 'accounts_user_asset_unique']],
  };

  const requiredTriggers = {
    'account_ledger': 'trg_account_ledger_prevent_update_delete',
    'audit_logs': 'trg_audit_logs_prevent_update_delete',
  };

  try {
    // Check tables exist
    for (const table of requiredTables) {
      const result = await sequelize.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = 'public')`
      );
      if (!result[0][0].exists) {
        throw new Error(`Missing table: ${table}`);
      }
    }
    console.log(`✅ All ${requiredTables.length} canonical tables present`);

    // Check indexes
    let indexCount = 0;
    for (const [table, indexGroups] of Object.entries(requiredIndexes)) {
      for (const indexGroup of indexGroups) {
        const names = Array.isArray(indexGroup) ? indexGroup : [indexGroup];
        const quotedNames = names.map((name) => `'${name}'`).join(', ');
        const result = await sequelize.query(
          `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = '${table}' AND indexname IN (${quotedNames}) AND schemaname = 'public')`
        );
        if (!result[0][0].exists) {
          throw new Error(`Missing index: ${names.join(' or ')} on table ${table}`);
        }
        indexCount++;
      }
    }
    console.log(`✅ All ${indexCount} canonical indexes present`);

    // Check append-only triggers
    let triggerCount = 0;
    for (const [table, triggerName] of Object.entries(requiredTriggers)) {
      const result = await sequelize.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = '${triggerName}' AND event_object_table = '${table}')`
      );
      if (!result[0][0].exists) {
        throw new Error(`Missing append-only trigger: ${triggerName} on table ${table}`);
      }
      triggerCount++;
    }
    console.log(`✅ All ${triggerCount} append-only triggers present`);

    // Verify legacy fields in users table are not fatal
    const usersColumns = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public'`
    );
    const columnNames = usersColumns[0].map(col => col.column_name);
    const legacyFields = ['wallet_address', 'privy_wallet_id'];
    const foundLegacyFields = legacyFields.filter((field) => columnNames.includes(field));
    if (foundLegacyFields.length > 0) {
      console.warn(`⚠️ Legacy user fields still present: ${foundLegacyFields.map((f) => `users.${f}`).join(', ')}`);
    } else {
      console.log('✅ No legacy wallet fields in users table');
    }

    return true;
  } catch (err) {
    console.error('❌ Schema validation failed:', err.message);
    throw err;
  }
}

/**
 * Validate canonical service requirements
 */
export function validateServiceConfiguration() {
  const warnings = [];

  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
    warnings.push('⚠️  Privy credentials not configured; wallet creation will use local placeholders only');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push('⚠️  Supabase service role key missing; admin operations will fail at runtime');
  }

  for (const [key, defaultValue] of Object.entries(OPTIONAL_ENV_VARS_WITH_DEFAULTS)) {
    if (!process.env[key]) {
      console.log(`ℹ️  ${key} not set; using default: ${defaultValue}`);
    }
  }

  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(w));
  }

  console.log('✅ Service configuration validated');
}

/**
 * Run all startup validations
 */
export async function runStartupValidation() {
  console.log('\n📋 Running startup validations...\n');
  
  try {
    validateEnvironmentVariables();
    await validateDatabaseSchema();
    validateServiceConfiguration();
    
    console.log('\n✅ All startup validations passed\n');
    return true;
  } catch (err) {
    console.error('\n❌ Startup validation failed\n');
    throw err;
  }
}
