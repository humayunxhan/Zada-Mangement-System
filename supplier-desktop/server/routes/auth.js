import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { accountChange } from '../audit.js';
import { getPool } from '../db.js';
import { authenticateToken, requireAdmin, generateToken } from '../middleware/auth.js';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const pool = getPool();
    const [users] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username.trim()]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This account has been deactivated. Contact Administrator.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const [users] = await pool.query('SELECT id, username, full_name, role, status, created_at FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change own password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const pool = getPool();
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    await accountChange(async conn => {
      await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
      return { result: null, change: { action: 'PASSWORD_CHANGE', recordId: req.user.id, after: { passwordChanged: true } } };
    }, req.user.username);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN ONLY ROUTES ---

// List all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [users] = await pool.query('SELECT id, username, full_name, role, status, created_at FROM users ORDER BY id ASC');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user (Admin only)
router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password, and full name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const pool = getPool();
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'operator';

    const result = await accountChange(async conn => {
    const [created] = await conn.query(
      'INSERT INTO users (username, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)',
      [username.trim(), hash, full_name.trim(), userRole, 'active']
    );
    return { result: created, change: { action: 'ACCOUNT_CREATE', recordId: created.insertId, after: { username: username.trim(), full_name: full_name.trim(), role: userRole, status: 'active' } } };
    }, req.user.username);

    res.status(201).json({
      success: true,
      user: {
        id: result.insertId,
        username: username.trim(),
        full_name: full_name.trim(),
        role: userRole,
        status: 'active',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle user status active/inactive (Admin only)
router.patch('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const pool = getPool();
    await accountChange(async conn => {
      const [before] = await conn.query('SELECT id,username,full_name,role,status FROM users WHERE id=? FOR UPDATE',[userId]);
      if (!before.length) { const e=new Error('Account not found.'); e.status=404; throw e; }
      await conn.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
      return { result: null, change: { action: 'ACCOUNT_STATUS', recordId: userId, before: before[0], after: { ...before[0], status } } };
    }, req.user.username);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
