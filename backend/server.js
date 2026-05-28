import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { sequelize } from "./models/index.js";
import rampRoutes from "./routes/ramp.js";
import walletRoutes from "./routes/wallet.js";
import userRoutes from "./routes/user.js";
import transferRoutes from "./routes/transfer.js";
import testRoutes from "./routes/test.js";
import adminRoutes from "./routes/admin.js";
import { requestContext } from "./middleware/requestContext.js";
import { startReconciliationJob } from "./services/reconciliationJob.js";
import { startBalanceSyncJob } from "./services/balanceSyncService.js";
import { runStartupValidation } from "./scripts/startupValidation.js";

const app = express();

// ======================
// ENV CHECK
// ======================
const hasDatabaseUrl = Boolean(
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL
);
const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const hasSupabaseServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasDatabaseUrl && !hasSupabaseUrl) {
  console.error(
    "❌ Missing database configuration. Set SUPABASE_DATABASE_URL or DATABASE_URL (and optionally SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY for Supabase JS client access)."
  );
  process.exit(1);
}

if (hasSupabaseUrl && !hasSupabaseServiceKey) {
  console.warn(
    '⚠️ SUPABASE_SERVICE_ROLE_KEY not set. Supabase admin/write operations will be disabled; read-only access may still work if anon keys are configured.'
  );
}

if (process.env.NODE_ENV === 'production' && !hasSupabaseServiceKey) {
  console.warn(
    '⚠️ Running in production without SUPABASE_SERVICE_ROLE_KEY. Service-role protected Supabase operations will fail at runtime with controlled errors.'
  );
}

// ======================
// MIDDLEWARE
// ======================
app.use(cors());
app.use(bodyParser.json());
app.use(requestContext);

// ======================
// API ROUTES
// ======================
app.use("/api/mento", rampRoutes);
app.use("/api/ramp", rampRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/user", userRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/test", testRoutes);
app.use("/api/admin", adminRoutes);

// ======================
// HEALTH CHECK
// ======================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "DeFiGate API",
    timestamp: new Date().toISOString()
  });
});

// ======================
// GLOBAL ERROR HANDLER
// ======================
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).json({
    ok: false,
    message: err.message || "Internal server error"
  });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // Run startup validations first
    await runStartupValidation();

    await sequelize.authenticate();
    console.log("✅ Database connected");
    if (hasSupabaseUrl) {
      const { supabase } = await import('./config/supabase.js');
      // Trigger Supabase client initialization and verification during startup.
      if (supabase) {
        console.log('✅ Supabase JS client ready');
      }
    }

    const shouldAutoRunMigrations = process.env.AUTO_RUN_MIGRATIONS !== 'false' && process.env.NODE_ENV !== 'production';
    if (shouldAutoRunMigrations) {
      console.log('🛠️ AUTO_RUN_MIGRATIONS enabled by default in development. Applying database migrations');
      const { default: runMigrations } = await import('./scripts/runMigrations.js');
      const success = await runMigrations();
      if (!success) {
        throw new Error('Database migrations failed during startup');
      }
    } else {
      console.log('ℹ️ Skipping database migrations on startup. Set AUTO_RUN_MIGRATIONS=true to enable.');
    }

    if (process.env.SEQUELIZE_SYNC === 'true') {
      const syncOptions = { alter: process.env.NODE_ENV !== 'production' };
      console.log(`🛠️ Sequelize sync mode: alter=${syncOptions.alter}`);
      await sequelize.sync(syncOptions);
      console.log('✅ Models synced');
    } else {
      console.log('ℹ️ Sequelize sync skipped. Set SEQUELIZE_SYNC=true to enable model synchronization.');
    }

    await import("./services/depositDetector.js");
    startReconciliationJob({ requestId: `startup-${Date.now()}` });
    startBalanceSyncJob({ requestId: `startup-${Date.now()}` });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
})();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  try {
    await sequelize.close();
  } catch (err) {
    console.error('Error closing DB connection', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  try {
    await sequelize.close();
  } catch (err) {
    console.error('Error closing DB connection', err);
  }
  process.exit(0);
});