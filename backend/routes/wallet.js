// backend/routes/wallet.js
import express from "express";
import * as wallet from "../controllers/walletController.js";

const router = express.Router();

router.post("/create", wallet.createEmbeddedWallet);
router.post("/send", wallet.sendTxToAddress); // send stablecoin or token to external address

export default router;
