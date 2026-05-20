import React, { useState } from 'react';
import { FormStep, ConfirmationModal, ProcessingScreen, SuccessScreen } from '../components';
import { apiUrl } from '../api';

const WithdrawExchangePage = ({ currentUser, navigateTo }) => {
  const [currentStep, setCurrentStep] = useState('form');
  const wallet = currentUser?.wallet;
  const [formData, setFormData] = useState({
    recipientAddress: '',
    amount: '',
    tokenAddress: '' // optional, for SPL token mint address
  });
  const [transactionData, setTransactionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transactionId, setTransactionId] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFormSubmit = () => {
    if (!formData.recipientAddress) {
      alert('Please enter recipient address');
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    setCurrentStep('confirm');
  };

  const handleConfirm = async () => {
    setLoading(true);
    setCurrentStep('processing');

    try {
      // Generate idempotency key
      const idempotencyKey = `withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const token = localStorage.getItem('authToken');
      const response = await fetch(apiUrl('/transfer/withdraw'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: formData.amount,
          toAddress: formData.recipientAddress,
          walletId: wallet.id,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Withdrawal failed');
      }

      setTransactionId(data.data.transactionId);
      setTransactionData(data.data);
      setCurrentStep('success');
    } catch (error) {
      console.error('Withdrawal error:', error);
      alert(`Withdrawal failed: ${error.message}`);
      setCurrentStep('form');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setCurrentStep('form');
    setFormData({
      recipientAddress: '',
      amount: '',
      tokenAddress: ''
    });
    setTransactionData(null);
  };

  if (!wallet) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Withdraw Crypto</h1>
          <p>Please create a wallet first</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigateTo('wallet')}>
          Create Wallet
        </button>
      </div>
    );
  }

  if (currentStep === 'form') {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Withdraw Crypto</h1>
          <p>Send crypto to external wallet or exchange</p>
        </div>

        <FormStep
          title="Enter Withdrawal Details"
          subtitle="Send SOL to any external Solana wallet or exchange address"
          onNext={handleFormSubmit}
          nextLabel="Continue"
          canProceed={formData.recipientAddress && formData.amount}
        >
          <div className="form-group">
            <label htmlFor="recipientAddress">Recipient Address</label>
            <input
              type="text"
              id="recipientAddress"
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
              type="number"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              placeholder="0.01"
              min="0.000001"
              step="0.000001"
              required
            />
          </div>

          <div className="form-group">
            <label>Network</label>
            <div className="info-value">{wallet.chain?.toUpperCase() || 'SOLANA'}</div>
          </div>

          <div className="form-group">
            <label htmlFor="tokenAddress">Token</label>
            <select
              id="tokenAddress"
              name="tokenAddress"
              value={formData.tokenAddress}
              onChange={handleInputChange}
            >
              <option value="">SOL (Native)</option>
              <option value="USDC">USDC (SPL Token)</option>
            </select>
            <small className="form-hint">Select SOL for native token or USDC for stablecoin</small>
          </div>

          <div className="withdrawal-warning">
            <div className="warning-icon">⚠️</div>
            <div className="warning-text">
              <strong>Important:</strong> Double-check the recipient address and network.
              Transactions cannot be reversed.
            </div>
          </div>
        </FormStep>
      </div>
    );
  }

  if (currentStep === 'confirm') {
    return (
      <ConfirmationModal
        isOpen={true}
        title="Confirm Withdrawal"
        message="Please review your withdrawal details carefully"
        details={[
          { label: 'Recipient', value: `${formData.recipientAddress.substring(0, 12)}...${formData.recipientAddress.substring(-8)}` },
          { label: 'Amount', value: formData.amount },
          { label: 'Network', value: wallet.chain?.toUpperCase() || 'SOLANA' },
          { label: 'Token', value: formData.tokenAddress === 'USDC' ? 'USDC' : 'SOL' }
        ]}
        onConfirm={handleConfirm}
        onCancel={() => setCurrentStep('form')}
        confirmLabel="Confirm Withdrawal"
        loading={loading}
      />
    );
  }

  if (currentStep === 'processing') {
    return (
      <ProcessingScreen
        title="Processing Withdrawal"
        message="Please wait while we process your transaction..."
        onCancel={() => setCurrentStep('form')}
      />
    );
  }

  if (currentStep === 'success') {
    return (
      <SuccessScreen
        title="Withdrawal Initiated"
        message="Your withdrawal has been broadcasted and is being processed"
        details={[
          { label: 'Amount', value: `${formData.amount} USDC` },
          { label: 'Recipient', value: `${formData.recipientAddress.substring(0, 12)}...${formData.recipientAddress.substring(-8)}` },
          { label: 'Status', value: transactionData?.status || 'Processing' },
          { label: 'Transaction ID', value: transactionId || 'N/A' }
        ]}
        transactionId={transactionData?.txHash}
        onDone={() => navigateTo('dashboard')}
        doneLabel="Back to Dashboard"
      />
    );
  }

  return null;
};

export default WithdrawExchangePage;