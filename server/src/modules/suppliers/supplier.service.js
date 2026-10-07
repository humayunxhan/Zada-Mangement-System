import { SupplierBill } from './supplier-bill.model.js';
import { SupplierPayment } from './supplier-payment.model.js';
import { SupplierLedger } from './supplier-ledger.model.js';
import ledger from './ledger.cjs';

export const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
export function billAmounts(input) {
  const total = money(input.totalBillAmount);
  const taxPercent = Number(input.taxPercent) || 0;
  const taxAmount = money(total * taxPercent / 100);
  return { totalBillAmount: total, taxPercent, taxAmount, actualAmount: money(total - taxAmount) };
}
export const decorateBills = ledger.decorate;
export async function queryReport(scope, query = {}) {
  const dateField = query.dateType === 'bill' ? 'billDate' : 'postingDate';
  const filter = { ...scope, deletedAt: null };
  if (query.from || query.to) filter[dateField] = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (query.supplier) filter.supplierName = query.supplier;
  const bills = await SupplierBill.find(filter).sort({ [dateField]: -1, createdAt: -1 }).lean();
  const payments = await SupplierPayment.find({ ...scope, deletedAt: null, billSyncId: { $in: bills.map((b) => b.syncId) } }).lean();
  const events = await SupplierLedger.find(scope).lean();
  return decorateBills(bills, payments, events);
}
export function summarize(items) {
  return items.reduce((s, b) => ({
    totalBills: s.totalBills + 1, grossAmount: money(s.grossAmount + b.totalBillAmount), taxDeduction: money(s.taxDeduction + b.taxAmount),
    actualPayable: money(s.actualPayable + b.netPayable), totalPaid: money(s.totalPaid + b.paidAmount),
    returnedAmount: money(s.returnedAmount + b.returnedAmount), pendingCredit: money(s.pendingCredit + b.pendingCredit), refundsReceived: money(s.refundsReceived + b.refundAmount), creditApplied: money(s.creditApplied + b.creditApplied),
    outstandingBalance: money(s.outstandingBalance + b.remainingBalance), pendingBills: s.pendingBills + (['UNPAID', 'PARTIAL'].includes(b.paymentStatus) ? 1 : 0),
    overdueBills: s.overdueBills + (b.remainingBalance > 0 && b.billDate < new Date().toISOString().slice(0, 10) ? 1 : 0),
  }), { totalBills: 0, grossAmount: 0, taxDeduction: 0, actualPayable: 0, totalPaid: 0, outstandingBalance: 0, pendingBills: 0, overdueBills: 0, returnedAmount: 0, pendingCredit: 0, refundsReceived: 0, creditApplied: 0 });
}

export async function activityReport(scope, query = {}) {
  const filter = { ...scope };
  if (query.from || query.to) filter.eventDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  const events = await SupplierLedger.find(filter).sort({ eventDate: -1, createdAt: -1 }).lean();
  const bills = await SupplierBill.find({ ...scope, syncId: { $in: [...new Set(events.flatMap(e => [e.billSyncId, e.targetBillSyncId]).filter(Boolean))] } }).lean();
  const selected = events.filter(e => !query.supplier || bills.some(b => b.syncId === e.billSyncId && b.supplierName === query.supplier));
  return { events: selected.map(e => ({ ...e, supplierName: bills.find(b => b.syncId === e.billSyncId)?.supplierName, supplierBillNo: bills.find(b => b.syncId === e.billSyncId)?.supplierBillNo, targetBillNo: bills.find(b => b.syncId === e.targetBillSyncId)?.supplierBillNo })), returnedInPeriod: money(selected.filter(e => e.kind === 'RETURN').reduce((n, e) => n + e.amount, 0)), refundedInPeriod: money(selected.filter(e => e.kind === 'REFUND').reduce((n, e) => n + e.amount, 0)), adjustedInPeriod: money(selected.filter(e => e.kind === 'ADJUSTMENT').reduce((n, e) => n + e.amount, 0)) };
}
