import ledger from '../shared/ledger.cjs';
import crypto from 'crypto';
import records from '../shared/records.cjs';
import { insertAudit } from './audit.js';
import { getPool } from './db.js';

export async function state(conn, lock = false) {
  const [bills] = await conn.query(`SELECT * FROM bills ORDER BY sync_id${lock ? ' FOR UPDATE' : ''}`);
  const [payments] = await conn.query('SELECT * FROM payments');
  const [events] = await conn.query('SELECT * FROM supplier_ledger_events ORDER BY id');
  return { bills, payments, events };
}
export const active = s => ({ bills: s.bills.filter(b => !b.deleted_at).map(ledger.billFromRow), payments: s.payments.filter(p => !p.deleted_at).map(ledger.paymentFromRow), events: s.events.map(ledger.eventFromRow) });
export async function transaction(work, actor = 'system', details = {}) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    // A single database row serializes financial mutations, including inserts.
    await conn.query('SELECT id FROM supplier_sync_state WHERE id = 1 FOR UPDATE');
    const before = await state(conn, true);
    const result = await work(conn, before);
    await conn.query('UPDATE supplier_sync_state SET version = version + 1 WHERE id = 1');
    const [sync] = await conn.query('SELECT * FROM supplier_sync_state WHERE id = 1');
    const s = await state(conn);
    for (const [table, entity] of [['bills','bill'],['payments','payment'],['events','event']]) {
      const old = new Map(before[table].map(r => [r.sync_id,r]));
      for (const row of s[table]) {
        const previous = old.get(row.sync_id);
        if (!previous || JSON.stringify(records.clean(table,previous)) !== JSON.stringify(records.clean(table,row))) await insertAudit(conn, { actor, entity, recordId: row.sync_id, action: row.deleted_at && !previous?.deleted_at ? 'DELETE' : !previous ? (table === 'events' ? row.kind : 'CREATE') : 'UPDATE', before: previous || null, after: row, details });
      }
      for (const row of before[table]) if (!s[table].some(r => r.sync_id === row.sync_id)) await insertAudit(conn,{actor,entity,recordId:row.sync_id,action:'RESTORE_REMOVE',before:row,details});
    }
    const snapshot = { sourceId: sync[0].source_id, version: Number(sync[0].version), ...s };
    await conn.query('DELETE FROM supplier_sync_outbox'); // The latest full snapshot supersedes unsent snapshots.
    await conn.query('INSERT INTO supplier_sync_outbox (payload) VALUES (?)', [JSON.stringify(snapshot)]);
    await conn.commit();
    return result;
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
export function ensureUnlocked(id, s) { ledger.assertMutable(id, s.events.map(ledger.eventFromRow)); }
export async function recordEvent(input, actor) {
  return transaction(async (conn, s) => {
    const a = active(s);
    const event = ledger.validateEvent({ ...input, syncId: input.syncId || crypto.randomUUID() }, a.bills, a.payments, a.events);
    if (s.events.some(e => e.sync_id === event.syncId)) return event;
    await conn.query('INSERT INTO supplier_ledger_events (sync_id, kind, bill_sync_id, target_bill_sync_id, event_date, amount, payment_mode, reference_no, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [event.syncId, event.kind, event.billSyncId, event.targetBillSyncId, event.eventDate, event.amount, event.paymentMode, event.referenceNo, event.remarks, actor]);
    return event;
  }, actor);
}
