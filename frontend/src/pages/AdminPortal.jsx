import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const AdminPortal = ({ user }) => {
  if (!user) {
    return (
      <div className="admin-access-panel">
        <h2>Authentication required</h2>
        <p>Please sign in with an admin or support account to access the portal.</p>
      </div>
    );
  }

  const canAccess = ['admin', 'support'].includes(user.role);
  if (!canAccess) {
    return (
      <div className="admin-access-panel">
        <h2>Access Denied</h2>
        <p>This portal is restricted to administrators and support staff.</p>
      </div>
    );
  }

  return (
    <div className="admin-portal-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>Operations</h2>
          <span className={`role-pill ${user.role}`}>{user.role.toUpperCase()}</span>
        </div>
        <nav className="admin-sidebar-nav">
          <NavLink to="dashboard" className={({ isActive }) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="users" className={({ isActive }) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
            Users
          </NavLink>
          <NavLink to="withdrawals" className={({ isActive }) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
            Withdrawals
          </NavLink>
          {user.role === 'admin' && (
            <NavLink to="audit" className={({ isActive }) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
              Audit Logs
            </NavLink>
          )}
        </nav>
      </aside>

      <main className="admin-main-content">
        <div className="admin-page-header admin-portal-header">
          <div>
            <h1>Admin Portal</h1>
            <p>Manage users, withdrawals and reconciliation from a centralized operations console.</p>
          </div>
          <div className="admin-portal-actions">
            <div className="admin-action-card">
              <strong>Role</strong>
              <span className={`role-pill ${user.role}`}>{user.role.toUpperCase()}</span>
            </div>
            <div className="admin-action-card">
              <strong>Quick navigation</strong>
              <div className="action-tags">
                <span className="tag">Dashboard</span>
                <span className="tag">Users</span>
                <span className="tag">Withdrawals</span>
              </div>
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminPortal;
