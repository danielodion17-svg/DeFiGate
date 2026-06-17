import React, { useState } from 'react';
import { apiUrl } from '../api';

const TransferPage = ({ user, onShowToast }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    recipientAddress: '',
    amount: '',
    network: 'solana',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      onShowToast('Please sign in first', 'error');
      return;
    }
    
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/transfer/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          senderAddress: user.walletAddress,
          recipientAddress: formData.recipientAddress,
          amount: formData.amount,
          network: formData.network,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        onShowToast(errorData.message || 'Transfer failed', 'error');
        setLoading(false);
        return;
      }

      const data = await response.json();
      onShowToast('Transfer initiated successfully!', 'success');
      setFormData({
        recipientAddress: '',
        amount: '',
        network: 'solana',
      });
    } catch (error) {
      console.error('Transfer error:', error);
      onShowToast('Network error. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h2 style={{
          marginBottom: '24px',
          fontSize: '24px',
          fontWeight: 600,
        }}>
          Send Funds
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="network">Network</label>
            <input
              id="network"
              type="text"
              value="Solana"
              disabled
            />
          </div>

          <div className="form-group">
            <label htmlFor="recipientAddress">Recipient Address</label>
            <input
              id="recipientAddress"
              type="text"
              name="recipientAddress"
              value={formData.recipientAddress}
              onChange={handleInputChange}
              placeholder="Enter Solana wallet address"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              placeholder="0.00"
              step="0.0001"
              autoComplete="off"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TransferPage;
