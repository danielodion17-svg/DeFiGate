import React, { useState, useEffect } from 'react';

const FinancesPage = ({ currentUser, navigateTo }) => {
  const [assets, setAssets] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data - in real app, this would fetch from API
    const mockAssets = [
      {
        symbol: 'SOL',
        name: 'Solana',
        balance: 12.345,
        value: 460.00,
        change24h: 1.8,
        icon: '◎'
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        balance: 325,
        value: 325.00,
        change24h: 0.0,
        icon: '🪙'
      }
    ];

    const total = mockAssets.reduce((sum, asset) => sum + asset.value, 0);

    setTimeout(() => {
      setAssets(mockAssets);
      setTotalBalance(total);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Finances</h1>
          <p>Loading your assets...</p>
        </div>
        <div className="loading-spinner">⟳</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Finances</h1>
        <p>Your asset portfolio and balances</p>
      </div>

      {/* Total Balance */}
      <div className="balance-overview">
        <div className="total-balance">
          <div className="balance-label">Total Portfolio Value</div>
          <div className="balance-amount">${totalBalance.toFixed(2)}</div>
          <div className="balance-change positive">+5.2% (24h)</div>
        </div>
      </div>

      {/* Asset List */}
      <div className="assets-section">
        <h2>Your Assets</h2>
        <div className="assets-list">
          {assets.map(asset => (
            <div key={asset.symbol} className="asset-item">
              <div className="asset-info">
                <div className="asset-icon">{asset.icon}</div>
                <div className="asset-details">
                  <div className="asset-name">{asset.name}</div>
                  <div className="asset-symbol">{asset.symbol}</div>
                </div>
              </div>

              <div className="asset-balance">
                <div className="balance-amount">{asset.balance} {asset.symbol}</div>
                <div className="balance-value">${asset.value.toFixed(2)}</div>
              </div>

              <div className="asset-change">
                <span className={`change-percent ${asset.change24h >= 0 ? 'positive' : 'negative'}`}>
                  {asset.change24h >= 0 ? '+' : ''}{asset.change24h}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <button
            className="action-btn"
            onClick={() => navigateTo('deposit-bank')}
          >
            <span className="action-icon">⬇️</span>
            <span>Deposit</span>
          </button>

          <button
            className="action-btn"
            onClick={() => navigateTo('withdraw-exchange')}
          >
            <span className="action-icon">⬆️</span>
            <span>Withdraw</span>
          </button>

          <button
            className="action-btn"
            onClick={() => navigateTo('transfer-internal')}
          >
            <span className="action-icon">↗️</span>
            <span>Transfer</span>
          </button>
        </div>
      </div>

      {/* Portfolio Chart Placeholder */}
      <div className="portfolio-chart">
        <h2>Portfolio Performance</h2>
        <div className="chart-placeholder">
          <div className="chart-icon">📊</div>
          <p>Portfolio chart coming soon</p>
        </div>
      </div>
    </div>
  );
};

export default FinancesPage;