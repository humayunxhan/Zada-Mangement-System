import React from 'react';

const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct   = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

export default function SummaryView({ totals, items }) {
  /* ── Derived stats ── */
  const paidPct      = pct(totals.paid,   totals.actual);
  const balancePct   = pct(totals.balance, totals.actual);

  const byStatus = React.useMemo(() => {
    const counts = { COMPLETE: 0, PARTIAL: 0, UNPAID: 0, OVERPAID: 0 };
    items.forEach((b) => { counts[b.payment_status] = (counts[b.payment_status] || 0) + 1; });
    return counts;
  }, [items]);

  /* Per-supplier outstanding */
  const bySupplier = React.useMemo(() => {
    const map = {};
    items.forEach((b) => {
      if (!map[b.supplier_name]) map[b.supplier_name] = { name: b.supplier_name, gross: 0, paid: 0, balance: 0, count: 0 };
      map[b.supplier_name].gross   += Number(b.total_bill_amount  || 0);
      map[b.supplier_name].paid    += Number(b.paid_amount        || 0);
      map[b.supplier_name].balance += Number(b.remaining_balance  || 0);
      map[b.supplier_name].count   += 1;
    });
    return Object.values(map).sort((a, b) => b.balance - a.balance).slice(0, 8);
  }, [items]);

  const maxBalance = bySupplier[0]?.balance || 1;

  return (
    <div style={S.page}>

      {/* ── Top KPI cards ── */}
      <div className="summary-kpis" style={S.kpiRow}>
        <KpiCard label="Gross Bills"    value={`Rs ${money(totals.gross)}`}   sub={`${items.length} bill${items.length !== 1 ? 's' : ''} in range`} />
        <KpiCard label="Tax Deducted"   value={`Rs ${money(totals.tax)}`}     sub="Income tax withheld" dimmed />
        <KpiCard label="Actual Payable" value={`Rs ${money(totals.actual)}`}  sub="Net after tax" />
        <KpiCard label="Total Paid"     value={`Rs ${money(totals.paid)}`}    sub={`${paidPct}% of payable`} accent="#34d399" />
        <KpiCard label="Outstanding"    value={`Rs ${money(totals.balance)}`} sub={`${balancePct}% remaining`} accent={totals.balance > 0 ? '#fbbf24' : '#34d399'} hot={totals.balance > 0} />
      </div>

      {/* ── Payment progress bar ── */}
      {totals.actual > 0 && (
        <div style={S.progressCard}>
          <div style={S.progressHeader}>
            <span style={S.progressLabel}>Payment Progress</span>
            <span style={S.progressPct}>{paidPct}% paid</span>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${paidPct}%`, background: paidPct === 100 ? '#34d399' : '#22c55e' }} />
          </div>
          <div className="summary-legend" style={S.progressLegend}>
            <span style={S.legendItem}><span style={{ ...S.legendDot, background: '#34d399' }} />Paid — Rs {money(totals.paid)}</span>
            <span style={S.legendItem}><span style={{ ...S.legendDot, background: '#fbbf24' }} />Outstanding — Rs {money(totals.balance)}</span>
          </div>
        </div>
      )}

      {/* ── Status breakdown + Supplier breakdown ── */}
      <div className="summary-breakdown" style={S.midRow}>

        {/* Status breakdown */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardEyebrow}>BREAKDOWN</span>
            <h3 style={S.cardTitle}>By Status</h3>
          </div>
          <div style={S.statusGrid}>
            {[
              { key: 'COMPLETE', label: 'Paid',    color: '#34d399' },
              { key: 'PARTIAL',  label: 'Partial', color: '#fbbf24' },
              { key: 'UNPAID',   label: 'Unpaid',  color: '#fb7185' },
              { key: 'OVERPAID', label: 'Overpaid',color: '#a78bfa' },
            ].map(({ key, label, color }) => (
              <div key={key} style={S.statusItem}>
                <div style={{ ...S.statusBar, background: `${color}22`, border: `1px solid ${color}44` }}>
                  <div style={{ ...S.statusBarFill, width: `${pct(byStatus[key] || 0, items.length)}%`, background: color }} />
                </div>
                <div style={S.statusMeta}>
                  <span style={{ color, fontWeight: 800, fontSize: 13 }}>{byStatus[key] || 0}</span>
                  <span style={S.statusLabel}>{label}</span>
                </div>
              </div>
            ))}
          </div>
          {items.length === 0 && <div style={S.empty}>No bills in this period.</div>}
        </div>

        {/* Supplier breakdown */}
        <div style={{ ...S.card, flex: 2 }}>
          <div style={S.cardHeader}>
            <span style={S.cardEyebrow}>TOP OUTSTANDING</span>
            <h3 style={S.cardTitle}>By Supplier</h3>
          </div>
          {bySupplier.length === 0
            ? <div style={S.empty}>No data yet.</div>
            : bySupplier.map((sup) => (
              <div className="supplier-summary-row" key={sup.name} style={S.supRow}>
                <div style={S.supLeft}>
                  <span style={S.supName}>{sup.name}</span>
                  <span style={S.supMeta}>{sup.count} bill{sup.count !== 1 ? 's' : ''} · Gross Rs {money(sup.gross)}</span>
                </div>
                <div style={S.supRight}>
                  <div style={S.supBarTrack}>
                    <div style={{
                      ...S.supBarFill,
                      width: `${pct(sup.balance, maxBalance)}%`,
                      background: sup.balance === 0 ? '#34d399' : '#fbbf24',
                    }} />
                  </div>
                  <div style={S.supAmounts}>
                    <span style={{ color: '#34d399', fontWeight: 700, fontSize: 12 }}>Paid Rs {money(sup.paid)}</span>
                    <span style={{ color: sup.balance > 0 ? '#fbbf24' : '#34d399', fontWeight: 800, fontSize: 13 }}>
                      {sup.balance > 0 ? `Due Rs ${money(sup.balance)}` : '✓ Cleared'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */
function KpiCard({ label, value, sub, accent, hot, dimmed }) {
  return (
    <div style={{ ...S.kpiCard, ...(hot ? S.kpiCardHot : {}) }}>
      <span style={S.kpiLabel}>{label}</span>
      <span style={{ ...S.kpiValue, ...(accent ? { color: accent } : {}), ...(dimmed ? { color: '#64748b' } : {}) }}>
        {value}
      </span>
      <span style={S.kpiSub}>{sub}</span>
    </div>
  );
}

/* ── Styles ── */
const S = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },

  /* KPI row */
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 },
  kpiCard: {
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 16,
    padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  kpiCardHot: { borderColor: '#92400e', background: '#1a0e04' },
  kpiLabel: { color: '#475569', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 },
  kpiValue: { color: '#f1f5f9', fontSize: 22, fontWeight: 900, lineHeight: 1.2 },
  kpiSub:   { color: '#334155', fontSize: 11, marginTop: 2 },

  /* Progress */
  progressCard: {
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 16, padding: '16px 20px',
  },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel:  { color: '#64748b', fontSize: 12, fontWeight: 700 },
  progressPct:    { color: '#34d399', fontSize: 12, fontWeight: 800 },
  progressTrack:  { height: 8, background: '#1e293b', borderRadius: 99, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 99, transition: 'width .4s ease' },
  progressLegend: { display: 'flex', gap: 20, marginTop: 10 },
  legendItem:     { display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12 },
  legendDot:      { width: 8, height: 8, borderRadius: 99 },

  /* Mid row */
  midRow: { display: 'flex', gap: 16, alignItems: 'flex-start' },

  /* Generic card */
  card: {
    background: '#0d1729', border: '1px solid #1e293b', borderRadius: 16,
    padding: '18px 20px', flex: 1,
  },
  cardHeader: { marginBottom: 16 },
  cardEyebrow: { color: '#475569', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 4 },
  cardTitle:  { margin: 0, color: '#f1f5f9', fontSize: 17, fontWeight: 900 },
  empty: { color: '#334155', fontSize: 13, padding: '20px 0', textAlign: 'center' },

  /* Status breakdown */
  statusGrid: { display: 'flex', flexDirection: 'column', gap: 14 },
  statusItem: { display: 'flex', flexDirection: 'column', gap: 6 },
  statusBar:  { height: 8, borderRadius: 99, overflow: 'hidden' },
  statusBarFill: { height: '100%', borderRadius: 99 },
  statusMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { color: '#475569', fontSize: 12 },

  /* Supplier rows */
  supRow: {
    display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 14,
    marginBottom: 14, borderBottom: '1px solid #0f1e2e',
  },
  supLeft:  { flex: 1, minWidth: 0 },
  supName:  { color: '#f1f5f9', fontWeight: 800, fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  supMeta:  { color: '#334155', fontSize: 11, marginTop: 3, display: 'block' },
  supRight: { flex: 2, display: 'flex', flexDirection: 'column', gap: 6 },
  supBarTrack: { height: 6, background: '#1e293b', borderRadius: 99, overflow: 'hidden' },
  supBarFill:  { height: '100%', borderRadius: 99, transition: 'width .3s ease' },
  supAmounts:  { display: 'flex', justifyContent: 'space-between' },
};
