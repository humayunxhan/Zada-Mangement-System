import React, { useMemo } from 'react';
import Icon from '../components/Icon';

const money = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (part, whole) => whole > 0 ? Math.min(100, Math.round(part / whole * 100)) : 0;
const statuses = [
  ['COMPLETE', 'Paid', 'var(--positive)'], ['PARTIAL', 'Partly paid', 'var(--warning)'],
  ['UNPAID', 'Unpaid', 'var(--negative)'], ['RETURNED', 'Returned', 'var(--info)'],
  ['OVERPAID', 'Overpaid', 'var(--credit)'],
];

export default function SummaryView({ totals, items, from, to, setFrom, setTo, onAddBill, onViewBills }) {
  const settled = Math.max(0, totals.actual - totals.balance);
  const settledPct = pct(settled, totals.actual);
  const counts = useMemo(() => items.reduce((map, b) => ({ ...map, [b.payment_status]: (map[b.payment_status] || 0) + 1 }), {}), [items]);
  const suppliers = useMemo(() => {
    const map = new Map();
    items.forEach(b => {
      const supplier = map.get(b.supplier_name) || { name: b.supplier_name, count: 0, balance: 0, credit: 0, paid: 0 };
      supplier.count += 1; supplier.balance += Number(b.remaining_balance || 0);
      supplier.credit += Number(b.pending_credit || 0); supplier.paid += Number(b.paid_amount || 0);
      map.set(b.supplier_name, supplier);
    });
    return [...map.values()].sort((a, b) => b.balance - a.balance).slice(0, 8);
  }, [items]);
  const otherCount = items.filter(b => !statuses.some(([key]) => key === b.payment_status)).length;

  return <section className="summary-view" aria-labelledby="overview-title">
    <div className="page-heading">
      <div><h2 id="overview-title">Overview</h2><p>Your supplier balances and settlement activity.</p></div>
      <div className="range-controls"><label htmlFor="summary-from">From<input id="summary-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><span aria-hidden="true">to</span><label htmlFor="summary-to">To<input id="summary-to" type="date" min={from} value={to} onChange={e => setTo(e.target.value)} /></label></div>
    </div>
    <div className="overview-ledger">
      <div className="balance-panel">
        <div className="balance-caption"><span className="status-dot" /><span>Outstanding to suppliers</span><span className="range-note">{items.length} {items.length === 1 ? 'bill' : 'bills'} in this period</span></div>
        <div className={`balance-amount ${totals.balance > 0 ? 'has-balance' : ''}`}><span>Rs</span> {money(totals.balance)}</div>
        <p>{items.length === 0 ? 'Add a supplier bill to start tracking balances.' : totals.balance > 0 ? 'Amount still payable after payments, returns and credit adjustments.' : 'All payable balances in this period are cleared.'}</p>
        <div className="balance-actions"><button className="primary" onClick={onAddBill}><Icon name="plus" size={18} /> Add a bill</button><button className="quiet-button" onClick={onViewBills}>Review bills <Icon name="chevron" size={16} /></button></div>
        <div className="settlement-progress"><div><span>Settlement progress</span><strong>{settledPct}% settled</strong></div><div className="progress-track" role="progressbar" aria-label="Settlement progress" aria-valuenow={settledPct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${settledPct}%` }} /></div><small>Settled Rs {money(settled)} of Rs {money(totals.actual)} net payable</small></div>
      </div>
      <dl className="ledger-facts"><div><dt>Gross bills</dt><dd>Rs {money(totals.gross)}</dd></div><div><dt>Tax deducted</dt><dd>Rs {money(totals.tax)}</dd></div><div><dt>Net payable</dt><dd>Rs {money(totals.actual)}</dd><small>After tax and returns</small></div><div><dt>Payments recorded</dt><dd>Rs {money(totals.paid)}</dd><small>Cash and bank payment history</small></div></dl>
    </div>
    <div className="settlement-facts"><Metric label="Stock returned" value={totals.returned} /><Metric label="Pending supplier credit" value={totals.credit} credit /><Metric label="Refunds received" value={totals.refunded} /><Metric label="Credit applied" value={totals.adjusted} /></div>
    <p className="scope-note">Figures reflect bills posted in the selected period and their current settlement status.</p>
    <div className="overview-details">
      <section className="overview-section"><div className="section-heading"><h3>Bill status</h3><span>{items.length} total</span></div>
        <div className="status-list">{statuses.map(([key, label, color]) => <div key={key}><span><i style={{ background: color }} />{label}</span><strong>{counts[key] || 0}</strong></div>)}{otherCount > 0 && <div><span><i />Other categories</span><strong>{otherCount}</strong></div>}</div>
      </section>
      <section className="overview-section supplier-section"><div className="section-heading"><h3>Supplier balances</h3><span>Highest outstanding first</span></div>
        {suppliers.length ? <div className="supplier-balances">{suppliers.map(supplier => <div key={supplier.name}><div><strong>{supplier.name}</strong><small>{supplier.count} {supplier.count === 1 ? 'bill' : 'bills'} / Paid Rs {money(supplier.paid)}</small></div><div className="supplier-amount"><strong className={supplier.balance > 0 ? 'amount-due' : 'amount-cleared'}>{supplier.balance > 0 ? `Rs ${money(supplier.balance)} due` : 'Cleared'}</strong>{supplier.credit > 0 && <small>Credit Rs {money(supplier.credit)}</small>}</div></div>)}</div> : <div className="empty-state"><Icon name="bill" size={30} /><h4>No bills in this period</h4><p>Choose another date range or add your first supplier bill.</p><button onClick={onAddBill}>Add a bill</button></div>}
      </section>
    </div>
  </section>;
}
function Metric({ label, value, credit }) {
  return <div className={credit ? 'credit-metric' : ''}><span>{label}</span><strong>Rs {money(value)}</strong></div>;
}
