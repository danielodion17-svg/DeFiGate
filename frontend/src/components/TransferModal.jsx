import React, { useState } from 'react';

function TransferModal({ isOpen, onClose, currentUser, balance, onTransfer }) {
  const [step, setStep] = useState('select-type'); // 'select-type', 'enter-details', 'confirm', 'processing'
  const [transferType, setTransferType] = useState(''); // 'user', 'wallet'
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    token: 'USDC',
    network: 'solana'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetModal = () => {
    setStep('select-type');
    setTransferType('');
    setFormData({
      recipient: '',
      amount: '',
      token: 'USDC',
      network: 'solana'
    });
    setError('');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleTypeSelect = (type) => {
    setTransferType(type);
    setStep('enter-details');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const validateForm = () => {
    if (!formData.recipient.trim()) {
      setError('Recipient is required');
      return false;
    }

    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    if (amount > balance) {
      setError('Insufficient balance');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setStep('confirm');
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');

    try {
      const success = await onTransfer({
        ...formData,
        type: transferType
      });

      if (success) {
        setStep('success');
      } else {
        setError('Transfer failed. Please try again.');
        setStep('enter-details');
      }
    } catch (err) {
      setError(err.message || 'Transfer failed');
      setStep('enter-details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal transfer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Transfer Funds</h3>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          {step === 'select-type' && (
            <div className="transfer-type-selection">
              <div className="balance-display">
                <span className="balance-label">Available Balance:</span>
                <span className="balance-amount">${balance.toFixed(2)}</span>
              </div>

              <div className="transfer-options">
                <button
                  className="transfer-option"
                  onClick={() => handleTypeSelect('user')}
                >
                  <div className="option-icon">👤</div>
                  <div className="option-content">
                    <h4>To DeFiGate User</h4>
                    <p>Send to another user on the platform</p>
                  </div>
                </button>

                <button
                  className="transfer-option"
                  onClick={() => handleTypeSelect('wallet')}
                >
                  <div className="option-icon">📤</div>
                  <div className="option-content">
                    <h4>To External Wallet</h4>
                    <p>Send to any wallet address</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'enter-details' && (
            <form onSubmit={handleSubmit} className="transfer-form">
              <div className="form-group">
                <label>
                  {transferType === 'user' ? 'Recipient (phone, email, or user ID)' : 'Recipient Address'}
                </label>
                <input
                  type="text"
                  name="recipient"
                  value={formData.recipient}
                  onChange={handleInputChange}
                  placeholder={transferType === 'user' ? 'phone, email, or user ID' : 'Enter Solana wallet address'}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount (USD)</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    max={balance}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Token</label>
                  <select name="token" value={formData.token} onChange={handleInputChange}>
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
              </div>

              {transferType === 'wallet' && (
                <div className="form-group">
                  <label>Network</label>
                  <div className="info-value">Solana</div>
                </div>
              )}

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setStep('select-type')}>
                  Back
                </button>
                <button type="submit" className="btn-primary">
                  Continue
                </button>
              </div>
            </form>
          )}

          {step === 'confirm' && (
            <div className="transfer-confirm">
              <div className="confirm-details">
                <div className="detail-row">
                  <span>To:</span>
                  <span>{formData.recipient}</span>
                </div>
                <div className="detail-row">
                  <span>Amount:</span>
                  <span>${parseFloat(formData.amount).toFixed(2)} {formData.token}</span>
                </div>
                {transferType === 'wallet' && (
                  <div className="detail-row">
                    <span>Network:</span>
                    <span>Solana</span>
                  </div>
                )}
                <div className="detail-row total">
                  <span>Total:</span>
                  <span>${parseFloat(formData.amount).toFixed(2)}</span>
                </div>
              </div>

              <div className="confirm-warning">
                ⚠️ This action cannot be undone. Please verify the details.
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep('enter-details')}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="processing-screen">
              <div className="spinner"></div>
              <h4>Processing Transfer</h4>
              <p>Please wait while we process your transaction...</p>
            </div>
          )}

          {step === 'success' && (
            <div className="success-screen">
              <div className="success-icon">✅</div>
              <h4>Transfer Successful!</h4>
              <p>Your transfer has been completed successfully.</p>
              <button className="btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TransferModal;