import React, { useState, useEffect } from 'react';
import { apiUrl } from '../api.js';

const HistoryPage = ({ currentUser, navigateTo }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(apiUrl('/user/transactions'), {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        });

        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Unable to load transactions');
        }

        setTransactions(data.data.transactions || []);
      } catch (err) {
        setError(err.message || 'Unable to load transaction history');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'all') return true;
    if (filter === 'withdraw') return tx.type === 'withdrawal';
    return tx.type === filter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'confirmed':
        return 'success';
      case 'pending':
      case 'pending_review':
      case 'approved':
      case 'broadcasting':
        return 'warning';
      case 'failed':
      case 'rejected':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'deposit':
        return '⬇️';
      case 'withdrawal':
        return '⬆️';
      case 'transfer':
        return '↗️';
      default:
        return '📄';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount, asset) => {
    if (!amount) return '0';
    const num = parseFloat(amount);
    if (asset === 'SOL') {
      // SOL has 9 decimals, show up to 6 decimal places
      return num.toFixed(6).replace(/\.?0+$/, '');
    }
    // USDC has 6 decimals, show up to 2 decimal places
    return num.toFixed(2).replace(/\.?0+$/, '');
  };

  const formatDescription = (tx) => {
    if (tx.type === 'deposit') return tx.reference || 'Deposit';
    if (tx.type === 'withdrawal') return tx.recipient_address || tx.reference || 'Withdrawal';
    if (tx.type === 'transfer') return tx.direction === 'incoming' ? 'Incoming transfer' : 'Outgoing transfer';
    return tx.reference || 'Transaction';
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Transaction History</h1>
          <p>Loading your transactions...</p>
        </div>
        <div className="loading-spinner">⟳</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Transaction History</h1>
        <p>Your complete transaction history</p>
      </div>

      <div className="history-filters">
        <div className="filter-tabs">
          <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          <button className={`filter-tab ${filter === 'deposit' ? 'active' : ''}`} onClick={() => setFilter('deposit')}>
            Deposits
          </button>
          <button className={`filter-tab ${filter === 'withdraw' ? 'active' : ''}`} onClick={() => setFilter('withdraw')}>
            Withdrawals
          </button>
          <button className={`filter-tab ${filter === 'transfer' ? 'active' : ''}`} onClick={() => setFilter('transfer')}>
            Transfers
          </button>
        </div>
      </div>

      {error && (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Error loading transactions</h3>
          <p>{error}</p>
        </div>
      )}

      <div className="transactions-list">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <h3>No transactions found</h3>
            <p>You haven't made any transactions yet.</p>
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="transaction-item">
              <div className="transaction-icon">{getTypeIcon(transaction.type)}</div>
              <div className="transaction-info">
                <div className="transaction-description">{formatDescription(transaction)}</div>
                <div className="transaction-meta">
                  <span className="transaction-date">{formatDate(transaction.created_at || transaction.broadcasted_at)}</span>
                  <span className={`transaction-status status-${getStatusColor(transaction.status)}`}>{transaction.status}</span>
                </div>
              </div>
              <div className="transaction-amount">
                <div className="amount-primary">{formatAmount(transaction.amount, transaction.asset)}</div>
                {transaction.asset && <div className="amount-secondary">{transaction.asset}</div>}
              </div>
            </div>
          ))
        )}
      </div>

      {filteredTransactions.length > 0 && (
        <div className="load-more">
          <button className="btn btn-secondary">Load More Transactions</button>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
