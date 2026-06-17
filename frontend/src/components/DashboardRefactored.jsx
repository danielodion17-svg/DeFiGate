import React, { useState } from 'react';
import TransferModal from './TransferModal';
import { useBalance } from '../hooks/useBalance';
import { apiUrl } from '../api';

function DashboardRefactored({ currentUser, navigateTo }) {
  const [copied, setCopied] = useState(false);
  const [expandedAction, setExpandedAction] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const wallet = currentUser?.wallet;
  const { balance, loading: balanceLoading, refetch: refetchBalance } = useBalance(currentUser?.id);

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleAction = (actionId) => {
    setExpandedAction(expandedAction === actionId ? null : actionId);
  };

  const handleTransfer = async (transferData) => {
    try {
      const token = localStorage.getItem('authToken');
      let endpoint, payload;

      if (transferData.type === 'user') {
        // Internal user transfer: send only the allowed backend fields
        endpoint = apiUrl('/transfer');
        payload = {
          recipient: transferData.recipient,
          amount: String(transferData.amount),
          asset: transferData.asset || transferData.token || 'USDC',
        };
        console.log('TRANSFER PAYLOAD:', payload);
      } else {
        // External wallet transfer
        endpoint = apiUrl('/wallet/send');
        payload = {
          toAddress: transferData.recipient,
          amount: transferData.amount,
          tokenAddress: '', // Empty for native token
          chain: transferData.network,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer failed');
      }

      // Refresh balance after successful transfer
      refetchBalance();
      return true;
    } catch (error) {
      console.error('Transfer error:', error);
      throw error;
    }
  };

  const primaryActions = [
    {
      id: 'deposit',
      label: 'Deposit Funds',
      icon: '⬇️',
      color: 'primary',
      subOptions: [
        { label: 'From Bank', action: () => navigateTo('deposit-bank') },
        { label: 'From Exchange', action: () => navigateTo('deposit-exchange') },
        { label: 'From Wallet', action: () => navigateTo('deposit-exchange') }
      ]
    },
    {
      id: 'transfer',
      label: 'Transfer',
      icon: '↗️',
      color: 'success',
      subOptions: [
        { label: 'To Defigate User', action: () => setShowTransferModal(true) },
        { label: 'To External Wallet', action: () => navigateTo('send') }
      ]
    },
    {
      id: 'withdraw',
      label: 'Withdraw Funds',
      icon: '⬆️',
      color: 'accent',
      subOptions: [
        { label: 'To Bank', action: () => navigateTo('withdraw-bank') },
        { label: 'To Exchange', action: () => navigateTo('withdraw-exchange') },
        { label: 'To Wallet', action: () => navigateTo('withdraw-exchange') }
      ]
    }
  ];

  return (
    <div className="dashboard-container">
      {/* Network/Chain Label */}
      {wallet && (
        <div className="network-label">
          <span className="network-badge">{wallet.chain?.toUpperCase() || 'SOLANA'}</span>
        </div>
      )}

      {/* Balance Section */}
      <div className="balance-section">
        <div className="balance-label">Total Balance</div>
        <div className="balance-amount">
          {balanceLoading ? '...' : `$${balance.toFixed(2)}`}
        </div>
        <div className="balance-sublabel">Testnet Balance</div>
      </div>

      {/* Wallet Address Section */}
      {wallet && (
        <div className="wallet-section">
          <div className="wallet-label">Wallet Address</div>
          <div className="wallet-address-container">
            <code className="wallet-address">{wallet.address?.substring(0, 12)}...{wallet.address?.substring(-10)}</code>
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyAddress}>
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>
      )}

      {/* Primary Action Buttons */}
      <div className="primary-actions-row">
        {primaryActions.map((action) => (
          <div key={action.id} className="primary-action-container">
            <button
              className={`primary-action-btn primary-action-btn-${action.color}`}
              onClick={() => toggleAction(action.id)}
            >
              <span className="action-icon">{action.icon}</span>
              <span className="action-label">{action.label}</span>
              <span className="expand-icon">{expandedAction === action.id ? '▲' : '▼'}</span>
            </button>
            {expandedAction === action.id && (
              <div className="sub-options">
                {action.subOptions.map((option, index) => (
                  <button
                    key={index}
                    className="sub-option-btn"
                    onClick={option.action}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* User Status */}
      {currentUser && (
        <div className="user-status">
          <div className="status-item">
            <span className="status-label">Account</span>
            <span className="status-value">{currentUser?.email || 'Not logged in'}</span>
          </div>
          {wallet && (
            <div className="status-item">
              <span className="status-label">Wallet</span>
              <span className="status-value">{wallet.chain || 'Solana'}</span>
            </div>
          )}
        </div>
      )}

      {/* Transfer Modal */}
      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        currentUser={currentUser}
        balance={balance}
        onTransfer={handleTransfer}
      />
    </div>
  );
}

export default DashboardRefactored;