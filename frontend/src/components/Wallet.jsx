import React, { useState } from 'react';

function Wallet({ currentUser, createWallet }) {
  const [result, setResult] = useState(null);
  const [isError, setIsError] = useState(false);
  const wallet = currentUser?.wallet;

  const handleCreateWallet = async () => {
    const data = await createWallet('solana');
    if (data) {
      setResult(JSON.stringify(data, null, 2));
      setIsError(false);
    }
  };

  return (
    <div className="view active" id="view-wallet">
      <div className="page-header">
        <h1>Wallet</h1>
        <p className="subtitle">Create and manage your embedded Solana wallet via Privy</p>
      </div>
      <div className="card">
        <h3>Create Embedded Solana Wallet</h3>
        <p className="card-desc">Creates a new Solana wallet linked to your account using Privy's server-side wallet infrastructure.</p>
        <button className="btn btn-primary" onClick={handleCreateWallet} disabled={!currentUser}>
          Create Wallet
        </button>
        {result && (
          <pre className={`result ${isError ? 'error' : 'success'}`}>{result}</pre>
        )}
      </div>

      {wallet && (
        <div className="card">
          <h3>Your Wallet</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Wallet ID</span>
              <span className="info-value">{wallet.id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Address</span>
              <span className="info-value info-mono">{wallet.address}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Network</span>
              <span className="info-value">Solana</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Wallet;