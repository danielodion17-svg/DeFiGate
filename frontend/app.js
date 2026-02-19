// Use current origin so the frontend works in any environment
const API_BASE = window.location.origin;

async function createWallet() {
  const userId = document.getElementById("walletUserId").value;
  const email = document.getElementById("walletEmail").value;
  try {
    const res = await fetch(`${API_BASE}/wallet/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email }),
    });
    const data = await res.json();
    document.getElementById("walletResult").textContent = JSON.stringify(
      data,
      null,
      2
    );
  } catch (err) {
    document.getElementById("walletResult").textContent = err.message;
  }
}

async function sendTokens() {
  const walletId = document.getElementById("sendWalletId").value;
  const toAddress = document.getElementById("sendToAddress").value;
  const tokenAddress = document.getElementById("sendTokenAddress").value;
  const amount = parseFloat(document.getElementById("sendAmount").value);
  const chain = document.getElementById("sendChain").value;

  try {
    const res = await fetch(`${API_BASE}/wallet/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId,
        toAddress,
        tokenAddress,
        amount,
        chain,
      }),
    });
    const data = await res.json();
    document.getElementById("sendResult").textContent = JSON.stringify(
      data,
      null,
      2
    );
  } catch (err) {
    document.getElementById("sendResult").textContent = err.message;
  }
}

async function createRamp() {
  const userId = document.getElementById("rampUserId").value;
  const amountNGN = parseFloat(document.getElementById("rampAmount").value);

  try {
    const res = await fetch(`${API_BASE}/mento/create-ramp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amountNGN }),
    });
    const data = await res.json();
    document.getElementById("rampResult").textContent = JSON.stringify(
      data,
      null,
      2
    );
  } catch (err) {
    document.getElementById("rampResult").textContent = err.message;
  }
}
