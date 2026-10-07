import DeveloperCredits from '../components/DeveloperCredits';
import React, { useState } from 'react';
import { api } from '../api';
import InstallApp from '../components/InstallApp';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await api.auth.login(username.trim(), password);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials or server connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <div className="login-brand">
            <span className="brand-tag">ZADA PHARMACY</span>
            <h1>SPMS Portal</h1>
            <p>Supplier & Payment Management System</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign In to Your Account</h2>

          {error && <div className="login-error">⚠️ {error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              placeholder="e.g. admin or staff"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>

          <InstallApp />
          <div className="login-footer">
            <small>Private portal · Authorized users only</small>
          </div>
        </form>
        <DeveloperCredits />
      </div>
    </div>
  );
}
