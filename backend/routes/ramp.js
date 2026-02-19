import express from "express";
import * as kotani from "../controllers/kotaniController.js";

const router = express.Router();

router.post("/onramp", kotani.createOnramp);
router.post("/offramp", kotani.createOfframp);
router.get("/rates", kotani.getRates);
router.get("/status/:txId", kotani.getTransactionStatus);
router.post("/webhook", kotani.webhookHandler);

// Keep legacy route for backward compatibility
router.post("/create-ramp", kotani.createOnramp);

export default router;
