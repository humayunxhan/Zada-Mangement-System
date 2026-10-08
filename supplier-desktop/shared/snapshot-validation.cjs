const ledger = require('./ledger.cjs');

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalizeSnapshot(input) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(input.sourceId || '') || !Number.isSafeInteger(input.version) || input.version < 1) {
    fail('Invalid snapshot version/source.');
  }
  if (![input.bills, input.payments, input.events].every(Array.isArray)) {
    fail('Snapshot requires bills, payments and events.');
  }

  const bills = input.bills.map((bill) => ({
    syncId: String(bill.sync_id || ''),
    postingDate: ledger.date(bill.posting_date),
    billDate: ledger.date(bill.bill_date),
    supplierName: String(bill.supplier_name || ''),
    supplierBillNo: bill.supplier_bill_no || '',
    voucherNo: bill.voucher_no || '',
    totalBillAmount: Number(bill.total_bill_amount),
    taxPercent: Number(bill.tax_percent),
    taxAmount: Number(bill.tax_amount),
    actualAmount: Number(bill.actual_amount),
    category: bill.category || 'PAYABLE',
    remarks: bill.remarks || '',
    deletedAt: bill.deleted_at ? new Date(bill.deleted_at) : null,
  }));
  const payments = input.payments.map((payment) => ({
    syncId: String(payment.sync_id || ''),
    billSyncId: String(payment.bill_sync_id || ''),
    paymentDate: ledger.date(payment.payment_date),
    amount: ledger.positive(payment.amount),
    paymentMode: payment.payment_mode || '',
    referenceNo: payment.reference_no || '',
    remarks: payment.remarks || '',
    deletedAt: payment.deleted_at ? new Date(payment.deleted_at) : null,
  }));
  const events = input.events.map((event) => ({
    ...ledger.normalizeEvent(ledger.eventFromRow(event)),
    createdBy: String(event.created_by || 'local'),
    ...(event.created_at ? { createdAt: new Date(event.created_at) } : {}),
  }));

  for (const records of [bills, payments, events]) {
    const ids = records.map((record) => record.syncId);
    if (ids.some((id) => !id || id.length > 64) || new Set(ids).size !== ids.length) {
      fail('Snapshot contains missing or duplicate references.');
    }
  }
  for (const bill of bills) {
    if (!bill.supplierName.trim() || ![bill.totalBillAmount, bill.taxPercent, bill.taxAmount, bill.actualAmount].every(Number.isFinite) || bill.actualAmount < 0) {
      fail('Invalid bill amounts.');
    }
  }

  const liveBills = bills.filter((bill) => !bill.deletedAt);
  const livePayments = payments.filter((payment) => !payment.deletedAt);
  for (const payment of livePayments) {
    if (!liveBills.some((bill) => bill.syncId === payment.billSyncId)) fail('Payment references a missing active bill.');
  }
  for (const event of events) {
    const source = liveBills.find((bill) => bill.syncId === event.billSyncId);
    if (!source || !ledger.isPayable(source)) fail('Return/settlement references a missing payable bill.');
    if (event.kind === 'RETURN' && !event.remarks) fail('Return reason is required.');
    if (event.kind === 'ADJUSTMENT') {
      const target = liveBills.find((bill) => bill.syncId === event.targetBillSyncId);
      if (!target || !ledger.isPayable(target) || target.syncId === source.syncId || target.supplierName.trim().toLowerCase() !== source.supplierName.trim().toLowerCase()) {
        fail('Invalid supplier credit target.');
      }
    }
  }

  const replay = [];
  for (const event of [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))) {
    ledger.validateEvent(event, liveBills, livePayments.filter((payment) => payment.paymentDate <= event.eventDate), replay);
    replay.push(event);
  }
  for (const bill of ledger.decorate(liveBills, livePayments, events)) {
    const availableCredit = Math.max(0, bill.paidAmount + bill.creditApplied - (bill.actualAmount - bill.returnedAmount));
    if (ledger.money(bill.returnedAmount) > ledger.money(bill.actualAmount) || ledger.money(bill.refundAmount + bill.creditUsed) > ledger.money(availableCredit)) {
      fail('Snapshot overspends supplier credit or overreturns stock.');
    }
  }

  return { bills, payments, events };
}

module.exports = { normalizeSnapshot };
