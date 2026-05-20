import { useState, useEffect } from 'react'
import { useLocation, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { useToast } from './hooks/useToast'
import { useBackendStatus } from './hooks/useBackendStatus'
import { useTheme } from './hooks/useTheme'
import { useUserRefresh } from './hooks/useUserRefresh'
import {
  DashboardRefactored,
  Wallet,
  Ramp,
  Send,
  TopNav,
  BottomNav,
  TransferModal
} from './components'
import DepositBankPage from './pages/DepositBankPage'
import DepositExchangePage from './pages/DepositExchangePage'
import WithdrawBankPage from './pages/WithdrawBankPage'
import WithdrawExchangePage from './pages/WithdrawExchangePage'
import TransferInternalPage from './pages/TransferInternalPage'
import FinancesPage from './pages/FinancesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import SignupPage from './pages/SignupPage'
import TestPanel from './pages/TestPanel'
import AdminPortal from './pages/AdminPortal'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminWithdrawalsPage from './pages/AdminWithdrawalsPage'
import AdminAuditPage from './pages/AdminAuditPage'
import { apiUrl, buildInternalTransferPayload } from './api'

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [currentView, setCurrentView] = useState("dashboard");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const { toasts, toast } = useToast();
  const backendStatus = useBackendStatus();
  const { isDark, toggleTheme } = useTheme();
  const { refreshUser } = useUserRefresh();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Restore user session on app load
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      refreshUser(setCurrentUser);
    }
  }, [refreshUser]);

  // Navigation
  const navigateTo = (viewName) => {
    setCurrentView(viewName);
  };

  // Auth functions
  const toggleAuth = () => {
    if (currentUser) {
      setCurrentUser(null);
      toast("Signed out", "info");
    } else {
      setAuthModalOpen(true);
    }
  };

  const closeModal = () => {
    setAuthModalOpen(false);
  };

  const switchAuthMode = () => {
    setAuthMode(authMode === "signin" ? "signup" : "signin");
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const endpoint = authMode === "signin" ? "/user/signin" : "/user/signup";

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        const text = await res.text();
        console.log('Raw response:', text);
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error('Invalid JSON response:', jsonErr);
        toast("Server returned invalid response", "error");
        return;
      }

      if (!data.ok) {
        toast(data.error || "Auth failed", "error");
        return;
      }

      // Access data.data structure (not just data)
      const userData = data.data?.user;
      const token = data.data?.token;
      
      if (!userData) {
        toast("Invalid server response", "error");
        return;
      }

      setCurrentUser({ ...userData, token });
      localStorage.setItem("authToken", token);
      setAuthModalOpen(false);
      
      // Refresh user state to get latest wallet and balance data
      setTimeout(() => refreshUser(setCurrentUser), 500);
      
      toast(`Welcome${authMode === "signup" ? "! Account created" : " back"}, ${userData.email}`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // Wallet functions
  const createWallet = async (chain = "solana") => {
    if (!currentUser) {
      toast("Please sign in first", "error");
      setAuthModalOpen(true);
      return;
    }

    try {
      const res = await fetch(apiUrl('/wallet/create'), {
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
        toast("Wallet creation failed", "error");
        return;
      }

      setCurrentUser({ ...currentUser, wallet: data.data });
      toast("Wallet created!", "success");
      return data.data;
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // On-ramp function
  const createOnramp = async (amount, channel) => {
    if (!currentUser) {
      toast("Please sign in first", "error");
      setAuthModalOpen(true);
      return;
    }

    if (!amount || amount < 100) {
      toast("Minimum amount is 100 NGN", "error");
      return;
    }

    try {
      const res = await fetch(apiUrl('/ramp/onramp'), {
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
        toast("On-ramp request failed", "error");
        return;
      }

      toast("On-ramp request created!", "success");
      return data.data;
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // Off-ramp function
  const createOfframp = async (amount, token, phone) => {
    if (!currentUser) {
      toast("Please sign in first", "error");
      setAuthModalOpen(true);
      return;
    }

    if (!amount || amount <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }
    if (!phone) {
      toast("Enter a phone number", "error");
      return;
    }

    try {
      const res = await fetch(apiUrl('/ramp/offramp'), {
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
        toast("Off-ramp request failed", "error");
        return;
      }

      toast("Off-ramp request created!", "success");
      return data.data;
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // Send tokens function
  const sendTokens = async (toAddress, tokenAddress, amount) => {
    if (!currentUser) {
      toast("Please sign in first", "error");
      setAuthModalOpen(true);
      return;
    }
    if (!currentUser.wallet?.address) {
      toast("Create a wallet first", "error");
      setCurrentView("wallet");
      return;
    }

    if (!toAddress) {
      toast("Enter a recipient address", "error");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }

    try {
      const res = await fetch(apiUrl('/wallet/send'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: currentUser.wallet.provider_wallet_id || currentUser.wallet.id,
          toAddress,
          tokenAddress: tokenAddress || undefined,
          amount: parseFloat(amount),
          chain: currentUser.wallet.chain,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast("Transaction failed", "error");
        return;
      }

      toast("Transaction submitted!", "success");
      return data.tx;
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const sendInternalTransfer = async (recipientIdentifier, amount, asset = 'USDC', recipientId = null) => {
    if (!currentUser) {
      toast("Please sign in first", "error");
      setAuthModalOpen(true);
      return;
    }

    if (!recipientIdentifier && !recipientId) {
      toast("Please select a recipient", "error");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const body = buildInternalTransferPayload(recipientIdentifier, amount, asset, recipientId);

      const res = await fetch(apiUrl('/transfer'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) {
        toast(data.error || 'Transfer failed', 'error');
        return;
      }

      toast('Transfer completed successfully', 'success');
      return data.data.transfer;
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="app">
      {/* Top Navigation */}
      <TopNav 
        user={currentUser} 
        theme={isDark ? 'dark' : 'light'} 
        toggleTheme={toggleTheme} 
        onLogout={() => !currentUser ? setAuthModalOpen(true) : toggleAuth()}
        backendStatus={backendStatus}
      />

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route
            path="/admin/*"
            element={<AdminPortal user={currentUser} />}
          >
            <Route index element={<AdminDashboard user={currentUser} />} />
            <Route path="dashboard" element={<AdminDashboard user={currentUser} />} />
            <Route path="users" element={<AdminUsersPage user={currentUser} />} />
            <Route path="withdrawals" element={<AdminWithdrawalsPage user={currentUser} />} />
            <Route path="audit" element={<AdminAuditPage user={currentUser} />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Route>

          <Route
            path="/*"
            element={
              <>
                {!currentUser && currentView === 'signup' && (
                  <SignupPage
                    onAuthenticated={(user) => {
                      setCurrentUser(user);
                      if (user.token) {
                        localStorage.setItem('authToken', user.token);
                      }
                      setCurrentView('dashboard');
                      toast(`Welcome! Account created for ${user.email}`, 'success');
                    }}
                    onShowToast={toast}
                    onCancel={() => setCurrentView('dashboard')}
                  />
                )}

                {!currentUser && currentView !== 'signup' && (
                  <div className="auth-required">
                    <div className="auth-card">
                      <h1>Welcome to DeFiGate</h1>
                      <p>Your gateway to DeFi in Africa</p>
                      <button className="btn btn-primary" onClick={() => setCurrentView('signup')}>
                        Sign up
                      </button>
                      <p className="auth-cta">
                        Already have an account?{' '}
                        <button className="link-btn" onClick={() => setAuthModalOpen(true)}>
                          Sign in
                        </button>
                      </p>
                    </div>
                  </div>
                )}

                {currentUser && (
                  <>
                    {currentView === 'dashboard' && <DashboardRefactored currentUser={currentUser} navigateTo={navigateTo} />}
                    {currentView === 'wallet' && <Wallet currentUser={currentUser} createWallet={createWallet} />}
                    {currentView === 'ramp' && <Ramp currentUser={currentUser} createOnramp={createOnramp} createOfframp={createOfframp} />}
                    {currentView === 'send' && <Send currentUser={currentUser} sendTokens={sendTokens} />}
                    {currentView === 'deposit-bank' && <DepositBankPage currentUser={currentUser} createOnramp={createOnramp} navigateTo={navigateTo} />}
                    {currentView === 'deposit-exchange' && <DepositExchangePage currentUser={currentUser} navigateTo={navigateTo} />}
                    {currentView === 'withdraw-bank' && <WithdrawBankPage currentUser={currentUser} createOfframp={createOfframp} navigateTo={navigateTo} />}
                    {currentView === 'withdraw-exchange' && <WithdrawExchangePage currentUser={currentUser} sendTokens={sendTokens} navigateTo={navigateTo} />}
                    {currentView === 'transfer-internal' && <TransferInternalPage currentUser={currentUser} internalTransfer={sendInternalTransfer} onShowToast={toast} navigateTo={navigateTo} />}
                    {currentView === 'finances' && <FinancesPage currentUser={currentUser} navigateTo={navigateTo} />}
                    {currentView === 'history' && <HistoryPage currentUser={currentUser} navigateTo={navigateTo} />}
                    {currentView === 'settings' && <SettingsPage currentUser={currentUser} navigateTo={navigateTo} toggleAuth={toggleAuth} />}
                    {currentView === 'test-panel' && <TestPanel currentUser={currentUser} />}
                  </>
                )}
              </>
            }
          />
        </Routes>
      </main>

      {/* Bottom Navigation */}
      {currentUser && !isAdminRoute && <BottomNav currentView={currentView} navigateTo={navigateTo} />}

      {/* Auth Modal */}
      {authModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{authMode === "signin" ? "Sign In" : "Sign Up"}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" name="email" autoComplete="email" required />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" name="password" autoComplete="current-password" required />
              </div>
              <button type="submit" className="btn btn-primary">
                {authMode === "signin" ? "Sign In" : "Sign Up"}
              </button>
            </form>
            <div className="modal-footer">
              <span>{authMode === "signin" ? "Don't have an account?" : "Already have an account?"}</span>
              <button className="link-btn" onClick={switchAuthMode}>
                {authMode === "signin" ? "Sign Up" : "Sign In"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toastItem => (
          <div key={toastItem.id} className={`toast ${toastItem.type}`}>
            {toastItem.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App