import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const PRIVY_BASE = process.env.PRIVY_API_BASE;
const PRIVY_KEY = process.env.PRIVY_API_KEY;

export const createEmbeddedWallet = async (req, res) => {
  const { userId, email } = req.body;
  try {
    const body = { owner: { type: "user", id: userId, email } };
    const r = await axios.post(`${PRIVY_BASE}/v1/wallets`, body, {
      headers: { Authorization: `Bearer ${PRIVY_KEY}` },
    });
    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error(
      "privy create wallet error",
      err?.response?.data || err.message
    );
    return res
      .status(500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

export const sendTxToAddress = async (req, res) => {
  const { walletId, toAddress, tokenAddress, amount, chain } = req.body;
  try {
    const txBody = {
      walletId,
      network: chain,
      to: toAddress,
      token: tokenAddress,
      amount,
    };
    const r = await axios.post(
      `${PRIVY_BASE}/v1/wallets/${walletId}/transactions`,
      txBody,
      {
        headers: { Authorization: `Bearer ${PRIVY_KEY}` },
      }
    );
    return res.json({ ok: true, tx: r.data });
  } catch (err) {
    console.error("privy send tx error", err?.response?.data || err.message);
    return res
      .status(500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};
