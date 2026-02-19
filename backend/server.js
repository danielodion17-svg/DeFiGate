import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// API Routes
import rampRoutes from "./routes/ramp.js";
import walletRoutes from "./routes/wallet.js";
import userRoutes from "./routes/user.js";

// Mount under /mento for backward compat and /ramp for new routes
app.use("/mento", rampRoutes);
app.use("/ramp", rampRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "DeFiGate", timestamp: new Date().toISOString() });
});

// Fallback: serve frontend for any unmatched route (SPA support)
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`DeFiGate server running on port ${PORT}`);
});
