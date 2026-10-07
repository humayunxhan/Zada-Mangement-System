import React from 'react';
import Icon from './Icon';

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
        <span className="pharmacy-mark"><Icon name="pharmacy" size={25} /></span>
        <div><h2>Zada Pharmacy</h2><p>Supplier desk</p></div>
      </div>

      <nav className="side-nav" aria-label="Sidebar navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            <Icon name={tab.icon} size={19} />
            <span>{tab.label}</span>
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
                {currentUser?.role === 'admin' ? 'Administrator' : 'Operator'}
              </span>
              <span className="user-username">@{currentUser?.username}</span>
            </div>
          </div>
        </div>

        <button type="button" className="btn-logout" onClick={onLogout} title="Log Out">
          <Icon name="logout" size={18} /> Sign out
        </button>
      </div>
    </aside>
  );
}
