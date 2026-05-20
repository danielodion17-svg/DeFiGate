import React, { useState, useEffect } from 'react';
import { QRCode } from '../components';
import { apiUrl } from '../api';

const DepositExchangePage = ({ currentUser, navigateTo }) => {
  const [copied, setCopied] = useState('');
  const [depositInfo, setDepositInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const wallet = currentUser?.wallet;

  const copyAddress = (addressLabel) => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(addressLabel);
      setTimeout(() => setCopied(''), 2000);
    }
  };

  useEffect(() => {
    const fetchDepositInfo = async () => {
      if (!currentUser?.token) return;
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/wallet/deposit-address'), {
          headers: {
            Authorization: `Bearer ${currentUser.token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = await res.json();
        if (data.ok) {
          setDepositInfo(data.data);
        }
      } catch (error) {
        console.error('Failed to load deposit info', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDepositInfo();
  }, [currentUser]);

  const refreshDepositInfo = async () => {
    if (!currentUser?.token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/wallet/balances'), {
        headers: {
          Authorization: `Bearer ${currentUser.token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.ok) {
        setDepositInfo(data.data);
      }
    } catch (error) {
      console.error('Failed to refresh deposit info', error);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Deposit Crypto</h1>
          <p>Please create a wallet first</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigateTo('wallet')}>
          Create Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Deposit Crypto</h1>
        <p>Send crypto to your wallet address</p>
      </div>

      <div className="deposit-address-section">
        <div className="network-info">
          <span className="network-badge">{wallet.chain?.toUpperCase() || 'SOLANA'}</span>
        </div>

        <div className="qr-section">
          <QRCode value={wallet.address} size={200} />
        </div>

        <div className="address-section">
          <label>Primary Wallet Address</label>
          <div className="address-container">
            <code className="wallet-address">{wallet.address}</code>
            <button
              className={`copy-btn ${copied === 'address' ? 'copied' : ''}`}
              onClick={() => copyAddress('address')}
            >
              {copied === 'address' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="deposit-token-card">
          <h3>SOL Deposit Address</h3>
          <div className="address-container">
            <code>{wallet.address}</code>
            <button
              className={`copy-btn ${copied === 'sol' ? 'copied' : ''}`}
              onClick={() => copyAddress('sol')}
            >
              {copied === 'sol' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="deposit-token-card">
          <h3>USDC (Solana SPL) Deposit Address</h3>
          <div className="address-container">
            <code>{wallet.address}</code>
            <button
              className={`copy-btn ${copied === 'usdc' ? 'copied' : ''}`}
              onClick={() => copyAddress('usdc')}
            >
              {copied === 'usdc' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="deposit-balances">
          <h3>Wallet Balances</h3>
          {loading ? (
            <p>Loading balances…</p>
          ) : depositInfo ? (
            <div>
              <ul>
                <li>Ledger SOL: {depositInfo.balances?.SOL ?? '0.00'}</li>
                <li>Onchain SOL: {depositInfo.balances?.onchain_SOL ?? '0.00'}</li>
                <li>USDC: {depositInfo.balances?.USDC ?? '0.00'}</li>
              </ul>
              <div className="sync-status">
                <strong>Sync status:</strong>
                <div>SOL: {depositInfo.sync_status?.sol || 'unknown'}</div>
                <div>USDC: {depositInfo.sync_status?.usdc || 'unknown'}</div>
              </div>
            </div>
          ) : (
            <p>Unable to load wallet balances.</p>
          )}
          {depositInfo?.last_synced_at && (
            <p className="sync-info">Last synced: {new Date(depositInfo.last_synced_at).toLocaleString()}</p>
          )}
          <button className="btn btn-secondary" onClick={refreshDepositInfo} disabled={loading}>
            {loading ? 'Syncing…' : 'Refresh balances'}
          </button>
        </div>

        <div className="deposit-instructions warning-box">
          <h3>Important</h3>
          <ul>
            <li>Only send Solana assets to this Solana address.</li>
            <li>Do not send non-Solana or cross-chain assets.</li>
            <li>Use SOL or USDC SPL only to avoid permanent loss.</li>
            <li>Deposits are usually confirmed within a few minutes.</li>
          </ul>
        </div>

        <button className="btn btn-secondary" onClick={() => navigateTo('dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default DepositExchangePage;