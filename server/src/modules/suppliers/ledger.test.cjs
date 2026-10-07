const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('./ledger.cjs');
const bill = (syncId = 'a', actualAmount = 10000, supplierName = 'Supplier A') => ({ syncId, actualAmount, supplierName, category: 'PAYABLE', postingDate: '2026-10-01', billDate: '2026-10-01' });
const payment = amount => ({ syncId: 'p1', billSyncId: 'a', amount, paymentDate: '2026-10-02' });
const event = (kind, amount, extra = {}) => ({ syncId: `${kind}-${amount}`, kind, billSyncId: 'a', targetBillSyncId: '', amount, eventDate: '2026-10-07', remarks: 'Damaged stock', ...extra });
test('unpaid full return closes payable without creating credit', () => {
  const b = ledger.decorate([bill()], [], [event('RETURN', 10000)])[0];
  assert.equal(b.remainingBalance, 0); assert.equal(b.pendingCredit, 0); assert.equal(b.paymentStatus, 'RETURNED'); assert.equal(b.lastReturnDate, '2026-10-07'); assert.equal(b.actualAmount, 10000);
});
test('paid full return preserves payments and leaves credit pending', () => {
  for (const amount of [4000, 10000]) {
    const b = ledger.decorate([bill()], [payment(amount)], [event('RETURN', 10000)])[0];
    assert.equal(b.remainingBalance, 0); assert.equal(b.pendingCredit, amount); assert.equal(b.paidAmount, amount); assert.equal(b.creditStatus, 'CREDIT_PENDING');
  }
});
test('partial return creates only excess-paid credit', () => {
  const b = ledger.decorate([bill()], [payment(8000)], [event('RETURN', 3000)])[0];
  assert.equal(b.netPayable, 7000); assert.equal(b.pendingCredit, 1000); assert.equal(b.returnStatus, 'PARTIALLY_RETURNED');
  const unpaid = ledger.decorate([bill()], [], [event('RETURN', 3000)])[0];
  assert.equal(unpaid.remainingBalance, 7000); assert.equal(unpaid.pendingCredit, 0);
});
test('split refund and next-bill adjustment settle credit without counting it as cash payment', () => {
  const bills = [bill(), bill('b', 7000)]; const payments = [payment(4000)];
  const events = [event('RETURN', 10000), event('REFUND', 1000)];
  const adjustment = event('ADJUSTMENT', 3000, { targetBillSyncId: 'b' });
  ledger.validateEvent(adjustment, bills, payments, events); events.push(adjustment);
  const [a, b] = ledger.decorate(bills, payments, events);
  assert.equal(a.pendingCredit, 0); assert.equal(a.creditStatus, 'SETTLED'); assert.equal(a.refundAmount, 1000);
  assert.equal(b.creditApplied, 3000); assert.equal(b.remainingBalance, 4000); assert.equal(b.paidAmount, 0); assert.equal(b.paymentStatus, 'PARTIAL');
  assert.throws(() => ledger.validateEvent(event('REFUND', 1), bills, payments, events), /available supplier credit/);
});
test('credit cannot be spent twice, across suppliers, or above target balance', () => {
  const bills = [bill(), bill('b', 500), bill('c', 7000, 'Supplier B')], payments = [payment(4000)], events = [event('RETURN', 10000)];
  assert.throws(() => ledger.validateEvent(event('ADJUSTMENT', 600, { targetBillSyncId: 'b' }), bills, payments, events), /target bill balance/);
  assert.throws(() => ledger.validateEvent(event('ADJUSTMENT', 10, { targetBillSyncId: 'c' }), bills, payments, events), /same supplier/);
  assert.throws(() => ledger.validateEvent(event('REFUND', 4001), bills, payments, events), /available supplier credit/);
});
test('return validation handles excess, invalid dates, backdating and missing reason', () => {
  assert.throws(() => ledger.validateEvent(event('RETURN', 10001), [bill()], [], []), /unreturned/);
  assert.throws(() => ledger.validateEvent(event('RETURN', 1, { eventDate: '2026-02-30' }), [bill()], [], []), /valid date/);
  assert.throws(() => ledger.validateEvent(event('RETURN', 1, { eventDate: '2026-10-01' }), [bill()], [payment(1)], []), /latest activity/);
  assert.throws(() => ledger.validateEvent(event('RETURN', 1, { remarks: '' }), [bill()], [], []), /return reason/);
  for (const amount of [0, -1, NaN, Infinity]) assert.throws(() => ledger.normalizeEvent(event('RETURN', amount)), /greater than zero/);
});
test('retries are idempotent and cannot change an existing financial entry', () => {
  const e = ledger.normalizeEvent(event('RETURN', 1000));
  assert.deepEqual(ledger.validateEvent(e, [bill()], [], [e]), e);
  assert.throws(() => ledger.validateEvent({ ...e, amount: 900 }, [bill()], [], [e]), /already used/);
  assert.throws(() => ledger.assertMutable('a', [e]), /preserved/);
});
test('payments after partial return use reduced payable and history cannot be edited', () => {
  const events = [event('RETURN', 3000)];
  const p = { syncId: 'p', billSyncId: 'a', paymentDate: '2026-10-07', amount: 7000 };
  assert.doesNotThrow(() => ledger.validatePayment(p, [bill()], [], events));
  assert.throws(() => ledger.validatePayment({ ...p, amount: 7001 }, [bill()], [], events), /remaining bill balance/);
  assert.throws(() => ledger.validatePayment(p, [bill()], [p], events), /preserved/);
});
test('adjusted target can itself be returned and retains the original credit provenance', () => {
  const events = [event('RETURN', 10000), event('ADJUSTMENT', 4000, { targetBillSyncId: 'b' }), event('RETURN', 7000, { syncId: 'return-b', billSyncId: 'b' })];
  const [a, b] = ledger.decorate([bill(), bill('b', 7000)], [payment(4000)], events);
  assert.equal(a.pendingCredit, 0); assert.equal(b.pendingCredit, 4000); assert.equal(b.remainingBalance, 0);
});
test('currency calculations stay exact at two decimals', () => {
  const b = ledger.decorate([bill('a', 0.3)], [payment(0.2)], [event('RETURN', 0.1)])[0];
  assert.equal(b.netPayable, 0.2); assert.equal(b.remainingBalance, 0); assert.equal(b.pendingCredit, 0);
});
