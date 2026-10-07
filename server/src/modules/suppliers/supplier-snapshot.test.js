import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot } from './supplier-snapshot.service.js';
import { decorateBills, summarize, activityReport } from './supplier.service.js';
import { SupplierLedger } from './supplier-ledger.model.js';
import { SupplierBill } from './supplier-bill.model.js';
const snapshot = () => ({ sourceId: 'test-source', version: 1,
  bills: [
    { sync_id: 'a', posting_date: '2026-09-01', bill_date: '2026-09-01', supplier_name: 'A', total_bill_amount: 10000, actual_amount: 10000, tax_amount: 0, tax_percent: 0, category: 'PAYABLE' },
    { sync_id: 'b', posting_date: '2026-10-06', bill_date: '2026-10-06', supplier_name: 'A', total_bill_amount: 7000, actual_amount: 7000, tax_amount: 0, tax_percent: 0, category: 'PAYABLE' },
  ],
  payments: [{ sync_id: 'p', bill_sync_id: 'a', payment_date: '2026-09-02', amount: 4000 }],
  events: [
    { sync_id: 'r', kind: 'RETURN', bill_sync_id: 'a', event_date: '2026-10-07', amount: 10000, remarks: 'Return' },
    { sync_id: 'f', kind: 'REFUND', bill_sync_id: 'a', event_date: '2026-10-07', amount: 1000, payment_mode: 'ONLINE_TRANSFER' },
    { sync_id: 'c', kind: 'ADJUSTMENT', bill_sync_id: 'a', target_bill_sync_id: 'b', event_date: '2026-10-07', amount: 3000 },
  ],
});
test('normalized snapshots and CEO summaries use net payable, real cash payments and remaining credit', () => {
  const s = normalizeSnapshot(snapshot()); const items = decorateBills(s.bills, s.payments, s.events); const summary = summarize(items);
  assert.equal(summary.actualPayable, 7000); assert.equal(summary.totalPaid, 4000);
  assert.equal(summary.outstandingBalance, 4000); assert.equal(summary.pendingCredit, 0);
  assert.equal(summary.refundsReceived, 1000); assert.equal(summary.returnedAmount, 10000);
  const october = summarize(items.filter(b => b.postingDate >= '2026-10-01'));
  assert.equal(october.creditApplied, 3000); assert.equal(october.outstandingBalance, 4000); assert.equal(october.totalPaid, 0);
});
test('snapshot rejects orphaned history, changed supplier, overspent credit and duplicate entries', () => {
  let s = snapshot(); s.bills[0].deleted_at = '2026-10-08'; assert.throws(() => normalizeSnapshot(s), /missing active bill/);
  s = snapshot(); s.bills[1].supplier_name = 'Other'; assert.throws(() => normalizeSnapshot(s), /credit target/);
  s = snapshot(); s.events[2].amount = 4000; assert.throws(() => normalizeSnapshot(s), /available supplier credit/);
  s = snapshot(); s.events.push({ ...s.events[0] }); assert.throws(() => normalizeSnapshot(s), /duplicate references/);
});
test('snapshot replay rejects credit cycles with no funding and settlements before the return', () => {
  let s = snapshot(); s.events[1].event_date = '2026-10-06'; assert.throws(() => normalizeSnapshot(s), /available supplier credit/);
  s = snapshot(); s.payments = []; s.events = [
    { sync_id: 'ca', kind: 'ADJUSTMENT', bill_sync_id: 'a', target_bill_sync_id: 'b', event_date: '2026-10-07', amount: 1000 },
    { sync_id: 'cb', kind: 'ADJUSTMENT', bill_sync_id: 'b', target_bill_sync_id: 'a', event_date: '2026-10-07', amount: 1000 },
  ]; assert.throws(() => normalizeSnapshot(s), /available supplier credit/);
});
test('dated reports include returns of older bills and support an unfiltered activity request', async t => {
  const source = normalizeSnapshot(snapshot());
  let filter;
  t.mock.method(SupplierLedger, 'find', input => { filter = input; return { sort: () => ({ lean: async () => source.events }) }; });
  t.mock.method(SupplierBill, 'find', () => ({ lean: async () => source.bills }));
  const scope = { pharmacyId: 'test', branchId: 'main' };
  const report = await activityReport(scope, { from: '2026-10-07', to: '2026-10-07' });
  assert.deepEqual(filter, { ...scope, eventDate: { $gte: '2026-10-07', $lte: '2026-10-07' } });
  assert.equal(report.returnedInPeriod, 10000); assert.equal(report.refundedInPeriod, 1000);
  assert.equal(report.adjustedInPeriod, 3000); assert.equal(report.events[0].supplierName, 'A');
  await activityReport(scope); assert.deepEqual(filter, scope);
});


test('bill-to-bill settlements sync and contribute to CEO payable totals', () => {
  const input = snapshot(); input.bills.forEach(b => { b.category = 'BILL_TO_BILL'; });
  const s = normalizeSnapshot(input);
  const totals = summarize(decorateBills(s.bills, s.payments, s.events));
  assert.equal(totals.actualPayable, 7000); assert.equal(totals.outstandingBalance, 4000);
  assert.equal(totals.totalPaid, 4000); assert.equal(totals.pendingCredit, 0);
});


test('restored full snapshots hide newer owned records and protect history outside incoming IDs', async t => {
  const mongoose = (await import('mongoose')).default;
  const { applySnapshot } = await import('./supplier-snapshot.service.js');
  const { SupplierPayment } = await import('./supplier-payment.model.js');
  const { SupplierSyncState } = await import('./supplier-ledger.model.js');
  t.mock.method(mongoose.connection,'transaction',async fn=>fn({}));
  t.mock.method(SupplierSyncState,'updateOne',async()=>({}));
  t.mock.method(SupplierSyncState,'findOneAndUpdate',()=>({lean:async()=>({key:'test',versions:{}})}));
  let oldEvents=[],eventQuery,removedBills,removedPayments;
  const old=normalizeSnapshot(snapshot()).bills[0];
  t.mock.method(SupplierBill,'find',()=>({session:()=>({lean:async()=>[{...old,syncId:'newer',syncSource:'test-source'}]})}));
  t.mock.method(SupplierPayment,'find',()=>({session:()=>({lean:async()=>[]})}));
  t.mock.method(SupplierLedger,'find',query=>{eventQuery=query;return{session:()=>({lean:async()=>oldEvents})}});
  for(const Model of [SupplierBill,SupplierPayment,SupplierLedger])t.mock.method(Model,'bulkWrite',async()=>({}));
  t.mock.method(SupplierBill,'updateMany',async filter=>{removedBills=filter;return{}});
  t.mock.method(SupplierPayment,'updateMany',async filter=>{removedPayments=filter;return{}});
  const s=snapshot();s.events=[];s.payments=[];
  await applySnapshot({pharmacyId:'test',branchId:'main'},s);
  assert.deepEqual(removedBills.syncId.$nin,['a','b']);assert.equal(removedBills.syncSource,'test-source');assert.deepEqual(removedPayments.syncId.$nin,[]);
  assert.ok(eventQuery.$or[0].billSyncId.$in.includes('newer'));
  oldEvents=[{syncId:'protected-return',kind:'RETURN',billSyncId:'newer',eventDate:'2026-10-07',amount:100,remarks:'Return'}];
  await assert.rejects(()=>applySnapshot({pharmacyId:'test',branchId:'main'},s),/cannot remove or change/);
});
