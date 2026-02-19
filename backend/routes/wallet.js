import express from "express";
import * as wallet from "../controllers/walletController.js";

const router = express.Router();

router.post("/create", wallet.createEmbeddedWallet);
router.post("/send", wallet.sendTxToAddress);
router.get("/:walletId", wallet.getWallet);

export default router;
