import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function UsersView({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form state
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'operator',
  });
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.auth.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e) {
    e.preventDefault();
    if (!form.username || !form.password || !form.full_name) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);
      setError('');
      setSuccess('');
      await api.auth.createUser(form);
      setSuccess(`User "${form.username}" created successfully!`);
      setForm({ username: '', full_name: '', password: '', role: 'operator' });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(user) {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    if (user.id === currentUser.id) {
      alert('You cannot deactivate your own account.');
      return;
    }

    if (!confirm(`Are you sure you want to mark "${user.username}" as ${nextStatus}?`)) {
      return;
    }

    try {
      await api.auth.toggleStatus(user.id, nextStatus);
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to update user status');
    }
  }

  return (
    <div className="users-view">
      <div className="users-layout">
        {/* Left column: Add New User Form */}
        <div className="panel user-form-panel">
          <h2>Create New Account</h2>
          <p className="panel-sub">Add a staff member or administrator account</p>

          {error && <div className="alert-error">⚠️ {error}</div>}
          {success && <div className="alert-success">✅ {success}</div>}

          <form onSubmit={handleCreateUser}>
            <label>
              Full Name *
              <input
                type="text"
                required
                placeholder="e.g. Muhammad Ali"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>

            <label>
              Username *
              <input
                type="text"
                required
                placeholder="e.g. ali_khan"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
              />
            </label>

            <label>
              Password * (Minimum 12 characters)
              <input
                type="password"
                required
                minLength={12}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>

            <label>
              Role *
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="operator">Operator / Staff (Daily Entry)</option>
                <option value="admin">Administrator (Full Access)</option>
              </select>
            </label>

            <button type="submit" className="primary full-width" disabled={creating}>
              {creating ? 'Creating...' : '+ Create Account'}
            </button>
          </form>
        </div>

        {/* Right column: Users List */}
        <div className="panel users-list-panel">
          <div className="panel-header-row">
            <div>
              <h2>Authorized Users</h2>
              <p className="panel-sub">Accounts stored in MySQL on Hostinger VPS</p>
            </div>
            <button type="button" onClick={loadUsers} className="refresh-btn">
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <p className="muted">Loading user accounts...</p>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.status === 'inactive' ? 'row-inactive' : ''}>
                      <td>
                        <strong>{u.full_name}</strong>
                        <small className="muted">@{u.username}</small>
                      </td>
                      <td>
                        <span className={`role-badge role-${u.role}`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${u.status}`}>
                          {u.status === 'active' ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td>
                        <small className="muted">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                        </small>
                      </td>
                      <td>
                        {u.id !== currentUser.id ? (
                          <button
                            type="button"
                            className={u.status === 'active' ? 'btn-deactivate' : 'btn-activate'}
                            onClick={() => handleToggleStatus(u)}
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <span className="current-user-tag">(You)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
