const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const db = require('./db.cjs');
const cleanup = require('./test-cleanup.cjs');
test('offline return, refund and adjustment persist atomically with the local recovery snapshot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zada-returns-test-'));
  try {
    await db.init(dir);
    const bill = (id, amount, supplier = 'Supplier A') => ({ sync_id: id, posting_date: '2026-10-01', bill_date: '2026-10-01', supplier_name: supplier, supplier_bill_no: id, total_bill_amount: amount, tax_percent: 0, category: 'PAYABLE' });
    db.saveBill(bill('a', 10000)); db.saveBill({ ...bill('b', 7000), posting_date: '2026-10-06', bill_date: '2026-10-06' }); db.saveBill(bill('c', 3000, 'Supplier B'));
    db.addPayment({ sync_id: 'p', bill_sync_id: 'a', payment_date: '2026-10-02', amount: 4000 });
    const event = (syncId, kind, amount, extra = {}) => ({ syncId, kind, billSyncId: 'a', eventDate: '2026-10-07', amount, remarks: 'Returned damaged stock', ...extra });
    db.recordEvent(event('r', 'RETURN', 10000));
    assert.equal(db.list().find(b => b.sync_id === 'a').pending_credit, 4000);
    assert.throws(() => db.recordEvent(event('cross', 'ADJUSTMENT', 100, { targetBillSyncId: 'c' })), /same supplier/);
    assert.throws(() => db.recordEvent(event('too-much', 'REFUND', 4001)), /available supplier credit/);
    db.recordEvent(event('refund', 'REFUND', 1000, { paymentMode: 'ONLINE_TRANSFER', referenceNo: 'BANK-001' }));
    db.recordEvent(event('adjust', 'ADJUSTMENT', 3000, { targetBillSyncId: 'b' }));
    db.recordEvent(event('adjust', 'ADJUSTMENT', 3000, { targetBillSyncId: 'b' })); // retry
    assert.throws(() => db.deletePayment('p'), /preserved/);
    assert.throws(() => db.saveBill(bill('a', 9000)), /preserved/);
    assert.throws(() => db.deleteBill('b'), /preserved/);
    let items = db.list();
    assert.equal(items.find(b => b.sync_id === 'a').pending_credit, 0);
    assert.equal(items.find(b => b.sync_id === 'b').remaining_balance, 4000);
    // An old source bill still supplies credit/adjustments to a target in another date range.
    const currentBills = db.list({ from: '2026-10-06', to: '2026-10-07' });
    assert.equal(currentBills.length, 1);
    assert.equal(currentBills[0].credit_applied, 3000);
    const snapshot = JSON.parse(db.syncJob().payload);
    assert.equal(snapshot.events.length, 3); assert.equal(snapshot.payments.length, 1); assert.equal(db.syncStatus().pending, 1);
    const { normalizeSnapshot } = require('../shared/snapshot-validation.cjs');
    assert.doesNotThrow(() => normalizeSnapshot(snapshot));
    db.addPayment({ sync_id: 'pb', bill_sync_id: 'b', payment_date: '2026-10-08', amount: 4000 });
    assert.doesNotThrow(() => normalizeSnapshot(JSON.parse(db.syncJob().payload)));
    await db.init(dir);
    items = db.list();
    assert.equal(items.find(b => b.sync_id === 'b').remaining_balance, 0);
    assert.equal(items.find(b => b.sync_id === 'a').payments[0].amount, 4000);
    assert.equal(items.find(b => b.sync_id === 'a').last_return_date, '2026-10-07');
    db.completeSync(db.syncJob().id); assert.equal(db.syncStatus().pending, 0);
  } finally {
    // This is a test-created directory; remove only its known database and directory.
    cleanup(dir);
  }
});


test('offline bill-to-bill payments persist and sync without automatically settling the next bill', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zada-bill-payment-test-'));
  try {
    await db.init(dir);
    const bill = (id, date, amount) => ({ sync_id: id, posting_date: date, bill_date: date, supplier_name: 'Supplier A', total_bill_amount: amount, tax_percent: 0, category: 'BILL_TO_BILL' });
    db.saveBill(bill('old', '2026-10-01', 10000));
    db.saveBill(bill('next', '2026-10-07', 7000));
    assert.equal(db.list().find(b => b.sync_id === 'old').remaining_balance, 10000);
    const p = { sync_id: 'partial', bill_sync_id: 'old', payment_date: '2026-10-07', amount: 4000, payment_mode: 'CHEQUE', reference_no: 'CHQ-1' };
    db.addPayment(p); db.addPayment(p); // A retry must not duplicate the payment.
    assert.equal(db.list().find(b => b.sync_id === 'old').remaining_balance, 6000);
    db.addPayment({ ...p, sync_id: 'final', amount: 6000 });
    const { normalizeSnapshot } = require('../shared/snapshot-validation.cjs');
    assert.doesNotThrow(() => normalizeSnapshot(JSON.parse(db.syncJob().payload)));
    await db.init(dir);
    const old = db.list().find(b => b.sync_id === 'old');
    assert.equal(old.payment_status, 'COMPLETE'); assert.equal(old.paid_amount, 10000);
    assert.equal(old.payments.length, 2); assert.equal(old.payments[0].payment_date, '2026-10-07');
    assert.equal(db.list().find(b => b.sync_id === 'next').remaining_balance, 7000);
  } finally {
    cleanup(dir);
  }
});
