import { getPool } from './db.js';
let flushing = false;
let lastError = null;
export async function flushSupplierSync() {
  if (flushing) return;
  flushing = true;
  try {
    const pool = getPool();
    while (true) {
      const [jobs] = await pool.query('SELECT * FROM supplier_sync_outbox ORDER BY id LIMIT 1');
      if (!jobs.length) break;
      const job = jobs[0];
      const body = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const response = await fetch(`${process.env.CEO_SERVER_URL || 'https://cashbook-e9h7.onrender.com'}/api/v1/suppliers/snapshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, pharmacyId: process.env.CEO_PHARMACY_ID || 'zada-pharmacy', branchId: process.env.CEO_BRANCH_ID || 'main' }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`CEO sync: ${response.status} ${await response.text()}`);
      await pool.query('DELETE FROM supplier_sync_outbox WHERE id = ?', [job.id]);
      lastError = null;
    }
  } catch (e) { lastError = e.message; } finally { flushing = false; }
}
export async function supplierSyncStatus() {
  const [rows] = await getPool().query('SELECT COUNT(*) AS pending FROM supplier_sync_outbox');
  return { pending: Number(rows[0].pending), error: lastError };
}
