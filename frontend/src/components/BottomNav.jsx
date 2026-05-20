import React from 'react';

const BottomNav = ({ currentView, navigateTo, user }) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Home',
      icon: '🏠',
    },
    {
      id: 'finances',
      label: 'Finances',
      icon: '💰',
    },
    {
      id: 'history',
      label: 'History',
      icon: '📊',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
    },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${currentView === item.id ? 'active' : ''}`}
          onClick={() => navigateTo(item.id)}
          title={item.label}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;