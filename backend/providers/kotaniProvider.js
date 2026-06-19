import axios from "axios";
import { Secrets } from "../config/secrets.js";

const KOTANI_BASE = Secrets.KOTANI_API_BASE || "https://sandbox-api.kotanipay.io/api/v3";
const KOTANI_KEY = Secrets.KOTANI_API_KEY;

function kotaniHeaders() {
  return {
    Authorization: `Bearer ${KOTANI_KEY}`,
    "Content-Type": "application/json",
  };
}

const formatProviderError = (error) => {
  if (error?.response?.data) return error.response.data;
  return error?.message || "Provider request failed";
};

const KotaniProvider = {
  name: "kotani",

  async onramp({ user, amount, currency, channel, callbackUrl }) {
    const body = {
      amount,
      currency,
      channel,
      callback_url: callbackUrl,
      customer: {
        email: user.email,
      },
      metadata: {
        product: "DeFiGate",
        userId: user.id,
        kyc_status: user.kyc_status || "pending",
      },
    };

    const response = await axios.post(`${KOTANI_BASE}/onramp`, body, {
      headers: kotaniHeaders(),
    });

    return response.data;
  },

  async offramp({ user, amount, token, phone }) {
    const body = {
      amount,
      token,
      phone,
      customer: {
        email: user.email,
      },
      metadata: {
        product: "DeFiGate",
        userId: user.id,
        kyc_status: user.kyc_status || "pending",
      },
    };

    const response = await axios.post(`${KOTANI_BASE}/offramp`, body, {
      headers: kotaniHeaders(),
    });

    return response.data;
  },

  async getRates() {
    const response = await axios.get(`${KOTANI_BASE}/rates`, {
      headers: kotaniHeaders(),
    });
    return response.data;
  },

  async getTransactionStatus(txId) {
    const response = await axios.get(`${KOTANI_BASE}/onramp/${txId}`, {
      headers: kotaniHeaders(),
    });
    return response.data;
  },

  verifyWebhook(req) {
    const signature = req.headers["x-kotani-signature"];
    const secret = Secrets.KOTANI_WEBHOOK_SECRET;
    if (!secret) return true;

    const payload = JSON.stringify(req.body);
    const expected = require("crypto")
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return signature === expected;
  },

  formatError(error) {
    return formatProviderError(error);
  },
};

export default KotaniProvider;
