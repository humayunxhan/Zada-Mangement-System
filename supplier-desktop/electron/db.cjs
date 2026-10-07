const fs = require('fs'); const path = require('path'); const initSqlJs = require('sql.js'); const crypto = require('crypto');
const ledger = require('./ledger.cjs');
let db; let file;
async function init(dataDir) { const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, '../node_modules/sql.js/dist', f) }); file = path.join(dataDir, 'supplier-reconciliation.sqlite'); db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database(); db.run(`CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, posting_date TEXT, bill_date TEXT, supplier_name TEXT, supplier_bill_no TEXT, voucher_no TEXT, total_bill_amount REAL, tax_percent REAL, tax_amount REAL, actual_amount REAL, category TEXT DEFAULT 'PAYABLE', remarks TEXT, deleted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, bill_sync_id TEXT, payment_date TEXT, amount REAL, payment_mode TEXT, reference_no TEXT, remarks TEXT, deleted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`); db.run(`CREATE TABLE IF NOT EXISTS supplier_ledger_events (id INTEGER PRIMARY KEY AUTOINCREMENT,sync_id TEXT UNIQUE,kind TEXT,bill_sync_id TEXT,target_bill_sync_id TEXT,event_date TEXT,amount REAL,payment_mode TEXT,reference_no TEXT,remarks TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS supplier_sync_state(id INTEGER PRIMARY KEY,source_id TEXT,version INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS supplier_sync_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT);`); if(!one('SELECT * FROM supplier_sync_state WHERE id=1')) db.run('INSERT INTO supplier_sync_state(id,source_id) VALUES(1,?)',[crypto.randomUUID()]); mutate(()=>null); }
function save() {
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
function mutate(work) {
  db.run('BEGIN TRANSACTION');
  let committed=false;
  try {
    const result=work();
    db.run('UPDATE supplier_sync_state SET version=version+1 WHERE id=1');
    const sync=one('SELECT * FROM supplier_sync_state WHERE id=1');
    db.run('DELETE FROM supplier_sync_outbox');
    db.run('INSERT INTO supplier_sync_outbox(payload) VALUES(?)',[JSON.stringify({sourceId:sync.source_id,version:sync.version,...state()})]);
    db.run('COMMIT'); committed=true; save(); return result;
  } catch(e) { if(!committed) db.run('ROLLBACK'); throw e; }
}
function recordEvent(input) { return mutate(()=>{
  const a=active(); const e=ledger.validateEvent({...input,syncId:input.syncId||crypto.randomUUID()},a.bills,a.payments,a.events);
  if(!one('SELECT * FROM supplier_ledger_events WHERE sync_id=?',[e.syncId])) db.run('INSERT INTO supplier_ledger_events(sync_id,kind,bill_sync_id,target_bill_sync_id,event_date,amount,payment_mode,reference_no,remarks,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[e.syncId,e.kind,e.billSyncId,e.targetBillSyncId,e.eventDate,e.amount,e.paymentMode,e.referenceNo,e.remarks,input.createdBy||'desktop']);
  return e;
}); }
function guardedBill(x) { return mutate(()=>{const a=active(); if(x.sync_id) ledger.assertMutable(x.sync_id,a.events); ledger.date(x.posting_date); ledger.date(x.bill_date); const total=Number(x.total_bill_amount), tax=Number(x.tax_percent||0); if(!Number.isFinite(total)||total<=0||!Number.isFinite(tax)||tax<0||tax>100||!String(x.supplier_name||'').trim()) throw new Error('Enter a supplier, positive bill amount and tax between 0 and 100.'); return saveBill(x);}); }
function guardedPayment(x) { return mutate(()=>{ const a=active(); const old=a.payments.find(p=>p.syncId===x.sync_id); if(old&&old.billSyncId===x.bill_sync_id&&old.paymentDate===x.payment_date&&old.amount===ledger.money(x.amount)&&['payment_mode','reference_no','remarks'].every(k=>String(old[k]||'')===String(x[k]||'')))return one('SELECT * FROM payments WHERE sync_id=?',[x.sync_id]); ledger.validatePayment({syncId:x.sync_id,billSyncId:x.bill_sync_id,paymentDate:x.payment_date,amount:x.amount},a.bills,a.payments,a.events); return addPayment(x);}); }
function guardedRemove(table,id) { return mutate(()=>{const item=one(`SELECT * FROM ${table} WHERE sync_id=?`,[id]); ledger.assertMutable(table==='bills'?id:item?.bill_sync_id,active().events); if(table==='bills'&&one('SELECT id FROM payments WHERE bill_sync_id=? AND deleted_at IS NULL',[id])) throw new Error('Delete payments before deleting this bill, or record a stock return.'); return remove(table,id);}); }
module.exports={init,saveBill:guardedBill,addPayment:guardedPayment,recordEvent,list,deleteBill:id=>guardedRemove('bills',id),deletePayment:id=>guardedRemove('payments',id),names:()=>rows('SELECT DISTINCT supplier_name FROM bills WHERE deleted_at IS NULL ORDER BY supplier_name').map(x=>x.supplier_name),syncJob:()=>one('SELECT * FROM supplier_sync_outbox ORDER BY id LIMIT 1'),completeSync:id=>{db.run('DELETE FROM supplier_sync_outbox WHERE id=?',[id]);save();},syncStatus:()=>({pending:one('SELECT COUNT(*) AS pending FROM supplier_sync_outbox').pending})};
