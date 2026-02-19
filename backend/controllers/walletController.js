import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_BASE = "https://api.privy.io";

// Privy uses Basic Auth: base64(appId:appSecret)
function privyHeaders() {
  const encoded = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString(
    "base64"
  );
  return {
    Authorization: `Basic ${encoded}`,
    "privy-app-id": PRIVY_APP_ID,
    "Content-Type": "application/json",
  };
}

// POST /wallet/create — create a server-side wallet via Privy
export const createEmbeddedWallet = async (req, res) => {
  const { userId, email, chainType = "ethereum" } = req.body;
  try {
    const body = { chain_type: chainType };

    const r = await axios.post(`${PRIVY_BASE}/v1/wallets`, body, {
      headers: privyHeaders(),
    });

    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error(
      "privy create wallet error",
      err?.response?.data || err.message
    );
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// POST /wallet/send — sign and broadcast a transaction via Privy
export const sendTxToAddress = async (req, res) => {
  const { walletId, toAddress, tokenAddress, amount, chain } = req.body;

  if (!walletId || !toAddress || !amount) {
    return res
      .status(400)
      .json({ ok: false, error: "walletId, toAddress, and amount are required" });
  }

  try {
    // Build an EVM transaction request for Privy
    const caip2 = chainToCaip2(chain);
    const txBody = {
      chain_type: "ethereum",
      method: "eth_sendTransaction",
      caip2,
      params: {
        transaction: {
          to: toAddress,
          value: Math.floor(amount * 1e18),
        },
      },
    };

    // If a token address is provided, build an ERC-20 transfer instead
    if (tokenAddress) {
      const transferData = encodeErc20Transfer(toAddress, amount);
      txBody.params.transaction = {
        to: tokenAddress,
        data: transferData,
        value: 0,
      };
    }

    const r = await axios.post(
      `${PRIVY_BASE}/v1/wallets/${walletId}/rpc`,
      txBody,
      { headers: privyHeaders() }
    );

    return res.json({ ok: true, tx: r.data });
  } catch (err) {
    console.error("privy send tx error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// GET /wallet/:walletId — get wallet details
export const getWallet = async (req, res) => {
  const { walletId } = req.params;
  try {
    const r = await axios.get(`${PRIVY_BASE}/v1/wallets/${walletId}`, {
      headers: privyHeaders(),
    });
    return res.json({ ok: true, data: r.data });
  } catch (err) {
    console.error("privy get wallet error", err?.response?.data || err.message);
    return res
      .status(err?.response?.status || 500)
      .json({ ok: false, error: err?.response?.data || err.message });
  }
};

// Map chain name to CAIP-2 identifier
function chainToCaip2(chain) {
  const map = {
    ethereum: "eip155:1",
    celo: "eip155:42220",
    base: "eip155:8453",
    polygon: "eip155:137",
    arbitrum: "eip155:42161",
    optimism: "eip155:10",
  };
  return map[chain] || "eip155:1";
}

// Minimal ABI encoding for ERC-20 transfer(address,uint256)
function encodeErc20Transfer(to, amount) {
  const selector = "0xa9059cbb";
  const addr = to.toLowerCase().replace("0x", "").padStart(64, "0");
  const val = BigInt(Math.floor(amount * 1e18))
    .toString(16)
    .padStart(64, "0");
  return selector + addr + val;
}
