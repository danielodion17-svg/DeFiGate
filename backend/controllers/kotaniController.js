import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const KOTANI_BASE = process.env.KOTANI_API_BASE; // https://sandbox-api.kotanipay.io/api/v3
const KOTANI_KEY = process.env.KOTANI_API_KEY;
const KOTANI_WEBHOOK_SECRET = process.env.KOTANI_WEBHOOK_SECRET;

function kotaniHeaders() {
  return {
    Authorization: `Bearer ${KOTANI_KEY}`,
    "Content-Type": "application/json",
  };
}

// POST /ramp/onramp — create an on-ramp (fiat → crypto) via Kotani Pay
export const createOnramp = async (req, res) => {
  const { userId, amountNGN, currency = "NGN", channel = "bank_checkout" } =
    req.body;

  if (!amountNGN || amountNGN < 100) {
    return res
      .status(400)
      .json({ ok: false, error: "Minimum amount is 100 NGN" });
  }

  try {
    const body = {
      amount: amountNGN,
      currency,
      channel,
      callback_url:
        process.env.FRONTEND_URL + "/ramp-complete",
      metadata: { product: "DeFiGate", userId },
    };

    const r = await axios.post(`${KOTANI_BASE}/onramp`, body, {
      headers: kotaniHeaders(),
    });

    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error(
      "kotani onramp error",
      err?.response?.data || err.message
    );
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// POST /ramp/offramp — create an off-ramp (crypto → fiat) via Kotani Pay
export const createOfframp = async (req, res) => {
  const { userId, amount, token = "cUSD", phone } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid amount" });
  }
  if (!phone) {
    return res.status(400).json({ ok: false, error: "Phone number required" });
  }

  try {
    const body = {
      amount,
      token,
      phone,
      metadata: { product: "DeFiGate", userId },
    };

    const r = await axios.post(`${KOTANI_BASE}/offramp`, body, {
      headers: kotaniHeaders(),
    });

    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error(
      "kotani offramp error",
      err?.response?.data || err.message
    );
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// GET /ramp/rates — get exchange rates
export const getRates = async (req, res) => {
  try {
    const r = await axios.get(`${KOTANI_BASE}/rates`, {
      headers: kotaniHeaders(),
    });
    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error("kotani rates error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// GET /ramp/status/:txId — check transaction status
export const getTransactionStatus = async (req, res) => {
  const { txId } = req.params;
  try {
    const r = await axios.get(`${KOTANI_BASE}/onramp/${txId}`, {
      headers: kotaniHeaders(),
    });
    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error("kotani status error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// POST /ramp/webhook — handle Kotani Pay webhooks
export const webhookHandler = async (req, res) => {
  try {
    // Verify webhook signature if secret is configured
    if (KOTANI_WEBHOOK_SECRET) {
      const signature = req.headers["x-kotani-signature"];
      const payload = JSON.stringify(req.body);
      const expected = crypto
        .createHmac("sha256", KOTANI_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      if (signature !== expected) {
        console.warn("Webhook signature mismatch");
        return res.status(401).send("Invalid signature");
      }
    }

    const event = req.body.event || req.body.type || null;
    const data = req.body.data || req.body;
    console.log("Kotani webhook:", event, data);

    // TODO: update payment/job status in DB based on event type

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("webhook handler error", err?.message || err);
    return res.status(500).send("error");
  }
};
