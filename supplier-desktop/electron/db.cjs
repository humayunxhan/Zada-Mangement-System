const fs = require('fs'); const path = require('path'); const initSqlJs = require('sql.js'); const crypto = require('crypto');
const ledger = require('./ledger.cjs');
const records = require('../shared/records.cjs');
const { store } = require('../shared/backup-files.cjs');
let backups, backupError = null, recoveryRequired = false;
let db; let file;
async function init(dataDir) { const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, '../node_modules/sql.js/dist', f) }); file = path.join(dataDir, 'supplier-reconciliation.sqlite'); recoveryRequired=false; backupError=null; try { if(fs.existsSync(file)&&!fs.statSync(file).size) throw new Error('Empty database file'); db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database(); const check=db.exec('PRAGMA quick_check'); if(check.some(result=>result.values.some(row=>row[0]!=='ok'))) throw new Error('Database integrity check failed'); } catch(e) { db=new SQL.Database(); recoveryRequired=true; backupError='The local database is unreadable. Open Backups & audit and restore a saved backup. The original file has not been overwritten.'; } db.run(`CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, posting_date TEXT, bill_date TEXT, supplier_name TEXT, supplier_bill_no TEXT, voucher_no TEXT, total_bill_amount REAL, tax_percent REAL, tax_amount REAL, actual_amount REAL, category TEXT DEFAULT 'PAYABLE', remarks TEXT, deleted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, bill_sync_id TEXT, payment_date TEXT, amount REAL, payment_mode TEXT, reference_no TEXT, remarks TEXT, deleted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`); db.run(`CREATE TABLE IF NOT EXISTS supplier_ledger_events (id INTEGER PRIMARY KEY AUTOINCREMENT,sync_id TEXT UNIQUE,kind TEXT,bill_sync_id TEXT,target_bill_sync_id TEXT,event_date TEXT,amount REAL,payment_mode TEXT,reference_no TEXT,remarks TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS supplier_sync_state(id INTEGER PRIMARY KEY,source_id TEXT,version INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS supplier_sync_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT);`); db.run(`CREATE TABLE IF NOT EXISTS supplier_audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,sync_id TEXT UNIQUE,actor TEXT,action TEXT,entity TEXT,record_id TEXT,before_json TEXT,after_json TEXT,details_json TEXT,created_at TEXT)`); backups=store(path.join(dataDir,'backups')); if(!one('SELECT * FROM supplier_sync_state WHERE id=1')) db.run('INSERT INTO supplier_sync_state(id,source_id) VALUES(1,?)',[crypto.randomUUID()]); if(!recoveryRequired) { mutate(()=>null); automaticBackup(); } }
function save() {
  if (recoveryRequired) throw new Error('Restore a backup before saving records.');
  const pendingFile = `${file}.pending`;
  fs.writeFileSync(pendingFile, Buffer.from(db.export()));
  fs.renameSync(pendingFile, file);
}
function rows(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const out=[]; while(stmt.step()) out.push(stmt.getAsObject()); stmt.free(); return out; }
const one = (sql,p=[]) => rows(sql,p)[0] || null; const money = n => Math.round((Number(n)||0)*100)/100;
function saveBill(x) { const total=money(x.total_bill_amount), tax=Number(x.tax_percent)||0, taxAmount=money(total*tax/100), actual=money(total-taxAmount), sync=x.sync_id||crypto.randomUUID(); const existing=one('SELECT id FROM bills WHERE sync_id=?',[sync]); const vals=[x.posting_date,x.bill_date,x.supplier_name,x.supplier_bill_no||'',x.voucher_no||'',total,tax,taxAmount,actual,x.category||'PAYABLE',x.remarks||'',sync]; if(existing) db.run('UPDATE bills SET posting_date=?,bill_date=?,supplier_name=?,supplier_bill_no=?,voucher_no=?,total_bill_amount=?,tax_percent=?,tax_amount=?,actual_amount=?,category=?,remarks=? WHERE sync_id=?',vals); else db.run('INSERT INTO bills(posting_date,bill_date,supplier_name,supplier_bill_no,voucher_no,total_bill_amount,tax_percent,tax_amount,actual_amount,category,remarks,sync_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',vals); return one('SELECT * FROM bills WHERE sync_id=?',[sync]); }
function addPayment(x) { const sync=x.sync_id||crypto.randomUUID(); db.run('INSERT OR REPLACE INTO payments(sync_id,bill_sync_id,payment_date,amount,payment_mode,reference_no,remarks) VALUES(?,?,?,?,?,?,?)',[sync,x.bill_sync_id,x.payment_date,money(x.amount),x.payment_mode||'',x.reference_no||'',x.remarks||'']); return one('SELECT * FROM payments WHERE sync_id=?',[sync]); }
function remove(table,id) { const item=one(`SELECT * FROM ${table} WHERE sync_id=?`,[id]); db.run(`UPDATE ${table} SET deleted_at=CURRENT_TIMESTAMP WHERE sync_id=?`,[id]); return item; }
function state() { return { bills: rows('SELECT * FROM bills'), payments: rows('SELECT * FROM payments'), events: rows('SELECT * FROM supplier_ledger_events ORDER BY id') }; }
function active() { const s=state(); return {bills:s.bills.filter(b=>!b.deleted_at).map(ledger.billFromRow),payments:s.payments.filter(p=>!p.deleted_at).map(ledger.paymentFromRow),events:s.events.map(ledger.eventFromRow)}; }
function list(f={}) { const s=state(); return ledger.decorateRows(s.bills.filter(b=>!b.deleted_at&&(!f.from||b.posting_date>=f.from)&&(!f.to||b.posting_date<=f.to)),s.payments.filter(p=>!p.deleted_at),s.events).sort((a,b)=>b.posting_date.localeCompare(a.posting_date)||b.id-a.id); }
function mutate(work, change) {
  if (recoveryRequired) throw new Error('The local database needs recovery. Restore a backup before changing records.');
  db.run('BEGIN TRANSACTION');
  let committed=false;
  try {
    const result=work();
    if (change) {
      const table = { bill: 'bills', payment: 'payments', event: 'supplier_ledger_events' }[change.entity];
      const after = table ? one(`SELECT * FROM ${table} WHERE sync_id=?`,[change.recordId || result?.sync_id || result?.syncId || '']) : result;
      audit({ ...change, after });
    }
    db.run('UPDATE supplier_sync_state SET version=version+1 WHERE id=1');
    const sync=one('SELECT * FROM supplier_sync_state WHERE id=1');
    db.run('DELETE FROM supplier_sync_outbox');
    db.run('INSERT INTO supplier_sync_outbox(payload) VALUES(?)',[JSON.stringify({sourceId:sync.source_id,version:sync.version,...state()})]);
    db.run('COMMIT'); committed=true; save(); return result;
  } catch(e) { if(!committed) db.run('ROLLBACK'); throw e; }
}
function recordEvent(input, actor = 'desktop') { return mutate(()=>{
  const a=active(); const e=ledger.validateEvent({...input,syncId:input.syncId||crypto.randomUUID()},a.bills,a.payments,a.events);
  if(!one('SELECT * FROM supplier_ledger_events WHERE sync_id=?',[e.syncId])) db.run('INSERT INTO supplier_ledger_events(sync_id,kind,bill_sync_id,target_bill_sync_id,event_date,amount,payment_mode,reference_no,remarks,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[e.syncId,e.kind,e.billSyncId,e.targetBillSyncId,e.eventDate,e.amount,e.paymentMode,e.referenceNo,e.remarks,actor]);
  return e;
}, { actor, action: input.kind, entity: 'event', recordId: input.syncId, before: one('SELECT * FROM supplier_ledger_events WHERE sync_id=?',[input.syncId || '']) }); }
function guardedBill(x, actor = 'desktop') { return mutate(()=>{const a=active(); if(x.sync_id) ledger.assertMutable(x.sync_id,a.events); ledger.date(x.posting_date); ledger.date(x.bill_date); const total=Number(x.total_bill_amount), tax=Number(x.tax_percent||0); if(!Number.isFinite(total)||total<=0||!Number.isFinite(tax)||tax<0||tax>100||!String(x.supplier_name||'').trim()) throw new Error('Enter a supplier, positive bill amount and tax between 0 and 100.'); records.checkDuplicate(x, state().bills); return saveBill(x);}, { actor, action: x.sync_id && one('SELECT sync_id FROM bills WHERE sync_id=?',[x.sync_id]) ? 'UPDATE' : 'CREATE', entity: 'bill', recordId: x.sync_id, before: one('SELECT * FROM bills WHERE sync_id=?',[x.sync_id || '']), details: { duplicateAcknowledged: x.duplicate_acknowledged || [] } }); }
function guardedPayment(x, actor = 'desktop') { return mutate(()=>{ const a=active(); const old=a.payments.find(p=>p.syncId===x.sync_id); if(old&&old.billSyncId===x.bill_sync_id&&old.paymentDate===x.payment_date&&old.amount===ledger.money(x.amount)&&['payment_mode','reference_no','remarks'].every(k=>String(old[k]||'')===String(x[k]||'')))return one('SELECT * FROM payments WHERE sync_id=?',[x.sync_id]); ledger.validatePayment({syncId:x.sync_id,billSyncId:x.bill_sync_id,paymentDate:x.payment_date,amount:x.amount},a.bills,a.payments,a.events); return addPayment(x);}, { actor, action: 'PAYMENT', entity: 'payment', recordId: x.sync_id, before: one('SELECT * FROM payments WHERE sync_id=?',[x.sync_id || '']) }); }
function guardedRemove(table,id,actor = 'desktop') { return mutate(()=>{const item=one(`SELECT * FROM ${table} WHERE sync_id=?`,[id]); ledger.assertMutable(table==='bills'?id:item?.bill_sync_id,active().events); if(table==='bills'&&one('SELECT id FROM payments WHERE bill_sync_id=? AND deleted_at IS NULL',[id])) throw new Error('Delete payments before deleting this bill, or record a stock return.'); return remove(table,id);}, { actor, action: 'DELETE', entity: table === 'bills' ? 'bill' : 'payment', recordId: id, before: one(`SELECT * FROM ${table} WHERE sync_id=?`,[id]) }); }

function audit({ actor = 'system', action, entity, recordId = '', before = null, after = null, details = {} }) {
  const table = { bill: 'bills', payment: 'payments', event: 'events' }[entity];
  const safe = row => row && table ? records.clean(table, row) : row;
  if (before && JSON.stringify(safe(before)) === JSON.stringify(safe(after))) return;
  db.run('INSERT INTO supplier_audit_log(sync_id,actor,action,entity,record_id,before_json,after_json,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(),actor,action,entity,String(recordId || after?.sync_id || after?.syncId || ''),JSON.stringify(safe(before)),JSON.stringify(safe(after)),JSON.stringify(details),new Date().toISOString()]);
}
function auditList({ from = '', to = '', action = '', search = '', limit = 200 } = {}) {
  const range = records.auditRange({from,to});
  return rows('SELECT * FROM supplier_audit_log ORDER BY id DESC').filter(r => (!range.from || r.created_at >= range.from) && (!range.to || r.created_at <= range.to) && (!action || r.action === action) && `${r.actor} ${r.action} ${r.entity} ${r.record_id}`.toLowerCase().includes(search.toLowerCase())).slice(0, Math.min(1000,Math.max(1,Number(limit)||200)));
}
function backupState() { const sync=one('SELECT * FROM supplier_sync_state WHERE id=1'); return { ...state(), sync: {sourceId:sync.source_id,version:sync.version}, audit: rows('SELECT * FROM supplier_audit_log ORDER BY id') }; }
function createBackup(actor = 'system', reason = 'MANUAL') {
  if (recoveryRequired) throw new Error('Restore a saved backup before creating a new backup.');
  const result = backups.write(records.encodeBackup(backupState()));
  audit({ actor, action: 'BACKUP', entity: 'backup', recordId: result.id, details: { reason } }); save(); backupError = null; return result;
}
function automaticBackup() {
  if (recoveryRequired) return;
  try { if (backups.due()) createBackup('system','AUTOMATIC'); } catch(e) { backupError = e.message; }
}
function restoreBackup(input, actor = 'desktop') {
  const backup = typeof input === 'string' ? backups.read(input) : input;
  const current = backupState();
  const data = records.restoreData(current,backup);
  const recovering = recoveryRequired;
  let safety;
  if (recovering) { const damaged=path.join(path.dirname(file),`supplier-reconciliation.damaged-${Date.now()}.sqlite`); fs.copyFileSync(file,damaged); safety={id:path.basename(damaged)}; }
  else safety=createBackup(actor,'BEFORE_RESTORE');
  recoveryRequired=false;
  try { const result = mutate(() => {
    db.run('UPDATE supplier_sync_state SET source_id=?, version=? WHERE id=1',[backup.sync?.sourceId || current.sync.sourceId,Math.max(Date.now(),current.sync.version,backup.sync?.version || 0)]);
    for (const [table, destination] of [['events','supplier_ledger_events'],['payments','payments'],['bills','bills']]) {
      db.run(`DELETE FROM ${destination}`);
      const keys = records.fields[table].filter(k => k !== 'created_by' || table === 'events');
      for (const row of data[table]) db.run(`INSERT INTO ${destination}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`,keys.map(k => row[k]));
    }
    for (const row of data.audit) db.run(`INSERT OR IGNORE INTO supplier_audit_log(${records.fields.audit.join(',')}) VALUES(${records.fields.audit.map(() => '?').join(',')})`,records.fields.audit.map(k => row[k]));
    return { bills: data.bills.length, payments: data.payments.length, events: data.events.length, safetyBackup: safety.id };
  }, { actor, action: 'RESTORE', entity: 'backup', details: { backupDate: typeof input === 'object' ? input.createdAt : input, safetyBackup: safety.id, recoveredUnreadableDatabase: recovering } });
  backupError=null; return result;
  } catch(e) { recoveryRequired=recovering; throw e; }
}
module.exports = {
  init, saveBill: guardedBill, addPayment: guardedPayment, recordEvent, list,
  deleteBill: (id, actor) => guardedRemove('bills',id,actor), deletePayment: (id, actor) => guardedRemove('payments',id,actor),
  names: () => rows('SELECT DISTINCT supplier_name FROM bills WHERE deleted_at IS NULL ORDER BY supplier_name').map(x => x.supplier_name),
  exportData: input => input.dataset === 'audit' ? { rows: auditList(input) } : records.exportData(state(),input),
  duplicates: input => records.duplicates(input,state().bills), auditList, createBackup, automaticBackup, restoreBackup,
  backupList: () => ({ items: backups.list(), error: backupError, recoveryRequired, schedule: 'Daily; latest 30 backups retained', location: backups.root }),
  downloadBackup: id => backups.read(id),
  syncJob: () => one('SELECT * FROM supplier_sync_outbox ORDER BY id LIMIT 1'),
  completeSync: id => { db.run('DELETE FROM supplier_sync_outbox WHERE id=?',[id]); save(); },
  syncStatus: () => ({ pending: one('SELECT COUNT(*) AS pending FROM supplier_sync_outbox').pending, recoveryRequired }),
};
