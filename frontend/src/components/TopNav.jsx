import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';

const TopNav = ({ user, theme, toggleTheme, onLogout, backendStatus }) => {
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getUserInitial = () => {
    return user?.name?.charAt(0)?.toUpperCase() || 'U';
  };

  return (
    <nav className="top-nav">
      <div className="nav-left">
        <a href="#/" className="logo">
          <img src={logoImg} alt="DeFiGate Logo" style={{ height: '32px', width: 'auto' }} />
          <span className="logo-text">DeFiGate</span>
        </a>
      </div>

      <div className="nav-right">
        <div className={`backend-status ${backendStatus}`}>
          <span className="status-pulse" />
          {backendStatus === 'online' ? 'Backend Online' : 'Backend Offline'}
        </div>

        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className="profile-btn"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title="Profile menu"
          >
            👤
            <div className="profile-initial">{getUserInitial()}</div>
          </button>

          {showProfileMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              minWidth: '200px',
              marginTop: '8px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 1001,
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: '13px',
                fontWeight: 500,
              }}>
                {user?.name}
              </div>
              <div style={{
                padding: '12px 16px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                wordBreak: 'break-all',
                maxWidth: '180px',
              }}>
                {user?.walletAddress}
              </div>
              {(user?.role === 'admin' || user?.role === 'support') && (
                <button
                  onClick={() => {
                    navigate('/admin');
                    setShowProfileMenu(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    padding: '12px 16px',
                    textAlign: 'left',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'background 0.2s ease',
                  }}
                >
                  Admin Portal
                </button>
              )}
              <button
                onClick={() => {
                  onLogout();
                  setShowProfileMenu(false);
                }}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid var(--border)',
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopNav;