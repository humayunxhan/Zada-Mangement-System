import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../core/api';
import { createLiveSocket } from '../../core/socket';

/* ── Date helpers ── */
const fmt = (d) => d.toISOString().slice(0, 10);
const todayStr = () => fmt(new Date());
const money = (v) => `Rs ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PRESETS = [
  {
    label: 'Today',
    range: () => { const d = todayStr(); return [d, d]; },
  },
  {
    label: 'This Week',
    range: () => {
      const now = new Date();
      const day = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return [fmt(mon), todayStr()];
    },
  },
  {
    label: 'This Month',
    range: () => {
      const now = new Date();
      return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, todayStr()];
    },
  },
  {
    label: 'Last Month',
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return [fmt(first), fmt(last)];
    },
  },
  {
    label: 'Last 3M',
    range: () => {
      const now = new Date();
      const from = new Date(now); from.setMonth(from.getMonth() - 3);
      return [fmt(from), todayStr()];
    },
  },
];

const STATUS_META = [
  { key: 'all',     label: 'All',     color: '#94a3b8' },
  { key: 'complete', label: 'Paid',   color: '#34d399' },
  { key: 'partial', label: 'Partial', color: '#fbbf24' },
  { key: 'unpaid',  label: 'Unpaid',  color: '#fb7185' },
  { key: 'returned', label: 'Returned', color: '#93c5fd' },
  { key: 'credit', label: 'Credit Pending', color: '#c4b5fd' },
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
];

export function PastBillsScreen() {
  const [from, setFrom]             = useState(() => PRESETS[2].range()[0]);
  const [to, setTo]                 = useState(() => PRESETS[2].range()[1]);
  const [activePreset, setActivePreset] = useState('This Month');
  const [dateType, setDateType]     = useState('posting');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [bills, setBills]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const query = useMemo(
    () => `from=${from}&to=${to}&dateType=${dateType}`,
    [from, to, dateType],
  );

  const load = useCallback(async () => {
    try {
      setError('');
      const result = await api.supplierBills(query);
      setBills(result?.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
    const socket = createLiveSocket();
    ['v1.supplier-bill.updated', 'v1.supplier-bill.deleted', 'v1.supplier-payment.updated', 'v1.supplier-payment.deleted', 'v1.supplier-ledger.updated']
      .forEach((ev) => socket.on(ev, load));
    return () => socket.disconnect();
  }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const applyPreset = (preset) => {
    const [f, t] = preset.range();
    setFrom(f); setTo(t); setActivePreset(preset.label);
  };

  const handleFromChange = (v) => { setFrom(v); setActivePreset(null); };
  const handleToChange   = (v) => { setTo(v);   setActivePreset(null); };

  const filtered = useMemo(() => {
    let list = bills;
    if (statusFilter === 'credit') list = list.filter(b => b.pendingCredit > 0);
    else if (statusFilter === 'returned') list = list.filter(b => b.returnedAmount > 0);
    else if (statusFilter !== 'all') list = list.filter((b) => (b.paymentStatus || '').toLowerCase() === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.supplierName || '').toLowerCase().includes(q) ||
          (b.supplierBillNo || '').toLowerCase().includes(q) ||
          (b.voucherNo || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [bills, statusFilter, search]);

  const totals = useMemo(() => ({
    gross:   filtered.reduce((s, b) => s + Number(b.totalBillAmount || 0), 0),
    payable: filtered.reduce((s, b) => s + Number(b.netPayable      || 0), 0),
    paid:    filtered.reduce((s, b) => s + Number(b.paidAmount      || 0), 0),
    balance: filtered.reduce((s, b) => s + Number(b.remainingBalance|| 0), 0),
  }), [filtered]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.syncId || item._id || String(Math.random())}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#34d399" />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* ── Page title ── */}
            <View style={styles.pageHeader}>
              <View>
                <Text style={styles.eyebrow}>SUPPLIER BILLS</Text>
                <Text style={styles.title}>Past Bills</Text>
              </View>
              {loading && !refreshing && <ActivityIndicator color="#34d399" size="small" />}
            </View>

            {/* ── Filter card ── */}
            <View style={styles.filterCard}>

              {/* Date-type toggle pill */}
              <View style={styles.pillWrap}>
                <TouchableOpacity
                  onPress={() => setDateType('posting')}
                  style={[styles.pillHalf, dateType === 'posting' && styles.pillHalfActive]}
                >
                  <Text style={[styles.pillText, dateType === 'posting' && styles.pillTextActive]}>
                    Posting Date
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDateType('bill')}
                  style={[styles.pillHalf, dateType === 'bill' && styles.pillHalfActive]}
                >
                  <Text style={[styles.pillText, dateType === 'bill' && styles.pillTextActive]}>
                    Bill Date
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick presets */}
              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    onPress={() => applyPreset(p)}
                    style={[styles.preset, activePreset === p.label && styles.presetActive]}
                  >
                    <Text style={[styles.presetText, activePreset === p.label && styles.presetTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* From / To date inputs */}
              <View style={styles.dateRow}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateLabel}>From</Text>
                  <TextInput
                    value={from}
                    onChangeText={handleFromChange}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#334155"
                    style={styles.dateInput}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
                <View style={styles.dateSep}>
                  <Text style={styles.dateSepText}>→</Text>
                </View>
                <View style={styles.dateBox}>
                  <Text style={styles.dateLabel}>To</Text>
                  <TextInput
                    value={to}
                    onChangeText={handleToChange}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#334155"
                    style={styles.dateInput}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Search */}
              <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Supplier name, bill no, voucher…"
                  placeholderTextColor="#334155"
                  style={styles.searchInput}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
                    <Text style={styles.clearText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Status chips */}
              <View style={styles.statusRow}>
                {STATUS_META.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setStatusFilter(s.key)}
                    style={[
                      styles.statusChip,
                      statusFilter === s.key && { backgroundColor: s.color + '22', borderColor: s.color },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: statusFilter === s.key ? s.color : '#334155' }]} />
                    <Text style={[styles.statusChipText, statusFilter === s.key && { color: s.color }]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Error ── */}
            {error ? <Text style={styles.error}>⚠ {error}</Text> : null}

            {/* ── Summary bar ── */}
            {filtered.length > 0 && (
              <View style={styles.summaryBar}>
                <SummaryItem label="Gross"   value={money(totals.gross)} />
                <View style={styles.summaryDivider} />
                <SummaryItem label="Payable" value={money(totals.payable)} />
                <View style={styles.summaryDivider} />
                <SummaryItem label="Paid"    value={money(totals.paid)}    color="#34d399" />
                <View style={styles.summaryDivider} />
                <SummaryItem label="Balance" value={money(totals.balance)} color={totals.balance > 0 ? '#fbbf24' : '#34d399'} />
              </View>
            )}

            <Text style={styles.count}>
              {filtered.length} bill{filtered.length !== 1 ? 's' : ''}
              {bills.length !== filtered.length ? ` (filtered from ${bills.length})` : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🗂</Text>
              <Text style={styles.emptyTitle}>No bills found</Text>
              <Text style={styles.emptyText}>Try adjusting the date range or filters.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <BillRow
            item={item}
            expanded={expandedId === (item.syncId || item._id)}
            onPress={() =>
              setExpandedId(
                expandedId === (item.syncId || item._id) ? null : (item.syncId || item._id),
              )
            }
          />
        )}
      />
    </View>
  );
}

/* ── Bill row ── */
function BillRow({ item, expanded, onPress }) {
  const statusKey   = (item.paymentStatus || 'UNPAID').toLowerCase();
  const meta        = STATUS_META.find((s) => s.key === statusKey) || STATUS_META[3];
  const statusColor = meta.color;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.supplierName} numberOfLines={1}>
            {item.supplierName || 'Unknown Supplier'}
          </Text>
          <Text style={styles.billMeta}>
            {[
              item.supplierBillNo && `Bill ${item.supplierBillNo}`,
              item.voucherNo      && `Voucher ${item.voucherNo}`,
            ].filter(Boolean).join('  ·  ') || 'No bill reference'}
          </Text>
          <Text style={styles.billDate}>{formatDate(item.billDate || item.postingDate)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.amount}>{money(item.netPayable ?? item.actualAmount ?? 0)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '1a', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.paymentStatus || 'UNPAID'}
            </Text>
          </View>
        </View>
      </View>

      {expanded && (
        <View style={styles.detail}>
          <DetailRow label="Gross Amount"  value={money(item.totalBillAmount || 0)} />
          <DetailRow label="Tax Deduction" value={money(item.taxAmount       || 0)} />
          <DetailRow label="Actual Payable"value={money(item.netPayable ?? item.actualAmount ?? 0)} />
          <DetailRow label="Paid"          value={money(item.paidAmount      || 0)} color="#34d399" />
          <DetailRow
            label="Balance"
            value={money(item.remainingBalance || 0)}
            color={Number(item.remainingBalance || 0) > 0 ? '#fbbf24' : '#34d399'}
          />
          {item.returnedAmount > 0 && <DetailRow label={item.returnStatus === 'RETURNED' ? 'Returned' : 'Partially Returned'} value={`${formatDate(item.lastReturnDate)} / ${money(item.returnedAmount)}`} color="#93c5fd" />}
          {item.pendingCredit > 0 && <DetailRow label="Credit Pending" value={money(item.pendingCredit)} color="#c4b5fd" />}
          {item.refundAmount > 0 && <DetailRow label="Refunds Received" value={money(item.refundAmount)} color="#34d399" />}
          {item.creditApplied > 0 && <DetailRow label="Credit Applied" value={money(item.creditApplied)} />}
          {item.creditUsed > 0 && <DetailRow label="Credit Used on Other Bills" value={money(item.creditUsed)} />}
          {(item.ledgerEvents || []).map(e => <View key={e.syncId} style={{paddingTop:8,borderTopWidth:1,borderColor:'#1e293b'}}>
            <Text style={{color:'#93c5fd',fontSize:12}}>{e.eventDate} / {e.kind} / {money(e.amount)}</Text>
            <Text style={{color:'#94a3b8',fontSize:12,marginTop:4}}>{[e.paymentMode,e.referenceNo,e.remarks].filter(Boolean).join(' / ')}</Text>
          </View>)}
          {item.dueDate  && <DetailRow label="Due Date" value={formatDate(item.dueDate)} />}
          {item.category && <DetailRow label="Category" value={item.category} />}
          {item.remarks  && <DetailRow label="Remarks"  value={item.remarks} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ── Helpers ── */
function SummaryItem({ label, value, color }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color && { color }]}>{value}</Text>
    </View>
  );
}
function DetailRow({ label, value, color }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, color && { color }]}>{value}</Text>
    </View>
  );
}
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString([], { dateStyle: 'medium' });
}

/* ── Styles ── */
const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },

  /* Page header */
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  eyebrow: { color: '#34d399', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '900', marginTop: 2 },

  /* Filter card */
  filterCard: {
    backgroundColor: '#0d1729',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },

  /* Date-type pill toggle */
  pillWrap: {
    flexDirection: 'row',
    backgroundColor: '#07101f',
    borderRadius: 14,
    padding: 4,
  },
  pillHalf: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  pillHalfActive: { backgroundColor: '#1a3a35' },
  pillText: { color: '#475569', fontWeight: '800', fontSize: 13 },
  pillTextActive: { color: '#34d399' },

  /* Quick presets */
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#07101f',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  presetActive: { backgroundColor: '#0f2a40', borderColor: '#3b82f6' },
  presetText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  presetTextActive: { color: '#93c5fd' },

  /* Date row */
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBox: { flex: 1 },
  dateLabel: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  dateInput: {
    color: '#e2e8f0',
    backgroundColor: '#07101f',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 11,
    fontSize: 14,
    fontWeight: '700',
  },
  dateSep: { paddingTop: 18 },
  dateSepText: { color: '#334155', fontSize: 18 },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07101f',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: '#e2e8f0', paddingVertical: 11, fontSize: 13 },
  clearBtn: { padding: 4 },
  clearText: { color: '#475569', fontSize: 14 },

  /* Status chips */
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#07101f',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { color: '#475569', fontSize: 11, fontWeight: '800' },

  /* Error */
  error: { color: '#fecaca', backgroundColor: '#451a1a', padding: 12, borderRadius: 12, marginBottom: 10 },

  /* Summary bar */
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#0d1729',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  summaryDivider: { width: 1, backgroundColor: '#1e293b' },
  summaryLabel: { color: '#475569', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center' },
  summaryValue: { color: '#e2e8f0', fontWeight: '900', marginTop: 5, fontSize: 12, textAlign: 'center' },

  count: { color: '#334155', fontSize: 11, marginBottom: 10 },

  /* Empty */
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#e2e8f0', fontWeight: '900', fontSize: 17 },
  emptyText: { color: '#475569', marginTop: 6, fontSize: 13 },

  /* Bill card */
  card: { backgroundColor: '#0d1729', borderWidth: 1, borderColor: '#1e293b', borderRadius: 18, padding: 16, marginBottom: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  supplierName: { color: '#f1f5f9', fontSize: 16, fontWeight: '900' },
  billMeta: { color: '#475569', fontSize: 11, marginTop: 4 },
  billDate: { color: '#334155', fontSize: 11, marginTop: 3 },
  amount: { color: '#e2e8f0', fontWeight: '900', fontSize: 16 },
  statusBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },

  /* Expanded detail */
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e293b', gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: '#475569', fontSize: 12 },
  detailValue: { color: '#cbd5e1', fontWeight: '800', fontSize: 12 },
});
