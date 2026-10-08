import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import { getPool } from './db.js';
import { transaction, state } from './ledger-store.js';
import { insertAudit } from './audit.js';
import { authenticateToken, requireAdmin } from './middleware/auth.js';
import records from '../shared/records.cjs';
import backupFiles from '../shared/backup-files.cjs';
const router = Router();
let files, backupError = null, backupRunning = false;
const store = () => files ||= backupFiles.store(process.env.BACKUP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)),'backups'));
const run = fn => async (req,res) => { try { res.json(await fn(req)); } catch(e) { res.status(e.status || 500).json({ error: e.message }); } };
async function snapshot(conn) {
  const s = await state(conn); const [sync] = await conn.query('SELECT * FROM supplier_sync_state WHERE id=1'); const [audit] = await conn.query('SELECT * FROM supplier_audit_log ORDER BY id'); return { ...s, sync: {sourceId:sync[0].source_id,version:Number(sync[0].version)}, audit };
}
export async function createBackup(actor = 'system', reason = 'MANUAL') {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM supplier_sync_state WHERE id=1 FOR UPDATE');
    const result = store().write(records.encodeBackup(await snapshot(conn)));
    await insertAudit(conn,{actor,action:'BACKUP',entity:'backup',recordId:result.id,details:{reason}});
    await conn.commit(); backupError=null; return result;
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
export async function automaticBackup() {
  if (backupRunning) return;
  backupRunning=true;
  try { if (store().due()) await createBackup('system','AUTOMATIC'); } catch(e) { backupError=e.message; } finally { backupRunning=false; }
}
router.use(authenticateToken);
router.post('/duplicates',run(async req => { const [bills] = await getPool().query('SELECT * FROM bills WHERE deleted_at IS NULL'); return records.duplicates(req.body,bills); }));
async function auditList(filters = {}) {
  const where=['1=1'],args=[];
  const range=records.auditRange(filters);
  if (range.from) { where.push('created_at>=?'); args.push(range.from); }
  if (range.to) { where.push('created_at<=?'); args.push(range.to); }
  if (filters.action) { where.push('action=?'); args.push(filters.action); }
  if (filters.search) { where.push("CONCAT_WS(' ',actor,action,entity,record_id) LIKE ?"); args.push(`%${filters.search}%`); }
  const limit=Math.min(1000,Math.max(1,Number(filters.limit)||200));
  const [items]=await getPool().query(`SELECT * FROM supplier_audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`,args);return items;
}
router.post('/export',run(async req => {
  if (req.body.dataset === 'audit') {
    if (req.user.role !== 'admin') { const e = new Error('Administrator access required.'); e.status=403; throw e; }
    return { rows: await auditList(req.body) };
  }
  return records.exportData(await state(getPool()),req.body);
}));
router.use(requireAdmin);
router.get('/backups',run(async () => ({ items: store().list(),error:backupError,schedule:'Daily; latest 30 backups retained',location:store().root })));
router.post('/backups',run(req => createBackup(req.user.username)));
router.get('/backups/:id',run(req => store().read(req.params.id)));
router.post('/restore',run(async req => {
  const input = req.body.id ? store().read(req.body.id) : req.body.backup;
  records.decodeBackup(input);
  const result = await transaction(async (conn,current) => {
    const [sync] = await conn.query('SELECT * FROM supplier_sync_state WHERE id=1');
    const identity={sourceId:sync[0].source_id,version:Number(sync[0].version)};
    const data = records.restoreData({...current,sync:identity},input);
    const safety = store().write(records.encodeBackup(await snapshot(conn)));
    await insertAudit(conn,{actor:req.user.username,action:'BACKUP',entity:'backup',recordId:safety.id,details:{reason:'BEFORE_RESTORE'}});
    await conn.query('UPDATE supplier_sync_state SET source_id=?,version=? WHERE id=1',[input.sync?.sourceId || identity.sourceId,Math.max(Date.now(),identity.version,input.sync?.version || 0)]);
    for (const [table,destination] of [['events','supplier_ledger_events'],['payments','payments'],['bills','bills']]) {
      await conn.query(`DELETE FROM ${destination}`);
      const keys=records.fields[table];
      for (const row of data[table]) await conn.query(`INSERT INTO ${destination}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,keys.map(k=>['created_at','deleted_at'].includes(k)&&row[k] ? new Date(row[k]).toISOString().slice(0,19).replace('T',' ') : row[k]));
    }
    for (const row of data.audit) await conn.query(`INSERT IGNORE INTO supplier_audit_log(${records.fields.audit.join(',')}) VALUES(${records.fields.audit.map(()=>'?').join(',')})`,records.fields.audit.map(k=>row[k]));
    await insertAudit(conn,{actor:req.user.username,action:'RESTORE',entity:'backup',details:{backupDate:input.createdAt,safetyBackup:safety.id}});
    return { bills:data.bills.length,payments:data.payments.length,events:data.events.length,safetyBackup:safety.id };
  },req.user.username,{reason:'BACKUP_RESTORE'});
  return result;
}));
router.get('/audit',run(req => auditList(req.query)));
export default router;
