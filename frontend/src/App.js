import React, { useState, useEffect } from 'react';
import './App.css';
import TopNav from './components/TopNav';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import { apiUrl } from './api';
import TransferPage from './pages/TransferPage';
import RampPage from './pages/RampPage';
import WalletPage from './pages/WalletPage';

import AuthModal from './components/AuthModal';
import Toast from './components/Toast';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('light');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [backendStatus, setBackendStatus] = useState('offline');

  // Initialize app
  useEffect(() => {
    const initApp = async () => {
      try {
        const theme = localStorage.getItem('theme') || 'light';
        setTheme(theme);
        document.documentElement.setAttribute('data-theme', theme);

        // Check if user is authenticated
        const token = localStorage.getItem('authToken');
        const userId = localStorage.getItem('userId');

        if (token && userId) {
          await verifyAuth();
        } else {
          setShowAuthModal(true);
        }

        // Check backend status
        checkBackendStatus();
      } catch (error) {
        console.error('App initialization error:', error);
        setShowAuthModal(true);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const verifyAuth = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const userId = localStorage.getItem('userId');
      const userName = localStorage.getItem('userName');
      const walletAddress = localStorage.getItem('walletAddress');

      if (token && userId) {
        setUser({
          id: userId,
          name: userName,
          walletAddress: walletAddress,
        });
        setShowAuthModal(false);
      } else {
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      setShowAuthModal(true);
    }
  };

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(apiUrl('/health'), {
        method: 'GET',
        timeout: 5000,
      });
      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleAuthenticated = (userData) => {
    setUser(userData);
    setShowAuthModal(false);
    localStorage.setItem('authToken', userData.token);
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('userName', userData.name);
    localStorage.setItem('walletAddress', userData.walletAddress);
    showToast('Successfully authenticated!', 'success');
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('walletAddress');
    setUser(null);
    setShowAuthModal(true);
    setCurrentPage('dashboard');
    showToast('Logged out successfully', 'info');
  };

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const renderPage = () => {
    if (!user) {
      return (
        <div className="auth-required">
          <div className="auth-card">
            <h1>Welcome to DeFiGate</h1>
            <p>Sign in to continue</p>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard user={user} onShowToast={showToast} />;
      case 'transfer':
        return <TransferPage user={user} onShowToast={showToast} />;
      case 'ramp':
        return <RampPage user={user} onShowToast={showToast} />;
      case 'wallet':
        return <WalletPage user={user} onShowToast={showToast} />;
      default:
        return <Dashboard user={user} onShowToast={showToast} />;
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--text)',
        }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {user && (
        <TopNav
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={handleLogout}
          backendStatus={backendStatus}
        />
      )}

      <main className="main-content">
        {renderPage()}
      </main>

      {user && (
        <BottomNav
          currentView={currentPage}
          navigateTo={setCurrentPage}
          user={user}
        />
      )}

      {showAuthModal && (
        <AuthModal
          onAuthenticated={handleAuthenticated}
          onShowToast={showToast}
        />
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
