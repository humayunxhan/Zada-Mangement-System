const test=require('node:test'); const assert=require('node:assert/strict');
test('MySQL financial mutation audit and sync snapshot commit together; audit failure rolls back',async t=>{
 const {getPool}=await import('./db.js');const {transaction}=await import('./ledger-store.js');
 let state={bills:[],payments:[],events:[]},saved,version=1,committed=0,rolledBack=0,audits=[],outbox=[],failAudit=false;
 const conn={beginTransaction:async()=>{saved=structuredClone({state,version,audits,outbox});},commit:async()=>{committed++;},rollback:async()=>{({state,version,audits,outbox}=saved);rolledBack++;},release:()=>{},query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT * FROM bills'))return [structuredClone(state.bills)];
  if(sql.startsWith('SELECT * FROM payments'))return [structuredClone(state.payments)];
  if(sql.startsWith('SELECT * FROM supplier_ledger_events'))return [structuredClone(state.events)];
  if(sql.startsWith('SELECT * FROM supplier_sync_state'))return [[{source_id:'test-source',version}]];
  if(sql.startsWith('SELECT id FROM supplier_sync_state'))return [[{id:1}]];
  if(sql.startsWith('UPDATE supplier_sync_state')){version++;return []}
  if(sql.startsWith('INSERT INTO supplier_audit_log')){if(failAudit)throw new Error('audit unavailable');audits.push(args);return []}
  if(sql.startsWith('DELETE FROM supplier_sync_outbox')){outbox=[];return []}
  if(sql.startsWith('INSERT INTO supplier_sync_outbox')){outbox.push(JSON.parse(args[0]));return []}
  throw new Error('Unexpected SQL: '+sql);
 }};
 t.mock.method(getPool(),'getConnection',async()=>conn);
 const b={sync_id:'a',posting_date:'2026-10-01',bill_date:'2026-10-01',supplier_name:'A',supplier_bill_no:'1',total_bill_amount:1000,tax_percent:0,tax_amount:0,actual_amount:1000,category:'PAYABLE'};
 await transaction(async()=>{state.bills.push(b);return b},'Ali');
 assert.equal(committed,1);assert.equal(audits[0][1],'Ali');assert.equal(audits[0][2],'CREATE');assert.equal(outbox[0].bills.length,1);
 await transaction(async()=>null,'Ali');assert.equal(audits.length,1); // No change creates no audit entry.
 failAudit=true;await assert.rejects(()=>transaction(async()=>{state.bills[0].total_bill_amount=1200;return state.bills[0]},'Bilal'),/audit unavailable/);
 assert.equal(rolledBack,1);assert.equal(state.bills[0].total_bill_amount,1000);
});
test('backup and audit routes reject unauthenticated and operator access before reading data',async t=>{
 const express=(await import('express')).default;const routes=(await import('./management.js')).default;const {generateToken}=await import('./middleware/auth.js');
 const app=express();app.use(express.json());app.use('/api/records',routes);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/records`;
  assert.equal((await fetch(url+'/backups')).status,401);
  const token=generateToken({id:2,username:'operator',role:'operator'}),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(url+'/backups',{headers})).status,403);
  assert.equal((await fetch(url+'/audit',{headers})).status,403);
  assert.equal((await fetch(url+'/restore',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await fetch(url+'/export',{method:'POST',headers,body:JSON.stringify({dataset:'audit'})})).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
