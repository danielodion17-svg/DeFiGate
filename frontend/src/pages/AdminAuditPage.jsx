import React, { useEffect, useState } from 'react';
import { apiUrl } from '../api';

const AdminAuditPage = ({ user }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('authToken');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/admin/audit-logs?limit=100'), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (data.ok) {
          setLogs(data.data.logs || []);
        }
      } catch (error) {
        console.error('Failed to fetch audit logs', error);
      } finally {
        setLoading(false);
      }
    };
    if (user?.role === 'admin') {
      fetchLogs();
    }
  }, [user]);

  if (user?.role !== 'admin') {
    return (
      <div className="admin-access-panel">
        <h2>Admin Access Required</h2>
        <p>Only administrators can view the audit trail.</p>
      </div>
    );
  }

  return (
    <div className="admin-section admin-audit-page">
      <div className="admin-section-header">
        <h2>Audit Logs</h2>
        <p>Review recent system actions, changes, and high-risk operational events.</p>
      </div>

      <div className="admin-table-overflow">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>User</th>
              <th>Amount</th>
              <th>Metadata</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.action}</td>
                <td>{log.user_id || 'System'}</td>
                <td>{log.amount ? `${log.amount} ${log.asset || ''}` : '-'}</td>
                <td>
                  {log.metadata ? (
                    <details>
                      <summary>View details</summary>
                      <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                    </details>
                  ) : (
                    '-'
                  )}
                </td>
                <td>{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan="5">No audit logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="loading">Loading audit logs…</p>}
    </div>
  );
};

export default AdminAuditPage;
