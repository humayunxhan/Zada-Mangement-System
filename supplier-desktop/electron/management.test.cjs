const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os');
const db=require('./db.cjs'),records=require('../shared/records.cjs'),cleanup=require('./test-cleanup.cjs');
const bill=(id,extra={})=>({sync_id:id,posting_date:'2026-10-01',bill_date:'2026-10-01',supplier_name:'Supplier A',supplier_bill_no:'INV-1',total_bill_amount:1000,tax_percent:0,category:'PAYABLE',...extra});
test('duplicates require explicit acknowledgement and changes carry attributable before/after audit entries',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zada-management-test-'));
 try {
  await db.init(dir);db.saveBill(bill('a'),'Ali');
  assert.equal(db.duplicates(bill('b',{supplier_name:'  SUPPLIER   A ',supplier_bill_no:' inv-1 '})).length,1);
  assert.throws(()=>db.saveBill(bill('b'),'Ali'),/Duplicate invoice/);
  assert.equal(db.list().length,1);assert.equal(db.duplicates(bill('a')).length,0);
  db.saveBill(bill('b',{duplicate_acknowledged:['a']}),'Bilal');
  db.saveBill(bill('a',{total_bill_amount:1200,duplicate_acknowledged:['b']}),'Ali');
  const edited=db.auditList().find(r=>r.action==='UPDATE'&&r.record_id==='a');
  assert.equal(edited.actor,'Ali');assert.equal(JSON.parse(edited.before_json).total_bill_amount,1000);assert.equal(JSON.parse(edited.after_json).total_bill_amount,1200);
  const accepted=db.auditList().find(r=>r.action==='CREATE'&&r.record_id==='b');assert.deepEqual(JSON.parse(accepted.details_json).duplicateAcknowledged,['a']);
  const count=db.auditList().length;db.list();db.names();db.backupList();db.auditList();assert.equal(db.auditList().length,count);
  db.deleteBill('b','Bilal');const deleted=db.auditList()[0];assert.equal(deleted.action,'DELETE');assert.ok(JSON.parse(deleted.after_json).deleted_at);
  await db.init(dir);assert.ok(db.auditList().some(r=>r.sync_id===edited.sync_id));
 }finally{cleanup(dir);}
});
test('automatic backups, valid restore, audit preservation, sync tombstones and malformed-file rejection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zada-backup-test-'));
 try {
  await db.init(dir);assert.equal(db.backupList().items.length,1);
  db.automaticBackup();assert.equal(db.backupList().items.length,1);
  db.saveBill(bill('a'),'Ali');db.addPayment({sync_id:'p',bill_sync_id:'a',payment_date:'2026-10-02',amount:200,payment_mode:'CHEQUE'},'Ali');
  const saved=db.createBackup('Ali'),backup=db.downloadBackup(saved.id);
  assert.equal(records.decodeBackup(backup).payments.length,1);
  const auditIDs=db.auditList({limit:1000}).map(r=>r.sync_id);
  db.saveBill(bill('a',{total_bill_amount:1500}),'Ali');db.saveBill(bill('new',{supplier_bill_no:'INV-2'}),'Ali');
  const result=db.restoreBackup(backup,'Admin');assert.ok(result.safetyBackup);
  assert.equal(db.list().find(b=>b.sync_id==='a').remaining_balance,800);assert.equal(db.list().length,1);
  assert.ok(auditIDs.every(id=>db.auditList({limit:1000}).some(r=>r.sync_id===id)));
  assert.equal(JSON.parse(db.syncJob().payload).bills.find(b=>b.sync_id==='new').deleted_at!==null,true);
  assert.equal(db.auditList()[0].action,'RESTORE');
  const damaged=structuredClone(backup);damaged.data.bills[0].actual_amount=999;assert.throws(()=>db.restoreBackup(damaged,'Admin'),/checksum/);
  assert.throws(()=>db.downloadBackup('../outside.json'),/Invalid backup name/);
  for(let i=0;i<32;i++)db.createBackup('Admin');assert.equal(db.backupList().items.length,30);
  await db.init(dir);assert.equal(db.list()[0].paid_amount,200);
 }finally{cleanup(dir);}
});
test('restore cannot erase newer settlement history and backups never include account passwords',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zada-protected-test-'));
 try{
  await db.init(dir);db.saveBill(bill('a',{password:'never-export'}),'Ali');
  const backup=db.downloadBackup(db.createBackup('Admin').id);assert.ok(!JSON.stringify(backup).includes('never-export'));
  db.recordEvent({syncId:'r',kind:'RETURN',billSyncId:'a',eventDate:'2026-10-07',amount:100,remarks:'Damaged'},'Ali');
  assert.throws(()=>db.restoreBackup(backup,'Admin'),/settlement history/);
  assert.equal(db.list()[0].returned_amount,100);
  const latest=db.downloadBackup(db.createBackup('Admin').id);assert.doesNotThrow(()=>db.restoreBackup(latest,'Admin'));
 }finally{cleanup(dir);}
});


test('unreadable SQLite is preserved until an explicit restore recovers the original sync identity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zada-recovery-test-'));
 try{
  await db.init(dir);db.saveBill(bill('a'),'Ali');const saved=db.createBackup('Admin');const backup=db.downloadBackup(saved.id);
  const file=path.join(dir,'supplier-reconciliation.sqlite');fs.writeFileSync(file,'corrupted disposable database');
  await db.init(dir);assert.equal(db.backupList().recoveryRequired,true);assert.equal(db.syncStatus().recoveryRequired,true);
  db.automaticBackup();assert.equal(fs.readFileSync(file,'utf8'),'corrupted disposable database');
  assert.throws(()=>db.saveBill(bill('blocked'),'Ali'),/needs recovery/);
  const restored=db.restoreBackup(saved.id,'Admin');assert.ok(restored.safetyBackup.includes('damaged'));
  assert.equal(db.syncStatus().recoveryRequired,false);assert.equal(db.list()[0].supplier_bill_no,'INV-1');
  const snapshot=JSON.parse(db.syncJob().payload);assert.equal(snapshot.sourceId,backup.sync.sourceId);assert.ok(snapshot.version>backup.sync.version);
  assert.equal(fs.readFileSync(path.join(dir,restored.safetyBackup),'utf8'),'corrupted disposable database');
 }finally{cleanup(dir);}
});
