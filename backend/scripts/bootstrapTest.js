import dotenv from 'dotenv';
dotenv.config();

import { runStartupValidation } from './startupValidation.js';
import { testRpcConnection } from '../services/solanaRpcClient.js';

async function main() {
  console.log('🔧 Running backend bootstrap test...');

  try {
    await runStartupValidation();
    const rpcHealthy = await testRpcConnection();
    console.log(`🛰️ Solana RPC health: ${rpcHealthy ? 'ok' : 'failed'}`);

    if (!rpcHealthy) {
      throw new Error('Solana RPC health check failed. Check SOLANA_RPC_URLS or SOLANA_RPC_URL.');
    }

    console.log('✅ Bootstrap test passed. Backend is ready for development startup.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Bootstrap test failed:', error.message || error);
    process.exit(1);
  }
}

main();
