import React, { useState } from 'react';

function Send({ currentUser, sendTokens }) {
  const [result, setResult] = useState(null);
  const wallet = currentUser?.wallet;

  const handleSend = async (e) => {
    e.preventDefault();
    const toAddress = e.target.toAddress.value;
    const tokenAddress = e.target.tokenAddress.value;
    const amount = e.target.amount.value;
    const data = await sendTokens(toAddress, tokenAddress, amount);
    if (data) setResult(JSON.stringify(data, null, 2));
  };

  return (
    <div className="view active" id="view-send">
      <div className="page-header">
        <h1>Send Tokens</h1>
        <p className="subtitle">Transfer tokens to any address on supported chains</p>
      </div>
      <div className="card">
        <form onSubmit={handleSend}>
          <div className="form-group">
            <label htmlFor="sendToAddress">Recipient Address</label>
            <input type="text" id="sendToAddress" name="toAddress" placeholder="Enter Solana wallet address" required />
          </div>
          <div className="form-group">
            <label htmlFor="sendTokenAddress">Token</label>
            <select id="sendTokenAddress" name="tokenAddress">
              <option value="">SOL (Native)</option>
              <option value="USDC">USDC (SPL Token)</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sendAmount">Amount</label>
              <input type="number" id="sendAmount" name="amount" placeholder="0.00" step="0.0001" min="0" autoComplete="off" required />
            </div>
            <div className="form-group">
              <label>Network</label>
              <div className="info-value">{wallet ? wallet.chain?.toUpperCase() : "No wallet"}</div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!currentUser || !wallet?.address}>Send</button>
        </form>
        {result && <pre className="result success">{result}</pre>}
      </div>
    </div>
  );
}

export default Send;