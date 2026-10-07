import React from 'react';

const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const STATUS_CFG = {
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
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.5,
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
  { value: 'Paid',     label: 'Paid'     },
  { value: 'Partial',  label: 'Partial'  },
  { value: 'Unpaid',   label: 'Unpaid'   },
];

export default function AllBillsView({ visible, search, setSearch, from, setFrom, to, setTo, onEdit, onPay, onDelete, title = 'Bills & Payments' }) {
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
    if (statusFilter === 'Paid')    return ['COMPLETE', 'OVERPAID'].includes(item.payment_status);
    if (statusFilter === 'Partial') return item.payment_status === 'PARTIAL';
    if (statusFilter === 'Unpaid')  return item.payment_status === 'UNPAID';
    return true;
  };

  const filteredList = visible.filter(
    (b) => (supplierFilter === 'All' || b.supplier_name === supplierFilter) && matchesStatus(b),
  );

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
      actual:  s.actual  + Number(b.actual_amount      || 0),
      paid:    s.paid    + Number(b.paid_amount         || 0),
      balance: s.balance + Number(b.remaining_balance  || 0),
    }),
    { gross: 0, actual: 0, paid: 0, balance: 0 },
  );

  const groups = pageSlice.reduce((acc, b) => {
    const key = b.posting_date || b.bill_date || 'Unknown';
    if (!acc[key]) acc[key] = { date: key, items: [], totals: { gross: 0, tax: 0, actual: 0, paid: 0, balance: 0 } };
    acc[key].items.push(b);
    acc[key].totals.gross   += Number(b.total_bill_amount  || 0);
    acc[key].totals.tax     += Number(b.tax_amount         || 0);
    acc[key].totals.actual  += Number(b.actual_amount      || 0);
    acc[key].totals.paid    += Number(b.paid_amount        || 0);
    acc[key].totals.balance += Number(b.remaining_balance  || 0);
    return acc;
  }, {});

  const sortedGroups = Object.values(groups).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <section className="bills-view" style={S.page}>

      {/* ── Toolbar ── */}
      <div className="bills-toolbar" style={S.toolbar}>
        <div style={S.toolbarLeft}>
          <span style={S.eyebrow}>ALL BILLS</span>
          <h2 style={S.toolbarTitle}>{title}</h2>
        </div>

        {/* Search */}
        <div className="bill-search" style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input
            style={S.searchInput}
            aria-label="Search bills" placeholder="Supplier, bill no, voucher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button style={S.clearBtn} type="button" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Date range */}
        <div className="bill-dates" style={S.dateWrap}>
          <div style={S.dateGroup}>
            <label style={S.dateLabel}>From</label>
            <input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={S.dateInput} />
          </div>
          <span style={S.dateSep}>→</span>
          <div style={S.dateGroup}>
            <label style={S.dateLabel}>To</label>
            <input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={S.dateInput} />
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bill-filters" style={S.filterBar}>
        {/* Supplier select */}
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Supplier</span>
          <select
            aria-label="Filter by supplier" style={S.filterSelect}
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
          >
            <option value="All">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Status pills */}
        <div className="status-pills" style={S.statusPills}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
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
        <div className="bill-totals" style={S.totalsStrip}>
          <TotalChip label="Gross"    value={`Rs ${money(grand.gross)}`} />
          <div style={S.totalsDivider} />
          <TotalChip label="Payable"  value={`Rs ${money(grand.actual)}`} />
          <div style={S.totalsDivider} />
          <TotalChip label="Paid"     value={`Rs ${money(grand.paid)}`}    color="#34d399" />
          <div style={S.totalsDivider} />
          <TotalChip label="Balance"  value={`Rs ${money(grand.balance)}`} color={grand.balance > 0 ? '#fbbf24' : '#34d399'} />
        </div>
      )}

      <div className="mobile-bill-list">
        {pageSlice.length === 0 && <div className="mobile-empty"><span>✓</span><h3>No bills here</h3><p>Try another date range or filter. Add a bill to get started.</p></div>}
        {pageSlice.map(b => <article className="mobile-bill-card" key={b.sync_id}>
          <button type="button" className="bill-card-heading" onClick={() => toggleBill(b.sync_id)} aria-expanded={expandedBills.has(b.sync_id)}>
            <div><small>{b.posting_date} · {b.supplier_bill_no || 'No bill number'}</small><h3>{b.supplier_name}</h3></div>
            <StatusBadge status={b.payment_status} />
          </button>
          <div className="bill-card-amounts"><div><small>Payable</small><strong>Rs {money(b.actual_amount)}</strong></div><div><small>Remaining</small><strong className="balance">Rs {money(b.remaining_balance)}</strong></div></div>
          <div className="bill-card-actions"><button type="button" onClick={() => toggleBill(b.sync_id)} aria-expanded={expandedBills.has(b.sync_id)}>{expandedBills.has(b.sync_id) ? 'Hide details ↑' : 'Details ↓'}</button><button type="button" className="primary" onClick={() => onPay(b)} disabled={Number(b.remaining_balance) <= 0}>Record payment</button></div>
          {expandedBills.has(b.sync_id) && <div className="bill-card-details">
            <dl><div><dt>Bill date</dt><dd>{b.bill_date}</dd></div><div><dt>Voucher</dt><dd>{b.voucher_no || '—'}</dd></div><div><dt>Gross</dt><dd>Rs {money(b.total_bill_amount)}</dd></div><div><dt>Tax ({b.tax_percent}%)</dt><dd>Rs {money(b.tax_amount)}</dd></div><div><dt>Total paid</dt><dd>Rs {money(b.paid_amount)}</dd></div><div><dt>Category</dt><dd>{b.category?.replaceAll('_',' ')}</dd></div></dl>
            {b.remarks && <p>{b.remarks}</p>}
            <h4>Payments ({b.payments?.length || 0})</h4>
            {b.payments?.map(p => <div className="mobile-payment" key={p.sync_id}><div><strong>Rs {money(p.amount)}</strong><small>{p.payment_date} · {p.payment_mode?.replaceAll('_',' ')}</small>{p.reference_no && <small>{p.reference_no}</small>}{p.remarks && <small>{p.remarks}</small>}</div><button className="danger" aria-label="Delete payment" onClick={() => onDelete(p, 'payment')}>Delete</button></div>)}
            <div className="bill-card-actions"><button onClick={() => onEdit(b)}>Edit bill</button><button className="danger" onClick={() => onDelete(b)}>Delete bill</button></div>
          </div>}
        </article>)}
      </div>

      {/* ── Table area ── */}
      <div className="desktop-bill-table" style={S.tableWrap}>
        {sortedGroups.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>🗂</div>
            <div style={S.emptyTitle}>No bills found</div>
            <div style={S.emptyText}>Try adjusting the date range, supplier, or status filter.</div>
          </div>
        ) : (
          sortedGroups.map((group) => (
            <div key={group.date} style={S.dateGroup2}>
              {/* Date header */}
              <div style={S.dateHeader}>
                <div style={S.dateHeaderLeft}>
                  <span style={S.dateChip}>{group.date}</span>
                  <span style={S.dateMeta}>
                    {group.items.length} bill{group.items.length !== 1 ? 's' : ''}
                    &nbsp;·&nbsp;Gross <strong>Rs {money(group.totals.gross)}</strong>
                    &nbsp;·&nbsp;Balance <strong style={{ color: group.totals.balance > 0 ? '#fbbf24' : '#34d399' }}>Rs {money(group.totals.balance)}</strong>
                  </span>
                </div>
                <span style={S.datePaid}>Paid Rs {money(group.totals.paid)}</span>
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
                    <Th align="center">Payments</Th>
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
                        <Td align="right"><span style={S.numVal}>Rs {money(b.actual_amount)}</span></Td>
                        <Td align="right"><span style={{ ...S.numVal, color: '#34d399' }}>Rs {money(b.paid_amount)}</span></Td>
                        <Td align="right">
                          <span style={{ ...S.numVal, color: Number(b.remaining_balance) > 0 ? '#fbbf24' : '#34d399' }}>
                            Rs {money(b.remaining_balance)}
                          </span>
                        </Td>
                        <Td align="center"><StatusBadge status={b.payment_status} /></Td>

                        {/* ── Collapse toggle ── */}
                        <Td align="center">
                          {b.payments?.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleBill(b.sync_id)}
                              style={{ ...S.toggleBtn, ...(expandedBills.has(b.sync_id) ? S.toggleBtnOpen : {}) }}
                              title={expandedBills.has(b.sync_id) ? 'Hide payments' : 'Show payments'}
                            >
                              <span style={S.toggleCount}>{b.payments.length}</span>
                              <span style={S.toggleChevron}>{expandedBills.has(b.sync_id) ? '▲' : '▼'}</span>
                            </button>
                          ) : (
                            <span style={S.noPayments}>—</span>
                          )}
                        </Td>

                        <Td align="center">
                          <div style={S.actions}>
                            <ActionBtn onClick={() => onEdit(b)}>Edit</ActionBtn>
                            <ActionBtn onClick={() => onPay(b)} accent>Pay</ActionBtn>
                            <ActionBtn onClick={() => onDelete(b)} danger>Del</ActionBtn>
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
                            <span style={S.paymentTag}>PAYMENT</span>
                          </Td>
                          <Td sub />
                          <Td sub align="center">
                            <ActionBtn onClick={() => onDelete(p, 'payment')} danger>Del</ActionBtn>
                          </Td>
                        </tr>
                      ))}
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

        <div className="page-controls" style={S.pageControls}>
          <PageBtn disabled={page === 1} onClick={() => setPage(1)}>«</PageBtn>
          <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</PageBtn>
          <span style={S.pageNum}>Page {page} / {totalPages}</span>
          <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</PageBtn>
          <PageBtn disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</PageBtn>
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
    <div style={S.totalChip}>
      <span style={S.totalChipLabel}>{label}</span>
      <span style={{ ...S.totalChipValue, ...(color ? { color } : {}) }}>{value}</span>
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
  eyebrow: { color: '#34d399', fontSize: 10, fontWeight: 900, letterSpacing: 2, display: 'block', marginBottom: 2 },
  toolbarTitle: { margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 900 },

  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 10,
    padding: '0 10px', height: 38, minWidth: 220,
  },
  searchIcon: { color: '#475569', fontSize: 18 },
  searchInput: {
    background: 'none', border: 'none', outline: 'none', color: '#e2e8f0',
    fontSize: 13, flex: 1, padding: 0, margin: 0, width: '100%',
  },
  clearBtn: {
    background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
    fontSize: 12, padding: '0 2px',
  },

  dateWrap: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  dateGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  dateLabel: { color: '#475569', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'block' },
  dateInput: {
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 10,
    color: '#e2e8f0', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
    margin: 0, width: 'auto',
  },
  dateSep: { color: '#334155', fontSize: 16, paddingBottom: 4 },

  /* Filter bar */
  filterBar: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 14,
    padding: '10px 16px', marginBottom: 12,
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#475569', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' },
  filterSelect: {
    background: '#07101f', border: '1px solid #1e293b', borderRadius: 8,
    color: '#e2e8f0', padding: '5px 10px', fontSize: 12, margin: 0, cursor: 'pointer', maxWidth: 200,
  },
  statusPills: { display: 'flex', gap: 6 },
  pill: {
    padding: '5px 14px', borderRadius: 99, border: '1px solid #1e293b',
    background: '#07101f', color: '#64748b', fontSize: 11, fontWeight: 800,
    cursor: 'pointer', transition: 'all .15s',
  },
  pillActive: { background: '#0f2a22', border: '1px solid #22c55e', color: '#34d399' },
  recordCount: { color: '#334155', fontSize: 11, marginLeft: 'auto' },

  /* Totals strip */
  totalsStrip: {
    display: 'flex', alignItems: 'center',
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 14,
    padding: '12px 20px', marginBottom: 14, gap: 0,
  },
  totalsDivider: { width: 1, background: '#1e293b', alignSelf: 'stretch', margin: '0 0' },
  totalChip: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 16px' },
  totalChipLabel: { color: '#475569', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 },
  totalChipValue: { color: '#e2e8f0', fontSize: 14, fontWeight: 900 },

  /* Table area */
  tableWrap: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' },

  empty: { textAlign: 'center', padding: '70px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#e2e8f0', fontWeight: 900, fontSize: 18, marginBottom: 6 },
  emptyText: { color: '#475569', fontSize: 13 },

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
  dateMeta: { color: '#475569', fontSize: 12 },
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
    padding: '10px 14px', color: '#475569', fontSize: 10, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #1e293b',
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
  dateSub: { color: '#334155', display: 'block', marginTop: 3, fontSize: 11 },
  supplierName: {
    color: '#f1f5f9', fontWeight: 800, display: 'block', maxWidth: 220,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  metaSub: {
    color: '#475569', display: 'block', marginTop: 3, fontSize: 11, maxWidth: 220,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  numVal: { fontWeight: 700, color: '#e2e8f0' },
  taxPct: { color: '#64748b', display: 'block', fontWeight: 700 },
  paymentArrow: { color: '#334155', marginRight: 6 },
  paymentMode: { color: '#64748b', fontWeight: 700, fontSize: 12 },
  paymentRef: { color: '#475569', fontSize: 12 },
  paymentTag: {
    fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px',
    borderRadius: 99, background: '#1a2a3a', color: '#4a9eff', border: '1px solid #1e3a5f',
  },

  actions: { display: 'flex', gap: 4, justifyContent: 'center' },
  actionBtn: {
    padding: '5px 10px', borderRadius: 8, border: '1px solid #1e293b',
    background: '#101c30', color: '#94a3b8', fontSize: 11, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  actionBtnAccent: { background: '#0a2e22', border: '1px solid #166534', color: '#34d399' },
  actionBtnDanger: { background: '#2d0e0e', border: '1px solid #7f1d1d', color: '#fb7185' },

  /* Collapse toggle */
  toggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 99, border: '1px solid #1e293b',
    background: '#0a1425', color: '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 700,
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
  pageInfo: { color: '#475569', fontSize: 12 },
  pageControls: { display: 'flex', alignItems: 'center', gap: 6 },
  pageBtn: {
    padding: '6px 12px', borderRadius: 8, border: '1px solid #1e293b',
    background: '#101c30', color: '#94a3b8', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
  },
  pageBtnDisabled: { opacity: 0.35, cursor: 'not-allowed' },
  pageNum: { color: '#64748b', fontSize: 12, padding: '0 6px' },
  pageSizeWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  pageSizeLabel: { color: '#475569', fontSize: 12 },
  pageSizeSelect: {
    background: '#0a1425', border: '1px solid #1e293b', borderRadius: 8,
    color: '#e2e8f0', padding: '5px 8px', fontSize: 12, margin: 0, cursor: 'pointer',
  },
};
