import express from "express";
import { authenticate } from "../middleware/auth.js";
import { requireNotFrozen } from "../middleware/requireNotFrozen.js";
import * as wallet from "../controllers/walletController.js";

const router = express.Router();

router.post("/create", authenticate, requireNotFrozen, wallet.createEmbeddedWallet);
router.post("/send", authenticate, requireNotFrozen, wallet.sendTxToAddress);
router.get("/deposit-address", authenticate, wallet.getDepositAddress);
router.get("/balances", authenticate, wallet.getWalletBalances);
router.get("/:walletId", authenticate, wallet.getWallet);

export default router;
