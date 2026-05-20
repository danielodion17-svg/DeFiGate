import React, { useState, useEffect } from 'react';
import { apiUrl } from '../api';

const AdminDashboard = ({ user }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [reconciliationData, setReconciliationData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (user?.role === 'admin') {
        const reconcileResponse = await fetch(apiUrl('/admin/reconcile'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ autoRepair: false }),
        });

        const reconcileResult = await reconcileResponse.json();
        if (reconcileResponse.ok) {
          setReconciliationData(reconcileResult.data);
        } else {
          setError(reconcileResult.error || 'Unable to load reconciliation data');
        }

        const logsResponse = await fetch(apiUrl('/admin/audit-logs?limit=50'), {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        });

        const logsResult = await logsResponse.json();
        if (logsResponse.ok) {
          setAuditLogs(logsResult.data.logs || []);
        }
      }
    } catch (fetchError) {
      console.error('Failed to load dashboard data:', fetchError);
      setError(fetchError.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async (autoRepair = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/admin/reconcile'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autoRepair }),
      });

      const result = await response.json();
      if (response.ok) {
        setReconciliationData(result.data);
        alert(autoRepair ? 'Reconciliation completed with auto-repair' : 'Reconciliation completed');
      } else {
        setError(result.error || 'Reconciliation failed');
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Reconciliation error');
    } finally {
      setLoading(false);
    }
  };

  if (!['admin', 'support'].includes(user?.role)) {
    return (
      <div className="dashboard-container">
        <div className="error-message">
          <h2>Access Denied</h2>
          <p>Admin access required</p>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const overview = reconciliationData?.reconciliation || {};

  return (
    <div className="dashboard-container admin-dashboard-page">
      <div className="admin-dashboard-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Monitor system health, track reconciliation status, and manage core operations.</p>
          {!isAdmin && (
            <p className="support-note">Limited support access. Reconciliation and audit visibility are reserved for administrators.</p>
          )}
        </div>
        <div className="admin-header-actions">
          <button className="btn btn-primary" onClick={() => runReconciliation(false)} disabled={!isAdmin || loading}>
            {loading ? 'Running…' : 'Run Reconciliation'}
          </button>
          <button className="btn btn-secondary" onClick={() => runReconciliation(true)} disabled={!isAdmin || loading}>
            {loading ? 'Running…' : 'Run with Auto-Repair'}
          </button>
        </div>
      </div>

      {error && <div className="admin-alert error">{error}</div>}

      <div className="admin-card-grid">
        <div className="stat-card">
          <span className="stat-label">Total Wallets</span>
          <strong>{overview.total_wallets ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Healthy Wallets</span>
          <strong className="green">{overview.matched ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Mismatches</span>
          <strong className="red">{overview.mismatches ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Errors</span>
          <strong className="yellow">{overview.errors ?? 0}</strong>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={`tab-button ${activeTab === 'reconciliation' ? 'active' : ''}`} onClick={() => isAdmin && setActiveTab('reconciliation')} disabled={!isAdmin}>
          Reconciliation
        </button>
        <button className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => isAdmin && setActiveTab('audit')} disabled={!isAdmin}>
          Audit Logs
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="admin-overview">
          <div className="admin-section">
            <h2>Summary</h2>
            <p>Use the reconciliation controls above to refresh system balances and detect gaps between on-chain and ledger state.</p>
          </div>
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="admin-section">
          <h2>Reconciliation Results</h2>
          {reconciliationData?.reconciliation?.results && reconciliationData.reconciliation.results.length > 0 ? (
            <div className="result-grid">
              {reconciliationData.reconciliation.results.map((result, index) => (
                <div key={index} className={`result-card ${result.status}`}>
                  <div className="result-card-header">
                    <span className="wallet-address">{result.address}</span>
                    <span className={`status-pill ${result.status}`}>{result.status}</span>
                  </div>

                  <div className="result-row">
                    <span>Blockchain</span>
                    <strong>{result.blockchain_balance?.toFixed(2) ?? 'N/A'}</strong>
                  </div>
                  <div className="result-row">
                    <span>App Balance</span>
                    <strong>{result.app_balance?.toFixed(2) ?? 'N/A'}</strong>
                  </div>
                  <div className="result-row">
                    <span>Difference</span>
                    <strong className={result.difference >= 0 ? 'positive' : 'negative'}>
                      {result.difference >= 0 ? '+' : ''}{result.difference?.toFixed(2) ?? '0.00'}
                    </strong>
                  </div>
                  {result.error && <div className="result-error">{result.error}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p>No reconciliation data available. Run reconciliation to load the latest state.</p>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="admin-section">
          <h2>Audit Logs</h2>
          {auditLogs.length > 0 ? (
            <div className="logs-table">
              <div className="table-header">
                <div>Action</div>
                <div>User</div>
                <div>Amount</div>
                <div>Timestamp</div>
              </div>
              {auditLogs.map((log, index) => (
                <div key={index} className="table-row">
                  <div>{log.action}</div>
                  <div>{log.user_id || 'System'}</div>
                  <div>{log.amount ? `${log.amount} ${log.asset || ''}` : '-'}</div>
                  <div>{new Date(log.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <p>No audit logs available.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
