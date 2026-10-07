const crypto = require('crypto');
const ledger = require('../electron/ledger.cjs');
const fields = {
  audit: ['sync_id','actor','action','entity','record_id','before_json','after_json','details_json','created_at'],
  bills: ['sync_id','posting_date','bill_date','supplier_name','supplier_bill_no','voucher_no','total_bill_amount','tax_percent','tax_amount','actual_amount','category','remarks','deleted_at','created_at','created_by'],
  payments: ['sync_id','bill_sync_id','payment_date','amount','payment_mode','reference_no','remarks','deleted_at','created_at','created_by'],
  events: ['sync_id','kind','bill_sync_id','target_bill_sync_id','event_date','amount','payment_mode','reference_no','remarks','created_by','created_at'],
};
function fail(message) { const e = new Error(message); e.status = 400; throw e; }
const clean = (table, row) => Object.fromEntries(fields[table].map(key => [key, row[key] ?? null]));
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
function duplicates(input, bills) {
  if (!normalize(input.supplier_bill_no)) return [];
  return bills.filter(b => !b.deleted_at && b.sync_id !== input.sync_id && normalize(b.supplier_name) === normalize(input.supplier_name) && normalize(b.supplier_bill_no) === normalize(input.supplier_bill_no));
}
function checkDuplicate(input, bills) {
  const found = duplicates(input, bills);
  const acknowledged = Array.isArray(input.duplicate_acknowledged) ? input.duplicate_acknowledged : [];
  if (found.some(b => !acknowledged.includes(b.sync_id))) fail('Duplicate invoice found for this supplier. Review the warning and confirm Save anyway if this is intentional.');
  return found.map(b => b.sync_id);
}
function encodeBackup(state) {
  const data = Object.fromEntries(Object.keys(fields).map(table => [table, (state[table] || []).map(row => clean(table, row))]));
  const sync = state.sync || null;
  return { format: 'zada-supplier-backup', version: 1, createdAt: new Date().toISOString(), sync, checksum: crypto.createHash('sha256').update(JSON.stringify({data,sync})).digest('hex'), data };
}
function decodeBackup(input) {
  if (!input || input.format !== 'zada-supplier-backup' || input.version !== 1 || !input.data) fail('This is not a supported Zada supplier backup.');
  if (crypto.createHash('sha256').update(JSON.stringify({data:input.data,sync:input.sync||null})).digest('hex') !== input.checksum) fail('Backup checksum does not match. The file may be damaged or changed.');
  if (!Number.isFinite(Date.parse(input.createdAt))) fail('Backup timestamp is invalid.');
  if (input.sync && (!/^[a-zA-Z0-9-]{1,64}$/.test(input.sync.sourceId) || !Number.isSafeInteger(input.sync.version) || input.sync.version < 0)) fail('Backup sync identity is invalid.');
  const data = {};
  for (const table of Object.keys(fields)) {
    if (!Array.isArray(input.data[table]) || input.data[table].length > 200000) fail('Invalid backup records.');
    data[table] = input.data[table].map(row => {
      if (!row || typeof row !== 'object' || !String(row.sync_id || '').trim() || String(row.sync_id).length > 64) fail('Backup contains an invalid record ID.');
      const record = clean(table, row);
      for (const key of ['created_at','deleted_at']) if (record[key] && !Number.isFinite(Date.parse(record[key]))) fail('Backup contains an invalid timestamp.');
      return record;
    });
    if (new Set(data[table].map(r => r.sync_id)).size !== data[table].length) fail('Backup contains duplicate record IDs.');
  }
  for (const b of data.bills) {
    ledger.date(b.posting_date); ledger.date(b.bill_date);
    if (!String(b.supplier_name || '').trim() || !['PAYABLE','BILL_TO_BILL','SALE_BASED','DISPUTED'].includes(b.category)) fail('Backup contains an invalid supplier bill.');
    for (const key of ['total_bill_amount','tax_percent','tax_amount','actual_amount']) if (!Number.isFinite(Number(b[key])) || Number(b[key]) < 0) fail('Backup contains invalid bill amounts.');
    if (Number(b.total_bill_amount) <= 0 || Number(b.tax_percent) > 100 || ledger.money(Number(b.total_bill_amount) * Number(b.tax_percent) / 100) !== Number(b.tax_amount) || ledger.money(Number(b.total_bill_amount) - Number(b.tax_amount)) !== Number(b.actual_amount)) fail('Backup bill totals do not match.');
  }
  const bills = data.bills.filter(b => !b.deleted_at).map(ledger.billFromRow);
  const payments = data.payments.filter(p => !p.deleted_at).map(ledger.paymentFromRow);
  for (const p of data.payments) { ledger.date(p.payment_date); ledger.positive(p.amount); }
  for (const p of payments) if (!bills.some(b => b.syncId === p.billSyncId)) fail('Backup has a payment without an active bill.');
  const events = data.events.map(ledger.eventFromRow), replay = [];
  for (const e of events) ledger.date(e.eventDate);
  for (const e of [...events].sort((a,b) => a.eventDate.localeCompare(b.eventDate))) {
    ledger.validateEvent(e, bills, payments.filter(p => p.paymentDate <= e.eventDate), replay); replay.push(e);
  }
  return data;
}
function protectHistory(current, restored) {
  const events = restored.events.map(ledger.eventFromRow);
  for (const old of current.events) {
    const original = ledger.eventFromRow(old), target = events.find(e => e.syncId === original.syncId);
    if (!target || !ledger.sameEvent(original, target)) fail('This backup would remove or change settlement history. Choose a newer backup.');
    for (const id of [old.bill_sync_id, old.target_bill_sync_id].filter(Boolean)) {
      const before = current.bills.find(b => b.sync_id === id), after = restored.bills.find(b => b.sync_id === id);
      if (!after || after.deleted_at || fields.bills.filter(k => !['created_by','created_at','remarks'].includes(k)).some(k => String(before?.[k] ?? '') !== String(after[k] ?? ''))) fail('This backup would alter a bill with settlement history.');
      for (const p of current.payments.filter(p => p.bill_sync_id === id && !p.deleted_at)) {
        const next = restored.payments.find(x => x.sync_id === p.sync_id && !x.deleted_at);
        if (!next || fields.payments.filter(k => !['created_by','created_at'].includes(k)).some(k => String(p[k] ?? '') !== String(next[k] ?? ''))) fail('This backup would alter protected payment history.');
      }
    }
  }
}
function restoreData(current, input) {
  if (input.sync && current.sync && input.sync.sourceId !== current.sync.sourceId && (current.bills.length || current.payments.length || current.events.length)) fail('This backup belongs to another supplier database. Restore it into an empty database.');
  const data = decodeBackup(input); protectHistory(current,data);
  // Keep tombstones in the outgoing snapshot so CEO reports also remove records
  // which were created after the selected restore point.
  for (const table of ['bills','payments']) for (const row of current[table]) {
    if (!data[table].some(r => r.sync_id === row.sync_id)) data[table].push(clean(table,{ ...row, deleted_at: row.deleted_at || new Date().toISOString() }));
  }
  return data;
}
function auditRange({from='',to=''} = {}) {
  if (from) ledger.date(from); if (to) ledger.date(to);
  return { from: from ? new Date(from+'T00:00:00+05:00').toISOString() : '', to: to ? new Date(to+'T23:59:59.999+05:00').toISOString() : '' };
}
function exportData(s, input = {}) {
  const ids = new Set(input.ids || []);
  const bills = s.bills.filter(b => !b.deleted_at && ids.has(b.sync_id));
  const selected = new Set(bills.map(b => b.sync_id));
  const withSupplier = row => ({ ...row, supplier_name: s.bills.find(b => b.sync_id === row.bill_sync_id)?.supplier_name || '', supplier_bill_no: s.bills.find(b => b.sync_id === row.bill_sync_id)?.supplier_bill_no || '' });
  if (input.dataset === 'events') return { rows: s.events.filter(e => ids.has(e.sync_id) && (!input.from || e.event_date >= input.from) && (!input.to || e.event_date <= input.to)).map(withSupplier) };
  if (input.dataset === 'payments') return { rows: s.payments.filter(p => !p.deleted_at && selected.has(p.bill_sync_id)).map(withSupplier) };
  return { rows: ledger.decorateRows(bills, s.payments.filter(p => !p.deleted_at), s.events) };
}
module.exports = { auditRange, exportData, restoreData, fields, clean, duplicates, checkDuplicate, encodeBackup, decodeBackup, protectHistory };
