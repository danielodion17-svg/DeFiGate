import React, { useEffect, useState } from 'react';
import { apiUrl } from '../api';

const AdminUsersPage = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [roleChanges, setRoleChanges] = useState({});
  const [filter, setFilter] = useState('');

  const token = localStorage.getItem('authToken');
  const canUpdateRoles = user?.role === 'admin';

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/admin/users?limit=200'), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(data.data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUserRole = async (userId, newRole) => {
    if (!canUpdateRoles) return;
    try {
      const res = await fetch(apiUrl(`/admin/users/${userId}/role`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchUsers();
        alert('User role updated');
      } else {
        alert(data.error || 'Failed to update role');
      }
    } catch (error) {
      alert(error.message || 'Failed to update role');
    }
  };

  const changeFreezeState = async (userId, action) => {
    try {
      const res = await fetch(apiUrl(`/admin/users/${userId}/${action}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: action === 'freeze' ? 'Manual review requested' : undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchUsers();
        alert(`User ${action}d successfully`);
      } else {
        alert(data.error || `Failed to ${action} user`);
      }
    } catch (error) {
      alert(error.message || `Failed to ${action} user`);
    }
  };

  const filteredUsers = users.filter((userRecord) =>
    userRecord.email.toLowerCase().includes(filter.toLowerCase()) ||
    userRecord.role?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="admin-section admin-users-page">
      <div className="admin-section-header">
        <div>
          <h2>User Management</h2>
          <p>View users, adjust roles, and manage account status from a single admin panel.</p>
        </div>
        <div className="admin-page-actions">
          <input
            className="search-input"
            placeholder="Search users by email or role"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-table-overflow">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((userRecord) => (
              <tr key={userRecord.id}>
                <td>{userRecord.email}</td>
                <td>
                  {canUpdateRoles ? (
                    <select
                      value={roleChanges[userRecord.id] ?? userRecord.role}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRoleChanges((prev) => ({ ...prev, [userRecord.id]: value }));
                      }}
                      onBlur={(e) => updateUserRole(userRecord.id, e.target.value)}
                    >
                      <option value="user">user</option>
                      <option value="support">support</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className={`status-pill ${userRecord.role}`}>{userRecord.role}</span>
                  )}
                </td>
                <td>
                  <span className={`status-pill ${userRecord.is_frozen ? 'red' : 'green'}`}>
                    {userRecord.is_frozen ? 'Frozen' : 'Active'}
                  </span>
                </td>
                <td>{new Date(userRecord.created_at).toLocaleString()}</td>
                <td className="admin-actions-cell">
                  <button className="btn btn-secondary" onClick={() => changeFreezeState(userRecord.id, userRecord.is_frozen ? 'unfreeze' : 'freeze')}>
                    {userRecord.is_frozen ? 'Unfreeze' : 'Freeze'}
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="5">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="loading">Loading users…</p>}
    </div>
  );
};

export default AdminUsersPage;
