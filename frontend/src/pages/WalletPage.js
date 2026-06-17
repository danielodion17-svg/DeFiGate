import React, { useState, useEffect } from 'react';
import { apiUrl } from '../api';

const WalletPage = ({ user, onShowToast }) => {
  const [walletInfo, setWalletInfo] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWalletInfo();
    fetchTokens();
  }, []);

  const fetchWalletInfo = async () => {
    try {
      const response = await fetch(apiUrl(`/wallet/info?address=${user.walletAddress}`), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch wallet info');
      }

      const data = await response.json();
      setWalletInfo(data.wallet);
    } catch (error) {
      console.error('Wallet info fetch error:', error);
      onShowToast('Failed to fetch wallet info', 'error');
    }
  };

  const fetchTokens = async () => {
    try {
      const response = await fetch(apiUrl(`/wallet/tokens?address=${user.walletAddress}`), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tokens');
      }

      const data = await response.json();
      setTokens(data.tokens || []);
    } catch (error) {
      console.error('Tokens fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(user.walletAddress);
      onShowToast('Address copied!', 'success');
    } catch (error) {
      onShowToast('Failed to copy address', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <h2 style={{
        marginBottom: '24px',
        fontSize: '24px',
        fontWeight: 600,
      }}>
        Wallet Details
      </h2>

      <div className="wallet-section">
        <div className="wallet-label">Address</div>
        <div className="wallet-address-container">
          <div className="wallet-address">
            {user.walletAddress}
          </div>
          <button
            className="copy-btn"
            onClick={copyToClipboard}
            title="Copy address"
          >
            📋
          </button>
        </div>
      </div>

      {walletInfo && (
        <div className="user-status" style={{ marginBottom: '24px', marginTop: '24px' }}>
          <div className="status-item">
            <span className="status-label">Network</span>
            <span className="status-value">Solana</span>
          </div>
          <div className="status-item">
            <span className="status-label">Status</span>
            <span className="status-value">Active</span>
          </div>
          <div className="status-item">
            <span className="status-label">Created</span>
            <span className="status-value">
              {new Date(walletInfo.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <h3 style={{
            marginBottom: '16px',
            fontSize: '16px',
            fontWeight: 600,
          }}>
            Assets
          </h3>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {tokens.map((token, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  background: 'var(--bg)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {token.symbol}
                  </div>
                  <div style={{
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}>
                    {token.name}
                  </div>
                </div>
                <div style={{
                  textAlign: 'right',
                }}>
                  <div style={{ fontWeight: 500 }}>
                    {parseFloat(token.balance).toFixed(4)}
                  </div>
                  <div style={{
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}>
                    ${parseFloat(token.balanceUSD).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tokens.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: 'var(--text-muted)',
        }}>
          <p>No tokens found</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>
            Buy or receive crypto to see your assets here
          </p>
        </div>
      )}
    </div>
  );
};

export default WalletPage;
