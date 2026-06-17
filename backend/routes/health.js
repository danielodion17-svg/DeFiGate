import express from 'express';
import { sequelize } from '../models/index.js';
import { testRpcConnection } from '../services/solanaRpcClient.js';
import scheduler from '../worker/scheduler.js';
import { getSystemGasWalletStatus } from '../services/gasWalletService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const dbReady = await sequelize.authenticate().then(() => true).catch(() => false);
    const rpcReady = await testRpcConnection();
    const schedulerRunning = scheduler.isRunning();
    const gasWalletStatus = await getSystemGasWalletStatus();

    const health = {
      service: 'DeFiGate API',
      timestamp: new Date().toISOString(),
      database: dbReady ? 'ok' : 'failed',
      solana_rpc: rpcReady ? 'ok' : 'failed',
      scheduler: schedulerRunning ? 'running' : 'stopped',
      gas_wallet: gasWalletStatus,
    };

    const allHealthy = dbReady && rpcReady;
    return res.status(allHealthy ? 200 : 503).json({ ok: allHealthy, ...health });
  } catch (error) {
    console.error('Health check error', error);
    return res.status(503).json({ ok: false, service: 'DeFiGate API', timestamp: new Date().toISOString(), error: error.message || 'Health check failed' });
  }
});

export default router;
