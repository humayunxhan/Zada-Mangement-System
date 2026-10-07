import React from 'react';

export default function Sidebar({ tabs, activeTab, onChange, currentUser, onLogout }) {
  const initials = currentUser?.full_name
    ? currentUser.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <aside className="sidebar">
      <div className="brand-box">
        <small>ZADA PHARMACY</small>
        <h2>Supplier Desk</h2>
        <div className="system-badge">SUPPLIER & PAYMENT DESK</div>
      </div>

      <nav className="side-nav" aria-label="Sidebar navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{currentUser?.full_name || 'Staff User'}</span>
            <div className="user-role-row">
              <span className={`badge-role badge-${currentUser?.role || 'operator'}`}>
                {(currentUser?.role || 'operator').toUpperCase()}
              </span>
              <span className="user-username">@{currentUser?.username}</span>
            </div>
          </div>
        </div>

        <button type="button" className="btn-logout" onClick={onLogout} title="Log Out">
          🚪 Sign Out
        </button>
      </div>
    </aside>
  );
}
