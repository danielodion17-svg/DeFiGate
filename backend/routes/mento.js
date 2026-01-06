import express from "express";
import * as mento from "../controllers/mentoController.js";

const router = express.Router();

router.post("/create-ramp", mento.createRampPayment);
router.post("/webhook", mento.webhookHandler);

export default router;
