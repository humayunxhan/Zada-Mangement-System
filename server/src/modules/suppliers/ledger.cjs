// Shared accounting rules for Mongo, MySQL and the offline desktop database.
const money = n => Math.round((Number(n) || 0) * 100) / 100;
const cents = n => Math.round(Number(n) * 100);
function fail(message) { const e = new Error(message); e.status = 400; throw e; }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Enter a valid date (YYYY-MM-DD).');
  return value;
}
function positive(value) {
  if (!Number.isFinite(Number(value)) || !Number.isSafeInteger(cents(value)) || cents(value) <= 0) fail('Amount must be greater than zero and within the supported currency range.');
  return money(value);
}
const isPayable = bill => ['PAYABLE', 'BILL_TO_BILL', 'SALE_BASED'].includes(bill?.category);
function decorate(bills, payments, events = []) {
  return bills.map(b => {
    const linked = payments.filter(p => p.billSyncId === b.syncId);
    const history = events.filter(e => e.billSyncId === b.syncId || e.targetBillSyncId === b.syncId).sort((a, c) => a.eventDate.localeCompare(c.eventDate) || String(a.createdAt || '').localeCompare(String(c.createdAt || '')));
    const sum = predicate => events.filter(predicate).reduce((n, e) => n + cents(e.amount), 0);
    const paid = linked.reduce((n, p) => n + cents(p.amount), 0);
    const returned = sum(e => e.kind === 'RETURN' && e.billSyncId === b.syncId);
    const refunded = sum(e => e.kind === 'REFUND' && e.billSyncId === b.syncId);
    const used = sum(e => e.kind === 'ADJUSTMENT' && e.billSyncId === b.syncId);
    const received = sum(e => e.kind === 'ADJUSTMENT' && e.targetBillSyncId === b.syncId);
    const net = Math.max(0, cents(b.actualAmount) - returned);
    const excluded = !isPayable(b);
    const effective = paid + received - refunded - used;
    const remaining = excluded ? 0 : Math.max(0, net - effective);
    const credit = excluded ? 0 : Math.max(0, effective - net);
    const returnStatus = returned > 0 ? (net === 0 ? 'RETURNED' : 'PARTIALLY_RETURNED') : 'NONE';
    const paymentStatus = excluded ? b.category : net === 0 && returned > 0 ? 'RETURNED' : remaining === 0 ? (credit > 0 ? 'OVERPAID' : 'COMPLETE') : effective > 0 ? 'PARTIAL' : 'UNPAID';
    return { ...b, payments: linked, ledgerEvents: history, paidAmount: paid / 100, returnedAmount: returned / 100, netPayable: excluded ? 0 : net / 100, refundAmount: refunded / 100, creditUsed: used / 100, creditApplied: received / 100, remainingBalance: remaining / 100, pendingCredit: credit / 100, paymentStatus, returnStatus, creditStatus: credit > 0 ? 'CREDIT_PENDING' : returned > 0 && (refunded + used) > 0 ? 'SETTLED' : 'NONE', lastReturnDate: history.filter(e => e.kind === 'RETURN' && e.billSyncId === b.syncId).at(-1)?.eventDate || null };
  });
}
function normalizeEvent(input) {
  if (!['RETURN', 'REFUND', 'ADJUSTMENT'].includes(input.kind)) fail('Invalid return/settlement type.');
  return { syncId: String(input.syncId || ''), kind: input.kind, billSyncId: String(input.billSyncId || ''), targetBillSyncId: input.kind === 'ADJUSTMENT' ? String(input.targetBillSyncId || '') : '', eventDate: date(input.eventDate), amount: positive(input.amount), referenceNo: String(input.referenceNo || '').trim(), remarks: String(input.remarks || '').trim(), paymentMode: input.kind === 'REFUND' ? String(input.paymentMode || 'COUNTER_CASH') : '' };
}
function sameEvent(a, b) { return Object.keys(normalizeEvent(b)).every(k => normalizeEvent(a)[k] === normalizeEvent(b)[k]); }
function validateEvent(event, bills, payments, events) {
  const e = normalizeEvent(event);
  const existing = events.find(x => x.syncId === e.syncId);
  if (existing) { if (!sameEvent(existing, e)) fail('This reference was already used for a different transaction.'); return e; }
  const decorated = decorate(bills, payments, events);
  const source = decorated.find(b => b.syncId === e.billSyncId);
  if (!source || !isPayable(source)) fail('Select an active payable bill.');
  const chronological = bill => {
    const latest = [bill.postingDate, bill.billDate, ...bill.payments.map(p => p.paymentDate), ...bill.ledgerEvents.map(x => x.eventDate)].filter(Boolean).sort().at(-1);
    if (latest && e.eventDate < latest) fail(`Date must be on or after ${latest}, the latest activity for this bill.`);
  };
  chronological(source);
  if (e.kind === 'RETURN') {
    if (!e.remarks) fail('Enter a return reason.');
    if (cents(e.amount) > cents(source.actualAmount) - cents(source.returnedAmount)) fail('Return exceeds the unreturned net bill amount.');
  } else {
    if (cents(e.amount) > cents(source.pendingCredit)) fail('Amount exceeds available supplier credit.');
    if (e.kind === 'ADJUSTMENT') {
      const target = decorated.find(b => b.syncId === e.targetBillSyncId);
      if (!target || target.syncId === source.syncId || !isPayable(target) || target.supplierName.trim().toLowerCase() !== source.supplierName.trim().toLowerCase()) fail('Choose another payable bill from the same supplier.');
      chronological(target);
      if (cents(e.amount) > cents(target.remainingBalance)) fail('Adjustment exceeds the target bill balance.');
    }
  }
  return e;
}
function assertMutable(id, events) {
  if (events.some(e => e.billSyncId === id || e.targetBillSyncId === id)) fail('This bill has return/settlement history. Its original bill and payments are preserved.');
}
function validatePayment(input, bills, payments, events) {
  date(input.paymentDate); positive(input.amount);
  const old = payments.find(p => p.syncId === input.syncId);
  if (old) { assertMutable(old.billSyncId, events); assertMutable(input.billSyncId, events); }
  const bill = decorate(bills, payments.filter(p => p.syncId !== input.syncId), events).find(b => b.syncId === input.billSyncId);
  if (!bill || !isPayable(bill)) fail('Select an active payable bill.');
  const latest = [bill.postingDate, bill.billDate, ...bill.ledgerEvents.map(e => e.eventDate)].filter(Boolean).sort().at(-1);
  if (latest && input.paymentDate < latest) fail(`Payment date must be on or after ${latest}.`);
  if (cents(input.amount) > cents(bill.remainingBalance)) fail('Payment exceeds the remaining bill balance.');
}
const billFromRow = b => ({ ...b, syncId: b.sync_id, supplierName: b.supplier_name, actualAmount: Number(b.actual_amount), postingDate: b.posting_date, billDate: b.bill_date });
const paymentFromRow = p => ({ ...p, syncId: p.sync_id, billSyncId: p.bill_sync_id, paymentDate: p.payment_date, amount: Number(p.amount) });
const eventFromRow = e => ({ syncId: e.sync_id, kind: e.kind, billSyncId: e.bill_sync_id, targetBillSyncId: e.target_bill_sync_id || '', eventDate: e.event_date, amount: Number(e.amount), paymentMode: e.payment_mode || '', referenceNo: e.reference_no || '', remarks: e.remarks || '', createdAt: e.created_at, createdBy: e.created_by });
function decorateRows(bills, payments, events) {
  return decorate(bills.map(billFromRow), payments.map(paymentFromRow), events.map(eventFromRow)).map(b => ({ ...b, payments: payments.filter(p => p.bill_sync_id === b.syncId).map(p => ({ ...p, amount: Number(p.amount) })), paid_amount: b.paidAmount, returned_amount: b.returnedAmount, net_payable: b.netPayable, refund_amount: b.refundAmount, credit_used: b.creditUsed, credit_applied: b.creditApplied, remaining_balance: b.remainingBalance, pending_credit: b.pendingCredit, payment_status: b.paymentStatus, return_status: b.returnStatus, credit_status: b.creditStatus, last_return_date: b.lastReturnDate }));
}
module.exports = { isPayable, money, date, positive, decorate, normalizeEvent, validateEvent, sameEvent, assertMutable, validatePayment, billFromRow, paymentFromRow, eventFromRow, decorateRows };
