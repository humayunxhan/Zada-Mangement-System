import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/Modal';
import Feedback from '../components/Feedback';
import Icon from '../components/Icon';
import { api } from '../api';
import { newSyncId } from '../ids';
const money = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const labels = { RETURN: 'Stock return', REFUND: 'Refund received', ADJUSTMENT: 'Credit adjustment' };

export default function ReturnsView({ initialBill, onChanged }) {
  const [bills, setBills] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('credit');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [draft, setDraft] = useState(null), [saving, setSaving] = useState(false), [formError, setFormError] = useState(''), [notice, setNotice] = useState('');
  const opened = useRef(false);
  async function load() {
    setLoading(true);
    try { setBills(await api.bills.list()); setError(''); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (initialBill && bills.length && !opened.current) { opened.current = true; open(bills.find(b => b.sync_id === initialBill.sync_id) || initialBill, 'RETURN'); }
  }, [initialBill, bills]);
  function open(bill, kind) {
    setFormError(''); setNotice('');
    setDraft({ syncId: newSyncId(), kind, billSyncId: bill.sync_id, eventDate: today(), amount: kind === 'RETURN' ? Math.max(0, Number(bill.actual_amount) - Number(bill.returned_amount || 0)) : bill.pending_credit, targetBillSyncId: '', paymentMode: 'COUNTER_CASH', referenceNo: '', remarks: '' });
  }
  const source = bills.find(b => b.sync_id === draft?.billSyncId);
  const targets = bills.filter(b => source && b.sync_id !== source.sync_id && ['PAYABLE', 'BILL_TO_BILL'].includes(b.category) && b.supplier_name.trim().toLowerCase() === source.supplier_name.trim().toLowerCase() && b.remaining_balance > 0);
  const target = targets.find(b => b.sync_id === draft?.targetBillSyncId);
  const max = draft?.kind === 'RETURN' ? Math.max(0, Number(source?.actual_amount) - Number(source?.returned_amount || 0)) : draft?.kind === 'ADJUSTMENT' ? Math.min(Number(source?.pending_credit || 0), Number(target?.remaining_balance || 0)) : Number(source?.pending_credit || 0);
  const patch = values => setDraft(d => ({ ...d, ...values }));
  async function save(e) {
    e.preventDefault(); if (saving) return;
    setSaving(true); setFormError('');
    try {
      await api.returns.record({ ...draft, amount: Number(draft.amount) });
      setNotice(`${labels[draft.kind]} saved for ${draft.eventDate}.`);
      setDraft(null); await load(); await onChanged();
    } catch (e) { setFormError(e.message); } finally { setSaving(false); }
  }
  const pending = bills.reduce((n, b) => n + Number(b.pending_credit || 0), 0);
  const shown = bills.filter(b => `${b.supplier_name} ${b.supplier_bill_no} ${b.voucher_no}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || filter === 'credit' && b.pending_credit > 0 || filter === 'returned' && b.returned_amount > 0));
  const history = useMemo(() => {
    const unique = new Map();
    bills.forEach(b => (b.ledgerEvents || []).forEach(e => { if (!unique.has(e.syncId)) unique.set(e.syncId, { ...e, source: bills.find(x => x.sync_id === e.billSyncId), target: bills.find(x => x.sync_id === e.targetBillSyncId) }); }));
    return [...unique.values()].filter(e => (!from || e.eventDate >= from) && (!to || e.eventDate <= to) && `${e.source?.supplier_name} ${e.source?.supplier_bill_no} ${e.referenceNo}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [bills, from, to, search]);
  const period = kind => history.filter(e => e.kind === kind).reduce((n, e) => n + Number(e.amount), 0);
  return <section className="returns-page">
    <div className="returns-heading"><div><h2>Returns &amp; supplier credits</h2><p>Record stock returns, receive refunds, or apply credit to another bill.</p></div><button type="button" onClick={load} disabled={loading}><Icon name="refresh" size={17} /> Refresh</button></div>
    {error && <Feedback>{error}</Feedback>}
    {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}
    <div className="returns-kpis"><div><small>Pending supplier credit · all bills</small><strong>Rs {money(pending)}</strong></div><div><small>Returns · activity dates below</small><strong>Rs {money(period('RETURN'))}</strong></div><div><small>Refunds received</small><strong>Rs {money(period('REFUND'))}</strong></div><div><small>Credit adjusted</small><strong>Rs {money(period('ADJUSTMENT'))}</strong></div></div>
    <div className="returns-toolbar"><label>Search supplier / bill<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Supplier, bill or voucher" /></label><label>Show bills<select value={filter} onChange={e => setFilter(e.target.value)}><option value="credit">Pending credit</option><option value="returned">Returned bills</option><option value="all">All bills</option></select></label></div>
    {loading ? <p role="status">Loading bills…</p> : <div className="returns-table"><table hidden={!shown.length}><thead><tr><th>Supplier / Bill</th><th>Original net</th><th>Returned</th><th>Payable balance</th><th>Pending credit</th><th>Actions</th></tr></thead><tbody>{shown.map(b => <tr key={b.sync_id}><td><strong>{b.supplier_name}</strong><small>Bill {b.supplier_bill_no || '—'} · V: {b.voucher_no || '—'}</small>{b.last_return_date && <small>{b.return_status === 'RETURNED' ? 'Returned' : 'Partially returned'} · {b.last_return_date}</small>}</td><td>Rs {money(b.actual_amount)}</td><td>Rs {money(b.returned_amount)}</td><td>Rs {money(b.remaining_balance)}</td><td className="credit-value">Rs {money(b.pending_credit)}{b.pending_credit > 0 && <small>Credit pending</small>}</td><td><div className="return-actions">{['PAYABLE', 'BILL_TO_BILL'].includes(b.category) && Number(b.actual_amount) > Number(b.returned_amount || 0) && <button onClick={() => open(b, 'RETURN')}>Return stock</button>}{b.pending_credit > 0 && <><button onClick={() => open(b, 'REFUND')}>Receive refund</button><button onClick={() => open(b, 'ADJUSTMENT')}>Adjust credit</button></>}</div></td></tr>)}</tbody></table>{!shown.length && <div className="empty-state"><Icon name="returns" size={28} /><h4>{filter === 'credit' && !search ? 'No pending supplier credit' : 'No matching bills'}</h4><p>Select all bills to record a stock return.</p><button onClick={() => { setFilter('all'); setSearch(''); }}>Show all bills</button></div>}</div>}
    <div className="returns-heading"><h3>Dated activity</h3><div className="return-actions"><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} /></label></div></div>
    <div className="returns-table"><table><thead><tr><th>Date</th><th>Supplier / Bill</th><th>Activity</th><th>Amount</th><th>Reference / Reason</th></tr></thead><tbody>{history.map(e => <tr key={e.syncId}><td>{e.eventDate}</td><td>{e.source?.supplier_name}<small>Bill {e.source?.supplier_bill_no || '—'}</small></td><td>{labels[e.kind]}{e.target && <small>To bill {e.target.supplier_bill_no || e.target.voucher_no || e.target.sync_id}</small>}{e.kind === 'REFUND' && <small>{e.paymentMode}</small>}</td><td>Rs {money(e.amount)}</td><td>{e.referenceNo || '—'}<small>{e.remarks}</small><small>Recorded by {e.createdBy || '—'}</small></td></tr>)}</tbody></table>{!history.length && <p className="returns-empty">No return or settlement activity in this period.</p>}</div>
    {draft && <Modal title={labels[draft.kind]} onClose={() => setDraft(null)} busy={saving}><form onSubmit={save}>
      <p className="dialog-description">{source?.supplier_name} · Bill {source?.supplier_bill_no || source?.voucher_no || '—'}</p>
      {draft.kind === 'RETURN' ? <p>Unreturned net amount: Rs {money(max)}. A full return removes the remaining payable and preserves any supplier credit.</p> : <p>Available supplier credit: Rs {money(source?.pending_credit)}.</p>}
      <fieldset className="dialog-fields" disabled={saving}><label>{draft.kind === 'RETURN' ? 'Return date' : 'Settlement date'}<input autoFocus type="date" required value={draft.eventDate} onChange={e => patch({ eventDate: e.target.value })} /></label>
      {draft.kind === 'ADJUSTMENT' && <label>Apply to bill<select required value={draft.targetBillSyncId} onChange={e => { const b = targets.find(x => x.sync_id === e.target.value); patch({ targetBillSyncId: e.target.value, amount: Math.min(Number(source.pending_credit), Number(b?.remaining_balance || 0)) }); }}><option value="">Select same supplier's bill</option>{targets.map(b => <option key={b.sync_id} value={b.sync_id}>{b.supplier_bill_no || b.voucher_no || b.sync_id} · {b.bill_date} · Balance Rs {money(b.remaining_balance)}</option>)}</select>{!targets.length && <small>No payable bill available. Add the next bill first, or receive a refund.</small>}</label>}
      <label>Amount (Rs){draft.kind === 'RETURN' && <small>Enter the agreed return value after tax deduction; use the full net amount for a full return.</small>}<input type="number" required min="0.01" step="0.01" max={max} value={draft.amount} onChange={e => patch({ amount: e.target.value })} /></label>
      {draft.kind === 'REFUND' && <label>Refund mode<select value={draft.paymentMode} onChange={e => patch({ paymentMode: e.target.value })}><option value="COUNTER_CASH">Counter cash</option><option value="ONLINE_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></label>}
      <label>Return slip / Settlement reference<input maxLength={100} value={draft.referenceNo} onChange={e => patch({ referenceNo: e.target.value })} /></label>
      <label>{draft.kind === 'RETURN' ? 'Return reason' : 'Remarks'}<textarea required={draft.kind === 'RETURN'} value={draft.remarks} onChange={e => patch({ remarks: e.target.value })} /></label>
      {draft.kind === 'RETURN' && Number(draft.amount) > 0 && <p className="return-preview">After return: payable Rs {money(Math.max(0, Number(source?.net_payable) - Number(draft.amount) - Number(source?.paid_amount) - Number(source?.credit_applied) + Number(source?.refund_amount) + Number(source?.credit_used)))} · credit Rs {money(Math.max(0, Number(source?.paid_amount) + Number(source?.credit_applied) - Number(source?.refund_amount) - Number(source?.credit_used) - (Number(source?.net_payable) - Number(draft.amount))))}</p>}
      </fieldset>{formError && <Feedback>{formError}</Feedback>}
      <div className="dialog-actions"><button className="primary" disabled={saving || max <= 0}>{saving ? 'Saving…' : draft.kind === 'RETURN' ? 'Save stock return' : draft.kind === 'REFUND' ? 'Save refund' : 'Apply credit'}</button><button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button></div>
    </form></Modal>}
  </section>;
}
