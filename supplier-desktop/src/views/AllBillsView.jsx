import React from 'react';
import ExportControls from '../components/ExportControls';
import Icon from '../components/Icon';

const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const STATUS_CFG = {
  RETURNED: { label: 'Returned', bg: '#172554', color: '#93c5fd', border: '#1e40af' },
  COMPLETE:  { label: 'Paid',     bg: '#0a2e22', color: '#34d399', border: '#166534' },
  OVERPAID:  { label: 'Overpaid', bg: '#0a2e22', color: '#34d399', border: '#166534' },
  PARTIAL:   { label: 'Partial',  bg: '#2d1f07', color: '#fbbf24', border: '#92400e' },
  UNPAID:    { label: 'Unpaid',   bg: '#2d0e0e', color: '#fb7185', border: '#991b1b' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: '#1e293b', color: '#94a3b8', border: '#334155' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 0,
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

const STATUS_FILTERS = [
  { value: 'All',      label: 'All'      },
  { value: 'Returned', label: 'Returned' },
  { value: 'Credit', label: 'Credit Pending' },
  { value: 'Paid',     label: 'Paid'     },
  { value: 'Partial',  label: 'Partial'  },
  { value: 'Unpaid',   label: 'Unpaid'   },
];

export default function AllBillsView({ visible, search, setSearch, from, setFrom, to, setTo, onEdit, onPay, onDelete, onReturn, loading, title='Bills & payments' }) {
  const [page, setPage]                 = React.useState(1);
  const [pageSize, setPageSize]         = React.useState(50);
  const [supplierFilter, setSupplierFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [expandedBills, setExpandedBills] = React.useState(new Set());

  const toggleBill = (syncId) =>
    setExpandedBills((prev) => {
      const next = new Set(prev);
      next.has(syncId) ? next.delete(syncId) : next.add(syncId);
      return next;
    });

  React.useEffect(() => { setPage(1); setExpandedBills(new Set()); }, [visible, from, to, search, supplierFilter, statusFilter]);

  const suppliers = Array.from(new Set(visible.map((v) => v.supplier_name).filter(Boolean))).sort();

  const matchesStatus = (item) => {
    if (!statusFilter || statusFilter === 'All') return true;
    if (statusFilter === 'Returned') return item.returned_amount > 0;
    if (statusFilter === 'Credit') return item.pending_credit > 0;
    if (statusFilter === 'Paid')    return ['COMPLETE', 'OVERPAID'].includes(item.payment_status);
    if (statusFilter === 'Partial') return item.payment_status === 'PARTIAL';
    if (statusFilter === 'Unpaid')  return item.payment_status === 'UNPAID';
    return true;
  };

  const filteredList = visible.filter(
    (b) => (supplierFilter === 'All' || b.supplier_name === supplierFilter) && matchesStatus(b),
  ).sort((a, b) => {
    const dateOrder = String(b.posting_date || '').localeCompare(String(a.posting_date || ''));
    if (dateOrder) return dateOrder;
    const left = String(a.voucher_no ?? '').trim();
    const right = String(b.voucher_no ?? '').trim();
    if (!left) return right ? 1 : 0;
    if (!right) return -1;
    return right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalPages  = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const startIndex  = (page - 1) * pageSize;
  const pageSlice   = filteredList.slice(startIndex, startIndex + pageSize);
  const start       = filteredList.length === 0 ? 0 : startIndex + 1;
  const end         = Math.min(startIndex + pageSlice.length, filteredList.length);

  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  /* Grand totals across filtered set */
  const grand = filteredList.reduce(
    (s, b) => ({
      gross:   s.gross   + Number(b.total_bill_amount  || 0),
      actual:  s.actual  + Number(b.net_payable        || 0),
      paid:    s.paid    + Number(b.paid_amount         || 0),
      balance: s.balance + Number(b.remaining_balance  || 0),
    }),
    { gross: 0, actual: 0, paid: 0, balance: 0 },
  );

  // Group the paginated records by posting date, newest first.
  // Voucher order stays descending within each date.
  const groups = new Map();
  pageSlice.forEach(b => {
    const date = b.posting_date || 'Undated';
    if (!groups.has(date)) groups.set(date, {
      date, items: [], totals: { gross: 0, tax: 0, actual: 0, paid: 0, balance: 0 },
    });
    const group = groups.get(date);
    group.items.push(b);
    group.totals.gross += Number(b.total_bill_amount || 0);
    group.totals.tax += Number(b.tax_amount || 0);
    group.totals.actual += Number(b.net_payable || 0);
    group.totals.paid += Number(b.paid_amount || 0);
    group.totals.balance += Number(b.remaining_balance || 0);
  });
  const sortedGroups = [...groups.values()];

  return (
    <section style={S.page} className="all-bills-view" aria-busy={loading}>

      {/* ── Toolbar ── */}
      <div className="bills-toolbar">
        <div style={S.toolbarLeft}>

          <h2 style={S.toolbarTitle}>{title}</h2>
        </div>

        {/* Search */}
        <div className="bills-searchWrap">
          <span style={S.searchIcon}><Icon name="search" size={18} /></span>
          <input
            aria-label="Search supplier, bill or voucher" style={S.searchInput}
            placeholder="Supplier, bill no, voucher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button style={S.clearBtn} type="button" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" size={16} /></button>
          )}
        </div>

        {/* Date range */}
        <div className="bills-dateWrap">
          <div className="bills-dateGroup">
            <label htmlFor="bills-from" style={S.dateLabel}>From</label>
            <input id="bills-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={S.dateInput} />
          </div>
          <span style={S.dateSep}>→</span>
          <div className="bills-dateGroup">
            <label htmlFor="bills-to" style={S.dateLabel}>To</label>
            <input id="bills-to" min={from} type="date" value={to} onChange={(e) => setTo(e.target.value)} style={S.dateInput} />
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bills-filterBar">
        {/* Supplier select */}
        <div className="bills-filterGroup">
          <label htmlFor="bills-supplier" style={S.filterLabel}>Supplier</label>
          <select
            id="bills-supplier" style={S.filterSelect}
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
          >
            <option value="All">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Status pills */}
        <div className="bills-statusPills">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              aria-pressed={statusFilter === s.value}
              type="button"
              style={{
                ...S.pill,
                ...(statusFilter === s.value ? S.pillActive : {}),
              }}
              onClick={() => { setStatusFilter(s.value); setPage(1); }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Record count */}
        <span style={S.recordCount}>
          {filteredList.length} bill{filteredList.length !== 1 ? 's' : ''}
          {filteredList.length !== visible.length ? ` (of ${visible.length})` : ''}
        </span>
      </div>

      {/* ── Grand totals strip ── */}
      {filteredList.length > 0 && (
        <div className="bills-totalsStrip">
          <TotalChip label="Gross"    value={`Rs ${money(grand.gross)}`} />
          <div style={S.totalsDivider} />
          <TotalChip label="Payable"  value={`Rs ${money(grand.actual)}`} />
          <div style={S.totalsDivider} />
          <TotalChip label="Paid"     value={`Rs ${money(grand.paid)}`}    color="#34d399" />
          <div style={S.totalsDivider} />
          <TotalChip label="Balance"  value={`Rs ${money(grand.balance)}`} color={grand.balance > 0 ? '#fbbf24' : '#34d399'} />
        </div>
      )}

      <ExportControls ids={filteredList.map(b => b.sync_id)} disabled={loading || !filteredList.length} />
      <div className="mobile-bill-list">
        {pageSlice.length === 0 && <div className="mobile-empty"><span>✓</span><h3>No bills here</h3><p>Try another date range or filter. Add a bill to get started.</p></div>}
        {pageSlice.map(b => <article className="mobile-bill-card" key={b.sync_id}>
          <button type="button" className="bill-card-heading" onClick={() => toggleBill(b.sync_id)} aria-expanded={expandedBills.has(b.sync_id)}>
            <div><small>{b.posting_date} · {b.supplier_bill_no || 'No bill number'}</small><h3>{b.supplier_name}</h3></div>
            <StatusBadge status={b.payment_status} />
          </button>
          <div className="bill-card-amounts"><div><small>Payable</small><strong>Rs {money(b.net_payable)}</strong></div><div><small>Remaining</small><strong className="balance">Rs {money(b.remaining_balance)}</strong></div></div>
          <div className="bill-card-actions"><button type="button" onClick={() => toggleBill(b.sync_id)} aria-expanded={expandedBills.has(b.sync_id)}>{expandedBills.has(b.sync_id) ? 'Hide details ↑' : 'Details ↓'}</button><button type="button" className="primary" onClick={() => onPay(b)} disabled={Number(b.remaining_balance) <= 0}>Record payment</button></div>
          {['PAYABLE','BILL_TO_BILL'].includes(b.category) && Number(b.actual_amount)>Number(b.returned_amount||0) && <div className="bill-card-actions"><button onClick={()=>onReturn(b)}>Return stock</button></div>}{expandedBills.has(b.sync_id) && <div className="bill-card-details"><p>Returned Rs {money(b.returned_amount)} · Pending credit Rs {money(b.pending_credit)}</p>
            <dl><div><dt>Bill date</dt><dd>{b.bill_date}</dd></div><div><dt>Voucher</dt><dd>{b.voucher_no || '—'}</dd></div><div><dt>Gross</dt><dd>Rs {money(b.total_bill_amount)}</dd></div><div><dt>Tax ({b.tax_percent}%)</dt><dd>Rs {money(b.tax_amount)}</dd></div><div><dt>Total paid</dt><dd>Rs {money(b.paid_amount)}</dd></div><div><dt>Category</dt><dd>{b.category?.replaceAll('_',' ')}</dd></div></dl>
            {b.remarks && <p>{b.remarks}</p>}
            {b.ledgerEvents?.map(e=><div className="mobile-payment" key={e.syncId}><div><strong>{e.kind} · Rs {money(e.amount)}</strong><small>{e.eventDate} · {e.remarks}</small></div></div>)}<h4>Payments ({b.payments?.length || 0})</h4>
            {b.payments?.map(p => <div className="mobile-payment" key={p.sync_id}><div><strong>Rs {money(p.amount)}</strong><small>{p.payment_date} · {p.payment_mode?.replaceAll('_',' ')}</small>{p.reference_no && <small>{p.reference_no}</small>}{p.remarks && <small>{p.remarks}</small>}</div>{!b.ledgerEvents?.length && <button className="danger" aria-label="Delete payment" onClick={() => onDelete(p, 'payment')}>Delete</button>}</div>)}
            <div className="bill-card-actions">{!b.ledgerEvents?.length && <button onClick={() => onEdit(b)}>Edit bill</button>}{!b.ledgerEvents?.length && !b.payments?.length && <button className="danger" onClick={() => onDelete(b)}>Delete bill</button>}</div>
          </div>}
        </article>)}
      </div>

      {/* ── Table area ── */}
      <div className="desktop-bill-table" style={S.tableWrap}>
        {sortedGroups.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}><Icon name="bill" size={30} /></div>
            <div style={S.emptyTitle}>No bills found</div>
            <div style={S.emptyText}>Try adjusting the date range, supplier, or status filter.</div><button type="button" onClick={() => { setSearch(''); setSupplierFilter('All'); setStatusFilter('All'); }}>Clear filters</button>
          </div>
        ) : (
          sortedGroups.map((group) => (
            <div key={group.date} style={S.dateGroup2}>
              {/* Date header */}
              <div className="bills-dateHeader">
                <div className="bills-dateHeaderLeft">
                  <span className="bills-dateChip">{group.date}</span>
                  <span className="bills-dateMeta">
                    {group.items.length} bill{group.items.length !== 1 ? 's' : ''}
                    &nbsp;·&nbsp;Gross <strong>Rs {money(group.totals.gross)}</strong>
                    &nbsp;·&nbsp;Balance <strong style={{ color: group.totals.balance > 0 ? '#fbbf24' : '#34d399' }}>Rs {money(group.totals.balance)}</strong>
                  </span>
                </div>
                <span className="bills-datePaid">Paid Rs {money(group.totals.paid)}</span>
              </div>

              {/* Table */}
              <div style={S.tableScroll} className="custom-scroll">
                <table style={S.table}>
                  <thead>
                  <tr>
                    <Th>Posting / Bill</Th>
                    <Th>Supplier</Th>
                    <Th>Bill / Voucher</Th>
                    <Th align="right">Gross</Th>
                    <Th align="right">Tax</Th>
                    <Th align="right">Payable</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Balance</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">History</Th>
                    <Th align="center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((b) => (
                    <React.Fragment key={b.sync_id}>
                      {/* Bill row */}
                      <tr style={S.billRow}>
                        <Td>
                          <span style={S.dateMain}>{b.posting_date}</span>
                          {b.bill_date && b.bill_date !== b.posting_date && (
                            <small style={S.dateSub}>Bill: {b.bill_date}</small>
                          )}
                        </Td>
                        <Td>
                          <span style={S.supplierName}>{b.supplier_name}</span>
                          {b.remarks && <small style={S.metaSub}>{b.remarks}</small>}
                        </Td>
                        <Td>
                          {b.supplier_bill_no && <span>{b.supplier_bill_no}</span>}
                          {b.voucher_no && <small style={S.metaSub}>V: {b.voucher_no}</small>}
                        </Td>
                        <Td align="right"><span style={S.numVal}>Rs {money(b.total_bill_amount)}</span></Td>
                        <Td align="right">
                          <span style={S.taxPct}>{b.tax_percent}%</span>
                          <small style={S.metaSub}>Rs {money(b.tax_amount)}</small>
                        </Td>
                        <Td align="right"><span style={S.numVal}>Rs {money(b.net_payable)}</span>{b.returned_amount > 0 && <small style={S.metaSub}>Original Rs {money(b.actual_amount)}</small>}</Td>
                        <Td align="right"><span style={{ ...S.numVal, color: '#34d399' }}>Rs {money(b.paid_amount)}</span></Td>
                        <Td align="right">
                          <span style={{ ...S.numVal, color: Number(b.remaining_balance) > 0 ? '#fbbf24' : '#34d399' }}>
                            Rs {money(b.remaining_balance)}
                          </span>
                        </Td>
                        <Td align="center"><StatusBadge status={b.payment_status} />{b.category === 'BILL_TO_BILL' && <small style={S.metaSub}>Bill to bill</small>}
                          {b.returned_amount > 0 && <small style={S.metaSub}>{b.return_status === 'RETURNED' ? 'Returned' : 'Partial return'} · {b.last_return_date}<br />Rs {money(b.returned_amount)}</small>}
                          {b.pending_credit > 0 && <small style={{...S.metaSub,color:'#a78bfa'}}>Credit pending Rs {money(b.pending_credit)}</small>}
                          {b.credit_applied > 0 && <small style={S.metaSub}>Credit applied Rs {money(b.credit_applied)}</small>}
                        </Td>

                        {/* ── Collapse toggle ── */}
                        <Td align="center">
                          {(b.payments?.length || 0) + (b.ledgerEvents?.length || 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleBill(b.sync_id)}
                              style={{ ...S.toggleBtn, ...(expandedBills.has(b.sync_id) ? S.toggleBtnOpen : {}) }}
                              aria-expanded={expandedBills.has(b.sync_id)}
                              aria-label={`History for bill ${b.supplier_bill_no || b.voucher_no || b.supplier_name}`}
                              title={expandedBills.has(b.sync_id) ? 'Hide history' : 'Show history'}
                            >
                              <span style={S.toggleCount}>{(b.payments?.length || 0) + (b.ledgerEvents?.length || 0)}</span>
                              <span style={S.toggleChevron}>{expandedBills.has(b.sync_id) ? '▲' : '▼'}</span>
                            </button>
                          ) : (
                            <span style={S.noPayments}>—</span>
                          )}
                        </Td>

                        <Td align="center">
                          <div style={S.actions}>
                            {!b.ledgerEvents?.length && <ActionBtn onClick={() => onEdit(b)}>Edit</ActionBtn>}
                            {b.remaining_balance > 0 && <ActionBtn onClick={() => onPay(b)} accent>Pay</ActionBtn>}
                            {['PAYABLE', 'BILL_TO_BILL'].includes(b.category) && Number(b.actual_amount) > Number(b.returned_amount || 0) && <ActionBtn onClick={() => onReturn(b)}>Return</ActionBtn>}
                            {!b.ledgerEvents?.length && !b.payments?.length && <ActionBtn onClick={() => onDelete(b)} danger>Delete</ActionBtn>}
                          </div>
                        </Td>
                      </tr>

                      {/* Payment sub-rows — visible only when expanded */}
                      {expandedBills.has(b.sync_id) && b.payments?.map((p) => (
                        <tr key={p.sync_id} style={S.paymentRow}>
                          <Td sub>{p.payment_date}</Td>
                          <Td sub colSpan={2}>
                            <span style={S.paymentArrow}>↳</span>
                            <span style={S.paymentMode}>{p.payment_mode}</span>
                            {p.reference_no && <span style={S.paymentRef}> · {p.reference_no}</span>}
                            {p.remarks && <small style={S.metaSub}>{p.remarks}</small>}
                          </Td>
                          <Td sub colSpan={3} />
                          <Td sub align="right">
                            <span style={{ color: '#34d399', fontWeight: 700 }}>Rs {money(p.amount)}</span>
                          </Td>
                          <Td sub />
                          <Td sub align="center">
                            <span style={S.paymentTag}>Payment</span>
                          </Td>
                          <Td sub />
                          <Td sub align="center">
                            {!b.ledgerEvents?.length && <ActionBtn onClick={() => onDelete(p, 'payment')} danger>Delete</ActionBtn>}
                          </Td>
                        </tr>
                      ))}
                      {expandedBills.has(b.sync_id) && b.ledgerEvents?.map(e => <tr key={e.syncId} style={S.paymentRow}>
                        <Td sub>{e.eventDate}</Td><Td sub colSpan={2}>{e.kind === 'RETURN' ? 'Stock return' : e.kind === 'REFUND' ? `Refund received · ${e.paymentMode}` : e.billSyncId === b.sync_id ? 'Credit sent to another bill' : 'Credit applied from another bill'}<small style={S.metaSub}>{e.referenceNo} {e.remarks}</small></Td><Td sub colSpan={3} /><Td sub align="right">Rs {money(e.amount)}</Td><Td sub colSpan={4} />
                      </tr>)}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          ))
        )}
      </div>

      {/* ── Pagination bar ── */}
      <div className="bill-pagination" style={S.paginationBar}>
        <span style={S.pageInfo}>
          Showing <strong>{start}–{end}</strong> of <strong>{filteredList.length}</strong> bills
        </span>

        <div className="bills-pageControls">
          <PageBtn disabled={page === 1} onClick={() => setPage(1)}>First</PageBtn>
          <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</PageBtn>
          <span style={S.pageNum}>Page {page} / {totalPages}</span>
          <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</PageBtn>
          <PageBtn disabled={page === totalPages} onClick={() => setPage(totalPages)}>Last</PageBtn>
        </div>

        <div style={S.pageSizeWrap}>
          <span style={S.pageSizeLabel}>Show</span>
          <select
            aria-label="Bills per page" style={S.pageSizeSelect}
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span style={S.pageSizeLabel}>/ page</span>
        </div>
      </div>
    </section>
  );
}

/* ── Tiny sub-components ── */
function Th({ children, align = 'left' }) {
  return <th style={{ ...S.th, textAlign: align }}>{children}</th>;
}
function Td({ children, align = 'left', sub, colSpan }) {
  return (
    <td style={{ ...S.td, ...(sub ? S.tdSub : {}), textAlign: align }} colSpan={colSpan}>
      {children}
    </td>
  );
}
function ActionBtn({ children, onClick, accent, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...S.actionBtn,
        ...(accent ? S.actionBtnAccent : {}),
        ...(danger ? S.actionBtnDanger : {}),
      }}
    >
      {children}
    </button>
  );
}
function PageBtn({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...S.pageBtn, ...(disabled ? S.pageBtnDisabled : {}) }}
    >
      {children}
    </button>
  );
}
function TotalChip({ label, value, color }) {
  return (
    <div className="bills-totalChip">
      <span className="bills-totalChipLabel">{label}</span>
      <span className="bills-totalChipValue" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

/* ── Styles (JS-in-CSS object) ── */
const S = {
  page: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, width: '100%' },

  /* Toolbar */
  toolbar: {
    display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14,
    flexWrap: 'wrap',
  },
  toolbarLeft: { marginRight: 'auto' },
  eyebrow: { color: '#34d399', fontSize: 12, fontWeight: 700, letterSpacing: 2, display: 'block', marginBottom: 2 },
  toolbarTitle: { margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 700 },

  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 10,
    padding: '0 10px', height: 38, minWidth: 220,
  },
  searchIcon: { color: 'var(--muted)', fontSize: 18 },
  searchInput: {
    background: 'none', border: 'none', outline: 'none', color: '#e2e8f0',
    fontSize: 13, flex: 1, padding: 0, margin: 0, width: '100%',
  },
  clearBtn: {
    background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
    fontSize: 12, padding: '0 2px',
  },

  dateWrap: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  dateGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  dateLabel: { color: 'var(--muted)', fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', display: 'block' },
  dateInput: {
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 10,
    color: '#e2e8f0', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
    margin: 0, width: 'auto',
  },
  dateSep: { color: 'var(--muted)', fontSize: 16, paddingBottom: 4 },

  /* Filter bar */
  filterBar: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 14,
    padding: '10px 16px', marginBottom: 12,
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  filterLabel: { color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' },
  filterSelect: {
    background: '#07101f', border: '1px solid #1e293b', borderRadius: 8,
    color: '#e2e8f0', padding: '5px 10px', fontSize: 12, margin: 0, cursor: 'pointer', maxWidth: 200,
  },
  statusPills: { display: 'flex', gap: 6 },
  pill: {
    padding: '5px 14px', borderRadius: 99, border: '1px solid #1e293b',
    background: '#07101f', color: 'var(--muted)', fontSize: 12, fontWeight: 800,
    cursor: 'pointer', transition: 'all .15s',
  },
  pillActive: { background: '#0f2a22', border: '1px solid #22c55e', color: '#34d399' },
  recordCount: { color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' },

  /* Totals strip */
  totalsStrip: {
    display: 'flex', alignItems: 'center',
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 14,
    padding: '12px 20px', marginBottom: 14, gap: 0,
  },
  totalsDivider: { width: 1, background: '#1e293b', alignSelf: 'stretch', margin: '0 0' },
  totalChip: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 16px' },
  totalChipLabel: { color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'none', letterSpacing: 0 },
  totalChipValue: { color: '#e2e8f0', fontSize: 14, fontWeight: 700 },

  /* Table area */
  tableWrap: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' },

  empty: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#e2e8f0', fontWeight: 700, fontSize: 18, marginBottom: 6 },
  emptyText: { color: 'var(--muted)', fontSize: 13 },

  /* Date group */
  dateGroup2: {
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden', minWidth: 0, width: '100%',
  },
  dateHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 18px', borderBottom: '1px solid #1e293b', background: '#071220',
  },
  dateHeaderLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  dateChip: {
    background: '#0f2a40', border: '1px solid #1e4080', color: '#93c5fd',
    fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 99,
  },
  dateMeta: { color: 'var(--muted)', fontSize: 12 },
  datePaid: { color: '#34d399', fontSize: 12, fontWeight: 700 },

  /* Scrollable table container */
  tableScroll: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
  },

  table: { borderCollapse: 'collapse', width: '100%', minWidth: 1180 },
  th: {
    padding: '10px 14px', color: 'var(--muted)', fontSize: 12, fontWeight: 800,
    textTransform: 'none', letterSpacing: 0, borderBottom: '1px solid #1e293b',
    background: '#071220', position: 'sticky', top: 0, whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 14px', borderBottom: '1px solid #0f1e2e', verticalAlign: 'top',
    color: '#cbd5e1', fontSize: 13, whiteSpace: 'nowrap',
  },
  tdSub: { background: '#07101f', padding: '9px 14px' },

  billRow: {},
  paymentRow: { background: '#07101f' },

  dateMain: { color: '#94a3b8', fontWeight: 700, display: 'block' },
  dateSub: { color: 'var(--muted)', display: 'block', marginTop: 3, fontSize: 12 },
  supplierName: {
    color: '#f1f5f9', fontWeight: 800, display: 'block', maxWidth: 220,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  metaSub: {
    color: 'var(--muted)', display: 'block', marginTop: 3, fontSize: 12, maxWidth: 220,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  numVal: { fontWeight: 700, color: '#e2e8f0' },
  taxPct: { color: 'var(--muted)', display: 'block', fontWeight: 700 },
  paymentArrow: { color: 'var(--muted)', marginRight: 6 },
  paymentMode: { color: 'var(--muted)', fontWeight: 700, fontSize: 12 },
  paymentRef: { color: 'var(--muted)', fontSize: 12 },
  paymentTag: {
    fontSize: 12, fontWeight: 800, letterSpacing: 0, padding: '3px 8px',
    borderRadius: 99, background: '#1a2a3a', color: '#4a9eff', border: '1px solid #1e3a5f',
  },

  actions: { display: 'flex', gap: 4, justifyContent: 'center' },
  actionBtn: {
    padding: '5px 10px', borderRadius: 8, border: '1px solid #1e293b',
    background: '#101c30', color: '#94a3b8', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  actionBtnAccent: { background: '#0a2e22', border: '1px solid #166534', color: '#34d399' },
  actionBtnDanger: { background: '#2d0e0e', border: '1px solid #7f1d1d', color: '#fb7185' },

  /* Collapse toggle */
  toggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 99, border: '1px solid #1e293b',
    background: '#0a1425', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700,
  },
  toggleBtnOpen: { background: '#0a2e22', border: '1px solid #166534', color: '#34d399' },
  toggleCount: { fontWeight: 800 },
  toggleChevron: { fontSize: 8, opacity: 0.7 },
  noPayments: { color: '#1e293b', fontSize: 14 },

  /* Pagination */
  paginationBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: 12, marginTop: 16, padding: '12px 18px',
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 14,
  },
  pageInfo: { color: 'var(--muted)', fontSize: 12 },
  pageControls: { display: 'flex', alignItems: 'center', gap: 6 },
  pageBtn: {
    padding: '6px 12px', borderRadius: 8, border: '1px solid #1e293b',
    background: '#101c30', color: '#94a3b8', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
  },
  pageBtnDisabled: { opacity: 0.35, cursor: 'not-allowed' },
  pageNum: { color: 'var(--muted)', fontSize: 12, padding: '0 6px' },
  pageSizeWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  pageSizeLabel: { color: 'var(--muted)', fontSize: 12 },
  pageSizeSelect: {
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 8,
    color: '#e2e8f0', padding: '5px 8px', fontSize: 12, margin: 0, cursor: 'pointer',
  },
};
