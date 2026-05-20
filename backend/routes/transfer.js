import express from "express";
import { authenticate } from "../middleware/auth.js";
import { requireNotFrozen } from "../middleware/requireNotFrozen.js";
import * as transfer from "../controllers/transferController.js";

const router = express.Router();

router.post("/", authenticate, requireNotFrozen, transfer.transfer);
router.post("/send", authenticate, requireNotFrozen, transfer.transfer);
router.post("/lookup", authenticate, transfer.lookupRecipient);
router.post("/initiate", authenticate, requireNotFrozen, transfer.initiateTransfer);
router.post("/confirm", authenticate, requireNotFrozen, transfer.confirmTransfer);
router.get("/history", authenticate, transfer.getTransferHistory);
router.post("/withdraw", authenticate, requireNotFrozen, transfer.withdraw);
router.get("/withdraw/:transactionId", authenticate, transfer.getWithdrawalStatusController);

export default router;
