import { Router } from 'express';
import crypto from 'crypto';
import { getPool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

import records from '../../shared/records.cjs';
import ledger from '../../shared/ledger.cjs';
import { transaction, ensureUnlocked } from '../ledger-store.js';

const router = Router();
router.use(authenticateToken);

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// List bills with filtering and computed payment stats
router.get('/', async (req, res) => {
  try {
    const { from, to, search } = req.query;
    const pool = getPool();

    let whereClause = 'WHERE b.deleted_at IS NULL';
    const params = [];

    if (from) {
      whereClause += ' AND b.posting_date >= ?';
      params.push(from);
    }
    if (to) {
      whereClause += ' AND b.posting_date <= ?';
      params.push(to);
    }
    if (search) {
      whereClause += ' AND (b.supplier_name LIKE ? OR b.supplier_bill_no LIKE ? OR b.voucher_no LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const query = `
      SELECT b.* 
      FROM bills b 
      ${whereClause} 
      ORDER BY b.posting_date DESC, b.id DESC
    `;
    const [bills] = await pool.query(query, params);

    // Fetch active payments
    const [payments] = await pool.query('SELECT * FROM payments WHERE deleted_at IS NULL ORDER BY payment_date ASC, id ASC');

    const [events] = await pool.query('SELECT * FROM supplier_ledger_events ORDER BY id');
    const enriched = ledger.decorateRows(bills, payments, events);

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching bills:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Distinct supplier names
router.get('/suppliers', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT DISTINCT supplier_name FROM bills WHERE deleted_at IS NULL AND supplier_name IS NOT NULL AND supplier_name != "" ORDER BY supplier_name ASC'
    );
    res.json(rows.map((r) => r.supplier_name));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Create or update a bill
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const total = money(b.total_bill_amount);
    const tax = Number(b.tax_percent) || 0;
    const taxAmount = money((total * tax) / 100);
    const actual = money(total - taxAmount);
    const syncId = b.sync_id || crypto.randomUUID();
    const savedBill = await transaction(async (pool, state) => {
    if (b.sync_id) ensureUnlocked(b.sync_id, state);
    ledger.date(b.posting_date); ledger.date(b.bill_date);
    if (!Number.isFinite(total) || !Number.isFinite(tax) || total <= 0 || tax < 0 || tax > 100) { const e = new Error('Enter a positive bill amount and tax between 0 and 100.'); e.status = 400; throw e; }
    if (!String(b.supplier_name || '').trim()) { const e = new Error('Supplier name is required.'); e.status = 400; throw e; }
    records.checkDuplicate(b, state.bills);
    const [existing] = await pool.query('SELECT id FROM bills WHERE sync_id = ?', [syncId]);

    if (existing.length > 0) {
      await pool.query(
        `UPDATE bills SET 
          posting_date = ?, 
          bill_date = ?, 
          supplier_name = ?, 
          supplier_bill_no = ?, 
          voucher_no = ?, 
          total_bill_amount = ?, 
          tax_percent = ?, 
          tax_amount = ?, 
          actual_amount = ?, 
          category = ?, 
          remarks = ? 
        WHERE sync_id = ?`,
        [
          b.posting_date,
          b.bill_date,
          b.supplier_name,
          b.supplier_bill_no || '',
          b.voucher_no || '',
          total,
          tax,
          taxAmount,
          actual,
          b.category || 'PAYABLE',
          b.remarks || '',
          syncId,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO bills (
          sync_id, posting_date, bill_date, supplier_name, supplier_bill_no, 
          voucher_no, total_bill_amount, tax_percent, tax_amount, actual_amount, 
          category, remarks, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          syncId,
          b.posting_date,
          b.bill_date,
          b.supplier_name,
          b.supplier_bill_no || '',
          b.voucher_no || '',
          total,
          tax,
          taxAmount,
          actual,
          b.category || 'PAYABLE',
          b.remarks || '',
          req.user?.username || 'system',
        ]
      );
    }

    const [saved] = await pool.query('SELECT * FROM bills WHERE sync_id = ?', [syncId]);
    return saved[0];
    }, req.user.username, { duplicateAcknowledged: b.duplicate_acknowledged || [] });
    res.json(savedBill);
  } catch (err) {
    console.error('Error saving bill:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Soft delete a bill
router.delete('/:syncId', async (req, res) => {
  try {
    const { syncId } = req.params;
    await transaction(async (pool, state) => {
      ensureUnlocked(syncId, state);
      if (state.payments.some(p => p.bill_sync_id === syncId && !p.deleted_at)) { const e = new Error('Delete payments before deleting this bill, or record a stock return.'); e.status = 400; throw e; }
      await pool.query('UPDATE bills SET deleted_at = CURRENT_TIMESTAMP WHERE sync_id = ?', [syncId]);
    }, req.user.username);
    res.json({ success: true, syncId });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
