import React, { useState } from 'react';

function Dashboard({ currentUser, navigateTo }) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const wallet = currentUser?.wallet;

  return (
    <div className="view active" id="view-dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Your DeFi gateway to African markets</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Wallet Status</div>
          <div className="stat-value" style={{ color: wallet ? 'var(--success)' : 'inherit' }}>
            {wallet ? "Active" : "No Wallet"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wallet Address</div>
          <div className="stat-value stat-mono">{wallet ? wallet.address : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Chain</div>
          <div className="stat-value">{wallet ? wallet.chain : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Account</div>
          <div className="stat-value">{currentUser ? currentUser.email : "Not signed in"}</div>
        </div>
      </div>

      {/* Balance Section */}
      <div className="balance-section">
        <h2>Balance</h2>
        <div className="balance-amount">
          {currentUser?.available_balance ? `$${currentUser.available_balance} USD` : 'No Wallet'}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons-row">
        <button className="primary-action-btn" onClick={() => setShowDepositModal(true)}>
          Deposit
        </button>
        <button className="primary-action-btn" onClick={() => setShowTransferModal(true)}>
          Transfer
        </button>
        <button className="primary-action-btn" onClick={() => setShowWithdrawModal(true)}>
          Withdraw
        </button>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="modal-overlay" onClick={() => setShowDepositModal(false)}>
          <div className="modal bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Deposit</h3>
            <ul className="modal-options">
              <li><button onClick={() => { navigateTo('ramp'); setShowDepositModal(false); }}>From Bank (on-ramp)</button></li>
              <li><button onClick={() => { navigateTo('ramp'); setShowDepositModal(false); }}>From Exchange</button></li>
              <li><button onClick={() => { navigateTo('deposit-exchange'); setShowDepositModal(false); }}>From Wallet</button></li>
            </ul>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Transfer</h3>
            <ul className="modal-options">
              <li><button onClick={() => { navigateTo('send'); setShowTransferModal(false); }}>To Defigate User</button></li>
            </ul>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="modal bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Withdraw</h3>
            <ul className="modal-options">
              <li><button onClick={() => { navigateTo('ramp'); setShowWithdrawModal(false); }}>To Bank (off-ramp)</button></li>
              <li><button onClick={() => { navigateTo('ramp'); setShowWithdrawModal(false); }}>To Exchange</button></li>
              <li><button onClick={() => { navigateTo('withdraw-exchange'); setShowWithdrawModal(false); }}>To Wallet</button></li>
            </ul>
          </div>
        </div>
      )}

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <button className="action-card" onClick={() => navigateTo('wallet')}>
            <span className="action-icon">&#128179;</span>
            <span className="action-label">Create Wallet</span>
          </button>
          <button className="action-card" onClick={() => navigateTo('ramp')}>
            <span className="action-icon">&#128176;</span>
            <span className="action-label">Buy Crypto</span>
          </button>
          <button className="action-card" onClick={() => navigateTo('send')}>
            <span className="action-icon">&#128640;</span>
            <span className="action-label">Send Tokens</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;