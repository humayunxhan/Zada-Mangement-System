import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatCard } from '../../components/StatCard';
import { api } from '../../core/api';
import { createLiveSocket } from '../../core/socket';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const subtractDays = (d, days) => {
  const res = new Date(d);
  res.setDate(res.getDate() - days);
  return res;
};

const subtractMonths = (d, months) => {
  const res = new Date(d);
  const targetMonth = res.getMonth() - months;
  res.setMonth(targetMonth);
  if (res.getMonth() > (targetMonth + 12) % 12) {
    res.setDate(0);
  }
  return res;
};

const subtractYears = (d, years) => {
  const res = new Date(d);
  res.setFullYear(res.getFullYear() - years);
  return res;
};

const PRESETS = [
  {
    id: 'today',
    label: 'Today',
    getRange: () => {
      const now = new Date();
      const t = fmt(now);
      return [t, t];
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getRange: () => {
      const y = subtractDays(new Date(), 1);
      const s = fmt(y);
      return [s, s];
    },
  },
  {
    id: 'last-3-days',
    label: 'Last 3 Days',
    getRange: () => {
      const now = new Date();
      const from = subtractDays(now, 3);
      return [fmt(from), fmt(now)];
    },
  },
  {
    id: 'last-week',
    label: 'Last Week',
    getRange: () => {
      const now = new Date();
      const from = subtractDays(now, 7);
      return [fmt(from), fmt(now)];
    },
  },
  {
    id: 'last-month',
    label: 'Last Month',
    getRange: () => {
      const now = new Date();
      const from = subtractMonths(now, 1);
      return [fmt(from), fmt(now)];
    },
  },
  {
    id: 'last-year',
    label: 'Last Year',
    getRange: () => {
      const now = new Date();
      const from = subtractYears(now, 1);
      return [fmt(from), fmt(now)];
    },
  },
];

const empty = {
  totalBills: 0,
  grossAmount: 0,
  taxDeduction: 0,
  actualPayable: 0,
  totalPaid: 0,
  outstandingBalance: 0,
  pendingBills: 0,
  overdueBills: 0,
};

export function SupplierReportsScreen() {
  const [selectedPreset, setSelectedPreset] = useState('today');
  const [range, setRange] = useState(() => {
    const [f, t] = PRESETS[0].getRange();
    return { from: f, to: t };
  });
  const [report, setReport] = useState({ summary: empty, items: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo(() => `from=${range.from}&to=${range.to}&dateType=posting`, [range.from, range.to]);

  const load = useCallback(async () => {
    try {
      setError('');
      const r = await api.supplierBills(query);
      setReport(r || { summary: empty, items: [] });
    } catch (e) {
      setError(e.message);
    }
  }, [query]);

  useEffect(() => {
    load();
    const socket = createLiveSocket();
    ['v1.supplier-bill.updated', 'v1.supplier-bill.deleted', 'v1.supplier-payment.updated', 'v1.supplier-payment.deleted', 'v1.supplier-ledger.updated'].forEach((event) =>
      socket.on(event, load)
    );
    return () => socket.disconnect();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    const [f, t] = preset.getRange();
    setRange({ from: f, to: t });
  };

  const s = { ...empty, ...(report.summary || {}) };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#34d399" />}
    >
      <Text style={styles.eyebrow}>SUPPLIER RECONCILIATION</Text>
      <Text style={styles.title}>Bills & Payments</Text>

      {/* Preset filter chips */}
      <View style={styles.presetContainer}>
        {PRESETS.map((p) => {
          const active = selectedPreset === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelectPreset(p)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Active date range display */}
      <View style={styles.rangeBadge}>
        <Text style={styles.rangeText}>
          {range.from === range.to ? `Date: ${range.from}` : `${range.from}  →  ${range.to}`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        <StatCard label="Gross Bills" value={s.grossAmount} color="#a78bfa" />
        <StatCard label="Tax Deduction" value={s.taxDeduction} color="#fbbf24" />
        <StatCard label="Actual Payable" value={s.actualPayable} color="#60a5fa" />
        <StatCard label="Total Paid" value={s.totalPaid} color="#34d399" />
        <StatCard label="Outstanding" value={s.outstandingBalance} color="#fb7185" />
        <StatCard label="Pending Credit - All Bills" value={s.supplierCreditAllBills || 0} color="#c4b5fd" />
        <StatCard label="Returns in Period" value={s.returnedInPeriod || 0} color="#93c5fd" />
        <StatCard label="Refunds in Period" value={s.refundedInPeriod || 0} color="#34d399" />
        <StatCard label="Credit Adjusted in Period" value={s.adjustedInPeriod || 0} color="#a78bfa" />
        <StatCard label="Total Bills" value={s.totalBills} color="#e2e8f0" />
        <StatCard label="Pending Bills" value={s.pendingBills} color="#f97316" />
        <StatCard label="Overdue Bills" value={s.overdueBills} color="#ef4444" />
      </View>
      <Text style={[styles.title, {fontSize:18, marginTop:20}]}>Returns & Settlements</Text>
      {(report.activity || []).map(e => <View key={e.syncId} style={{backgroundColor:'#0d1729',padding:14,borderRadius:12,marginTop:10}}>
        <Text style={{color:'#e2e8f0',fontWeight:'800'}}>{e.supplierName} / Bill {e.supplierBillNo || '-'}</Text>
        <Text style={{color:'#93c5fd',marginTop:6}}>{e.eventDate} / {e.kind === 'RETURN' ? 'Stock return' : e.kind === 'REFUND' ? 'Refund received' : 'Credit adjustment'} / Rs {Number(e.amount).toLocaleString()}</Text>
        {e.targetBillNo ? <Text style={{color:'#94a3b8',marginTop:4}}>To bill {e.targetBillNo}</Text> : null}
        <Text style={{color:'#94a3b8',marginTop:4}}>{[e.referenceNo,e.remarks].filter(Boolean).join(' / ')}</Text>
      </View>)}
      {!(report.activity || []).length && <Text style={{color:'#94a3b8',marginTop:10}}>No return or settlement activity in this period.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 18, paddingBottom: 32 },
  eyebrow: { color: '#34d399', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  title: { color: '#f8fafc', fontSize: 27, fontWeight: '900', marginTop: 4 },
  presetContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#101c30',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  chipActive: {
    backgroundColor: '#132e27',
    borderColor: '#34d399',
  },
  chipText: { color: '#64748b', fontWeight: '800', fontSize: 13 },
  chipTextActive: { color: '#34d399' },
  rangeBadge: {
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0c1626',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  rangeText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  error: { color: '#fecaca', backgroundColor: '#451a1a', padding: 10, borderRadius: 10, marginBottom: 10 },
});
