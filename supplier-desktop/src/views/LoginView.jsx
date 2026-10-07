import React, { useState } from 'react';
import Icon from '../components/Icon';
import Feedback from '../components/Feedback';
import { api } from '../api';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
            <span className="login-mark pharmacy-mark"><Icon name="pharmacy" size={28} /></span><p className="login-brand-name">Zada Pharmacy</p>
            <h1>Supplier desk</h1>
            <p>Bills, payments and supplier returns.</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in to continue</h2>

          {error && <Feedback>{error}</Feedback>}

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
            <div className="password-field"><input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            /><button type="button" aria-controls="password" aria-pressed={showPassword} disabled={loading} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button></div>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="login-footer">
            <small>Need access? Ask your pharmacy administrator.</small>
          </div>
        </form>
      </div>
    </div>
  );
}
