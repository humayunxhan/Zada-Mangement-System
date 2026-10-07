import crypto from 'crypto';
import { getPool } from './db.js';
import records from '../shared/records.cjs';
export async function insertAudit(conn, { actor = 'system', action, entity, recordId = '', before = null, after = null, details = {} }) {
  const table = { bill: 'bills', payment: 'payments', event: 'events' }[entity];
  const safe = row => row && table ? records.clean(table, row) : row;
  if (before && JSON.stringify(safe(before)) === JSON.stringify(safe(after))) return;
  await conn.query('INSERT INTO supplier_audit_log(sync_id,actor,action,entity,record_id,before_json,after_json,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(),actor,action,entity,String(recordId || ''),JSON.stringify(safe(before)),JSON.stringify(safe(after)),JSON.stringify(details),new Date().toISOString()]);
}
export async function accountChange(work, actor) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const { result, change } = await work(conn);
    await insertAudit(conn, { actor, entity: 'account', ...change });
    await conn.commit(); return result;
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
