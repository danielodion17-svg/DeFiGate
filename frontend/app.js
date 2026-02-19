// ===== CONFIG =====
const API = window.location.origin;

// ===== STATE =====
let currentUser = null; // { id, email }
let currentWallet = null; // { id, address, chain_type }
let authMode = "signin"; // "signin" | "signup"

// ===== NAVIGATION =====
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(link.dataset.view);
  });
});

function navigateTo(viewName) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));

  const view = document.getElementById(`view-${viewName}`);
  const link = document.querySelector(`.nav-link[data-view="${viewName}"]`);
  if (view) view.classList.add("active");
  if (link) link.classList.add("active");
}

// ===== TABS =====
function switchTab(btn) {
  const tabName = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  const content = document.getElementById(`tab-${tabName}`);
  if (content) content.classList.add("active");
}

// ===== AUTH =====
function toggleAuth() {
  if (currentUser) {
    // Sign out
    currentUser = null;
    currentWallet = null;
    updateUI();
    toast("Signed out", "info");
    return;
  }
  document.getElementById("authModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("authModal").classList.add("hidden");
}

function switchAuthMode(e) {
  e.preventDefault();
  authMode = authMode === "signin" ? "signup" : "signin";
  document.getElementById("authTitle").textContent =
    authMode === "signin" ? "Sign In" : "Sign Up";
  document.getElementById("authSubmitBtn").textContent =
    authMode === "signin" ? "Sign In" : "Sign Up";
  document.getElementById("authToggleText").textContent =
    authMode === "signin" ? "Don't have an account?" : "Already have an account?";
  document.getElementById("authToggleLink").textContent =
    authMode === "signin" ? "Sign Up" : "Sign In";
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;
  const btn = document.getElementById("authSubmitBtn");

  const endpoint = authMode === "signin" ? "/user/signin" : "/user/signup";

  btn.disabled = true;
  btn.textContent = "Loading...";

  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!data.ok) {
      toast(data.error || "Auth failed", "error");
      return;
    }

    currentUser = data.user;
    closeModal();
    updateUI();
    toast(`Welcome${authMode === "signup" ? "! Account created" : " back"}, ${currentUser.email}`, "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === "signin" ? "Sign In" : "Sign Up";
  }
}

// ===== WALLET (Privy) =====
async function createWallet() {
  if (!currentUser) {
    toast("Please sign in first", "error");
    toggleAuth();
    return;
  }

  const chain = document.getElementById("walletChain").value;
  const btn = document.getElementById("createWalletBtn");
  const resultBox = document.getElementById("walletResult");

  btn.disabled = true;
  btn.textContent = "Creating...";
  showResult(resultBox, null);

  try {
    const res = await fetch(`${API}/wallet/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        email: currentUser.email,
        chainType: chain,
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      showResult(resultBox, data.error || "Wallet creation failed", true);
      toast("Wallet creation failed", "error");
      return;
    }

    currentWallet = data.data;
    showResult(resultBox, JSON.stringify(data.data, null, 2));
    updateWalletInfo();
    updateUI();
    toast("Wallet created!", "success");
  } catch (err) {
    showResult(resultBox, err.message, true);
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Wallet";
  }
}

function updateWalletInfo() {
  if (!currentWallet) return;
  const card = document.getElementById("walletInfoCard");
  card.classList.remove("hidden");
  document.getElementById("infoWalletId").textContent = currentWallet.id || "—";
  document.getElementById("infoWalletAddr").textContent = currentWallet.address || "—";
  document.getElementById("infoWalletChain").textContent = currentWallet.chain_type || "—";
}

// ===== ON-RAMP (Kotani Pay) =====
async function createOnramp() {
  if (!currentUser) {
    toast("Please sign in first", "error");
    toggleAuth();
    return;
  }

  const amount = parseFloat(document.getElementById("onrampAmount").value);
  const channel = document.getElementById("onrampChannel").value;
  const btn = document.getElementById("onrampBtn");
  const resultBox = document.getElementById("onrampResult");

  if (!amount || amount < 100) {
    toast("Minimum amount is 100 NGN", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Processing...";
  showResult(resultBox, null);

  try {
    const res = await fetch(`${API}/mento/create-ramp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        amountNGN: amount,
        currency: "NGN",
        channel,
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      showResult(resultBox, data.error ? JSON.stringify(data.error, null, 2) : "On-ramp failed", true);
      toast("On-ramp request failed", "error");
      return;
    }

    showResult(resultBox, JSON.stringify(data.data, null, 2));
    toast("On-ramp request created!", "success");
  } catch (err) {
    showResult(resultBox, err.message, true);
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Deposit";
  }
}

// ===== OFF-RAMP (Kotani Pay) =====
async function createOfframp() {
  if (!currentUser) {
    toast("Please sign in first", "error");
    toggleAuth();
    return;
  }

  const amount = parseFloat(document.getElementById("offrampAmount").value);
  const token = document.getElementById("offrampToken").value;
  const phone = document.getElementById("offrampPhone").value;
  const btn = document.getElementById("offrampBtn");
  const resultBox = document.getElementById("offrampResult");

  if (!amount || amount <= 0) {
    toast("Enter a valid amount", "error");
    return;
  }
  if (!phone) {
    toast("Enter a phone number", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Processing...";
  showResult(resultBox, null);

  try {
    const res = await fetch(`${API}/mento/offramp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        amount,
        token,
        phone,
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      showResult(resultBox, data.error ? JSON.stringify(data.error, null, 2) : "Off-ramp failed", true);
      toast("Off-ramp request failed", "error");
      return;
    }

    showResult(resultBox, JSON.stringify(data.data, null, 2));
    toast("Off-ramp request created!", "success");
  } catch (err) {
    showResult(resultBox, err.message, true);
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Withdraw";
  }
}

// ===== SEND TOKENS (Privy) =====
async function sendTokens() {
  if (!currentUser) {
    toast("Please sign in first", "error");
    toggleAuth();
    return;
  }
  if (!currentWallet) {
    toast("Create a wallet first", "error");
    navigateTo("wallet");
    return;
  }

  const toAddress = document.getElementById("sendToAddress").value;
  const tokenAddress = document.getElementById("sendTokenAddress").value;
  const amount = document.getElementById("sendAmount").value;
  const chain = document.getElementById("sendChain").value;
  const btn = document.getElementById("sendBtn");
  const resultBox = document.getElementById("sendResult");

  if (!toAddress) {
    toast("Enter a recipient address", "error");
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    toast("Enter a valid amount", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending...";
  showResult(resultBox, null);

  try {
    const res = await fetch(`${API}/wallet/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId: currentWallet.id,
        toAddress,
        tokenAddress: tokenAddress || undefined,
        amount: parseFloat(amount),
        chain,
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      showResult(resultBox, data.error ? JSON.stringify(data.error, null, 2) : "Send failed", true);
      toast("Transaction failed", "error");
      return;
    }

    showResult(resultBox, JSON.stringify(data.tx, null, 2));
    toast("Transaction submitted!", "success");
  } catch (err) {
    showResult(resultBox, err.message, true);
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send";
  }
}

// ===== UI HELPERS =====
function updateUI() {
  const badge = document.getElementById("userBadge");
  const authBtn = document.getElementById("authBtn");
  const dashAccount = document.getElementById("dashAccount");
  const dashWalletStatus = document.getElementById("dashWalletStatus");
  const dashWalletAddr = document.getElementById("dashWalletAddr");
  const dashChain = document.getElementById("dashChain");

  if (currentUser) {
    badge.textContent = currentUser.email;
    badge.classList.remove("hidden");
    authBtn.textContent = "Sign Out";
    authBtn.classList.remove("btn-primary");
    authBtn.classList.add("btn-danger");
    dashAccount.textContent = currentUser.email;
  } else {
    badge.classList.add("hidden");
    authBtn.textContent = "Sign In";
    authBtn.classList.remove("btn-danger");
    authBtn.classList.add("btn-primary");
    dashAccount.textContent = "Not signed in";
    dashWalletStatus.textContent = "No Wallet";
    dashWalletAddr.innerHTML = "&mdash;";
    dashChain.innerHTML = "&mdash;";
    document.getElementById("walletInfoCard").classList.add("hidden");
    return;
  }

  if (currentWallet) {
    dashWalletStatus.textContent = "Active";
    dashWalletStatus.style.color = "var(--success)";
    dashWalletAddr.textContent = currentWallet.address || "—";
    dashChain.textContent = currentWallet.chain_type || "—";
  } else {
    dashWalletStatus.textContent = "No Wallet";
    dashWalletStatus.style.color = "";
    dashWalletAddr.innerHTML = "&mdash;";
    dashChain.innerHTML = "&mdash;";
  }
}

function showResult(el, text, isError) {
  if (!text) {
    el.classList.add("hidden");
    el.classList.remove("error", "success");
    return;
  }
  el.classList.remove("hidden", "error", "success");
  el.classList.add(isError ? "error" : "success");
  el.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
}

function toast(message, type) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast ${type || "info"}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s";
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Init
updateUI();
