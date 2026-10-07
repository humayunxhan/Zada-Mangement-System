import mongoose from 'mongoose';
import { SupplierBill } from './supplier-bill.model.js';
import { SupplierPayment } from './supplier-payment.model.js';
import { SupplierLedger, SupplierSyncState } from './supplier-ledger.model.js';
import ledger from './ledger.cjs';

export async function locked(scope, work) {
  const key = JSON.stringify([scope.pharmacyId, scope.branchId]);
  try { await SupplierSyncState.updateOne({ key }, { $setOnInsert: { versions: {} } }, { upsert: true }); }
  catch (e) { if (e.code !== 11000) throw e; } // Another first request may have created the scope lock.
  return mongoose.connection.transaction(async session => {
    const lock = await SupplierSyncState.findOneAndUpdate({ key }, { $inc: { revision: 1 } }, { new: true, session }).lean();
    return work(session, lock);
  });
}
function fail(message) { const e = new Error(message); e.status = 400; throw e; }
export function normalizeSnapshot(input) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(input.sourceId || '') || !Number.isSafeInteger(input.version) || input.version < 1) fail('Invalid snapshot version/source.');
  if (![input.bills, input.payments, input.events].every(Array.isArray)) fail('Snapshot requires bills, payments and events.');
  const bills = input.bills.map(b => ({ syncId: String(b.sync_id || ''), postingDate: ledger.date(b.posting_date), billDate: ledger.date(b.bill_date), supplierName: String(b.supplier_name || ''), supplierBillNo: b.supplier_bill_no || '', voucherNo: b.voucher_no || '', totalBillAmount: Number(b.total_bill_amount), taxPercent: Number(b.tax_percent), taxAmount: Number(b.tax_amount), actualAmount: Number(b.actual_amount), category: b.category || 'PAYABLE', remarks: b.remarks || '', deletedAt: b.deleted_at ? new Date(b.deleted_at) : null }));
  const payments = input.payments.map(p => ({ syncId: String(p.sync_id || ''), billSyncId: String(p.bill_sync_id || ''), paymentDate: ledger.date(p.payment_date), amount: ledger.positive(p.amount), paymentMode: p.payment_mode || '', referenceNo: p.reference_no || '', remarks: p.remarks || '', deletedAt: p.deleted_at ? new Date(p.deleted_at) : null }));
  const events = input.events.map(e => ({ ...ledger.normalizeEvent(ledger.eventFromRow(e)), createdBy: String(e.created_by || 'sync'), ...(e.created_at ? { createdAt: new Date(e.created_at) } : {}) }));
  for (const records of [bills, payments, events]) {
    const ids = records.map(r => r.syncId);
    if (ids.some(id => !id || id.length > 64) || new Set(ids).size !== ids.length) fail('Snapshot contains missing or duplicate references.');
  }
  for (const b of bills) if (!b.supplierName.trim() || ![b.totalBillAmount, b.taxPercent, b.taxAmount, b.actualAmount].every(Number.isFinite) || b.actualAmount < 0) fail('Invalid bill amounts.');
  const live = bills.filter(b => !b.deletedAt), livePayments = payments.filter(p => !p.deletedAt);
  for (const p of livePayments) if (!live.some(b => b.syncId === p.billSyncId)) fail('Payment references a missing active bill.');
  for (const e of events) {
    const source = live.find(b => b.syncId === e.billSyncId);
    if (!source || source.category !== 'PAYABLE') fail('Return/settlement references a missing payable bill.');
    if (e.kind === 'RETURN' && !e.remarks) fail('Return reason is required.');
    if (e.kind === 'ADJUSTMENT') {
      const target = live.find(b => b.syncId === e.targetBillSyncId);
      if (!target || target.category !== 'PAYABLE' || target.syncId === source.syncId || target.supplierName.trim().toLowerCase() !== source.supplierName.trim().toLowerCase()) fail('Invalid supplier credit target.');
    }
  }
  const replay = [];
  for (const e of [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))) {
    ledger.validateEvent(e, live, livePayments.filter(p => p.paymentDate <= e.eventDate), replay);
    replay.push(e);
  }
  for (const b of ledger.decorate(live, livePayments, events)) {
    if (ledger.money(b.returnedAmount) > ledger.money(b.actualAmount) || ledger.money(b.refundAmount + b.creditUsed) > ledger.money(Math.max(0, b.paidAmount + b.creditApplied - (b.actualAmount - b.returnedAmount)))) fail('Snapshot overspends supplier credit or overreturns stock.');
  }
  return { bills, payments, events };
}
export async function applySnapshot(scope, input) {
  const s = normalizeSnapshot(input);
  return locked(scope, async (session, lock) => {
    if ((lock.versions?.[input.sourceId] || 0) >= input.version) return { version: input.version, duplicate: true };
    const ids = s.bills.map(b => b.syncId);
    const oldBills = await SupplierBill.find({ ...scope, syncId: { $in: ids } }).session(session).lean();
    const oldPayments = await SupplierPayment.find({ ...scope, $or: [{ billSyncId: { $in: ids } }, { syncId: { $in: s.payments.map(p => p.syncId) } }] }).session(session).lean();
    for (const r of [...oldBills, ...oldPayments]) if (r.syncSource && r.syncSource !== input.sourceId) fail('These records belong to another supplier database. Sync from the original database.');
    const oldEvents = await SupplierLedger.find({ ...scope, $or: [{ billSyncId: { $in: ids } }, { targetBillSyncId: { $in: ids } }] }).session(session).lean();
    for (const e of oldEvents) if (!s.events.some(x => x.syncId === e.syncId && ledger.sameEvent(e, x))) fail('Sync cannot remove or change return/settlement history.');
    const protectedIds = new Set(oldEvents.flatMap(e => [e.billSyncId, e.targetBillSyncId]).filter(Boolean));
    for (const old of oldBills.filter(b => protectedIds.has(b.syncId))) {
      const b = s.bills.find(x => x.syncId === old.syncId);
      if (b.deletedAt || ['supplierName', 'totalBillAmount', 'taxPercent', 'taxAmount', 'actualAmount', 'postingDate', 'billDate', 'category'].some(k => b[k] !== old[k])) fail('Sync cannot alter an original bill with settlement history.');
    }
    for (const old of oldPayments.filter(p => protectedIds.has(p.billSyncId) && !p.deletedAt)) {
      const p = s.payments.find(x => x.syncId === old.syncId);
      if (!p || p.deletedAt || ['billSyncId', 'paymentDate', 'amount', 'paymentMode', 'referenceNo', 'remarks'].some(k => String(p[k] || '') !== String(old[k] || ''))) fail('Sync cannot alter a historical payment after settlement.');
    }
    for (const [Model, records] of [[SupplierBill, s.bills], [SupplierPayment, s.payments], [SupplierLedger, s.events]]) {
      if (records.length) await Model.bulkWrite(records.map(r => ({ updateOne: { filter: { ...scope, syncId: r.syncId }, update: { $set: { ...r, ...scope, ...(Model !== SupplierLedger ? { syncSource: input.sourceId } : {}) } }, upsert: true } })), { session });
    }
    await SupplierSyncState.updateOne({ key: lock.key }, { $set: { [`versions.${input.sourceId}`]: input.version } }, { session });
    return { version: input.version };
  });
}
