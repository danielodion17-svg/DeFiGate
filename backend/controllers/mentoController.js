import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const KOTANI_BASE = process.env.KOTANI_API_BASE;
const KOTANI_KEY = process.env.KOTANI_API_KEY;
const KOTANI_WEBHOOK_SECRET = process.env.KOTANI_WEBHOOK_SECRET;

export const createRampPayment = async (req, res) => {
  const { userId, amountNGN, currency = "NGN", return_url } = req.body;
  try {
    const body = {
      amount: amountNGN,
      currency,
      callback_url: return_url || process.env.FRONTEND_URL + "/ramp-complete",
      metadata: { product: "DeFiGate", userId },
    };

    const r = await axios.post(`${KOTANI_BASE}/onramp/create`, body, {
      headers: {
        Authorization: `Bearer ${KOTANI_KEY}`,
        "Content-Type": "application/json",
      },
    });

    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error(
      "createRampPayment error",
      err?.response?.data || err.message
    );
    return res
      .status(500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

export const webhookHandler = async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event || payload.type || null;
    console.log("Kotani webhook received", event, payload);
    return res.status(200).send("ok");
  } catch (err) {
    console.error("webhook handler error", err?.message || err);
    return res.status(500).send("error");
  }
};
