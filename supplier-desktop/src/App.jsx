import DeveloperCredits from './components/DeveloperCredits';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import Sidebar from './components/Sidebar';
import InstallApp from './components/InstallApp';
import AppIcon from './components/AppIcon';
import SummaryView from './views/SummaryView';
import AddBillView from './views/AddBillView';
import AllBillsView from './views/AllBillsView';
import UsersView from './views/UsersView';
import LoginView from './views/LoginView';
import { api, getSavedUser, setToken, setSavedUser } from './api';

const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const blank = () => ({
  posting_date: today(),
  bill_date: today(),
  supplier_name: '',
  supplier_bill_no: '',
  voucher_no: '',
  total_bill_amount: '',
  tax_percent: '0',
  category: 'PAYABLE',
  remarks: '',
  record_payment: false,
  payment_date: today(),
  payment_amount: '',
  payment_mode: 'COUNTER_CASH',
  payment_reference_no: '',
  payment_remarks: '',
});

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getSavedUser());
  const [authChecking, setAuthChecking] = useState(true);

  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank());
  const [paying, setPaying] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [payment, setPayment] = useState({
    payment_date: today(),
    amount: '',
    payment_mode: 'CHEQUE',
    reference_no: '',
    remarks: '',
  });
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingBillId = useRef(null);
  const pendingPaymentId = useRef(null);
  const loadVersion = useRef(0);
  const modalRef = useRef(null);
  const [formBaseline, setFormBaseline] = useState(() => JSON.stringify(blank()));
  const dirty = JSON.stringify(form) !== formBaseline;

  function resetForm() {
    const next = blank(); setForm(next); setFormBaseline(JSON.stringify(next));
    pendingBillId.current = null; pendingPaymentId.current = null;
  }
  function navigate(tab) {
    if (savingRef.current) return;
    if (activeTab === 'bills' && dirty && tab !== 'bills' && !confirm('Leave this form? Unsaved changes will be discarded.')) return;
    if (activeTab === 'bills' && tab !== 'bills') resetForm();
    setActiveTab(tab); setErrorMsg(''); window.scrollTo(0, 0);
  }
  useEffect(() => {
    const connect = () => setOnline(navigator.onLine);
    window.addEventListener('online', connect); window.addEventListener('offline', connect);
    return () => { window.removeEventListener('online', connect); window.removeEventListener('offline', connect); };
  }, []);
  useEffect(() => {
    if (!dirty && !paying && !saving) return;
    const guard = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, paying, saving]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!paying && !confirming) return;
    const previousFocus = document.activeElement;
    const modal = modalRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal?.focus();
    function trap(event) {
      if (event.key !== 'Tab' || !modal) return;
      const controls = [...modal.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.matches(':disabled'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus(); }
    }
    modal?.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = previousOverflow; modal?.removeEventListener('keydown', trap); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [paying, confirming]);

  // Check current user session on load
  useEffect(() => {
    async function checkAuth() {
      try {
        if (currentUser) {
          const res = await api.auth.me();
          setCurrentUser(res.user);
          setSavedUser(res.user);
        }
      } catch {
        setCurrentUser(null);
        setSavedUser(null);
        setToken(null);
      } finally {
        setAuthChecking(false);
      }
    }

    checkAuth();

    function onAuthExpired() {
      setCurrentUser(null); setItems([]); resetForm(); setPaying(null); setConfirming(null); setSearch(''); setNotice(''); setActiveTab('summary'); loadVersion.current++;
    }
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

  // Load bills when user is logged in
  const load = async () => {
    if (!currentUser) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      setErrorMsg('');
      const data = await api.bills.list({ from, to });
      if (version === loadVersion.current) setItems(data || []);
    } catch (err) {
      console.error('Failed to load bills:', err);
      // Fallback to electron API if offline / dev electron
      if (window.supplierAPI) {
        try {
          const fallbackData = await window.supplierAPI.list({ from, to });
          setItems(fallbackData || []);
          return;
        } catch {
          // Ignore
        }
      }
      if (version === loadVersion.current) setErrorMsg(err.message || 'Unable to load records. Check your connection and retry.');
    } finally { if (version === loadVersion.current) setLoading(false); }
  };

  useEffect(() => {
    if (currentUser) {
      load();
    }
  }, [from, to, currentUser, online]);

  const tabs = useMemo(() => {
    const list = [
      { id: 'summary', label: 'Summary', icon: '📊' },
      { id: 'bills', label: 'Add Bill(s)', icon: '📝' },
      { id: 'all', label: 'All Bills', icon: '📑' },
      { id: 'payments', label: 'Payments', icon: '↗' },
      { id: 'more', label: 'Account & App', icon: '☰' },
    ];
    if (currentUser?.role === 'admin') {
      list.push({ id: 'users', label: 'Users & Staff', icon: '👥' });
    }
    return list;
  }, [currentUser]);

  const totals = useMemo(() => {
    return items.reduce(
      (s, b) => ({
        gross: s.gross + Number(b.total_bill_amount || 0),
        tax: s.tax + Number(b.tax_amount || 0),
        actual: s.actual + (b.category === 'PAYABLE' ? Number(b.actual_amount || 0) : 0),
        paid: s.paid + Number(b.paid_amount || 0),
        balance: s.balance + Number(b.remaining_balance || 0),
      }),
      { gross: 0, tax: 0, actual: 0, paid: 0, balance: 0 }
    );
  }, [items]);

  const visible = items.filter((x) =>
    `${x.supplier_name || ''} ${x.supplier_bill_no || ''} ${x.voucher_no || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const suppliers = useMemo(
    () => Array.from(new Set(items.map((x) => x.supplier_name).filter(Boolean))).sort(),
    [items]
  );

  async function save(e) {
    e.preventDefault();
    if (savingRef.current || !online) return;
    savingRef.current = true; setSaving(true); setErrorMsg('');
    pendingBillId.current ||= form.sync_id || crypto.randomUUID();
    const payload = { ...form, sync_id: pendingBillId.current };
    let billSaved = false;
    try {
      let saved;
      try { saved = await api.bills.save(payload); }
      catch (err) { if (window.supplierAPI) saved = await window.supplierAPI.saveBill(payload); else throw err; }
      billSaved = true;
      setForm(prev => ({ ...prev, sync_id: saved.sync_id }));
      if (form.record_payment && Number(form.payment_amount) > 0 && saved?.sync_id) {
        pendingPaymentId.current ||= crypto.randomUUID();
        const paymentPayload = {
          sync_id: pendingPaymentId.current, bill_sync_id: saved.sync_id,
          payment_date: form.payment_date || form.posting_date || today(),
          amount: Number(form.payment_amount), payment_mode: form.payment_mode || 'COUNTER_CASH',
          reference_no: form.payment_reference_no || '', remarks: form.payment_remarks || 'Payment recorded on bill entry',
        };
        try { await api.payments.add(paymentPayload); }
        catch (err) { if (window.supplierAPI) await window.supplierAPI.addPayment(paymentPayload); else throw err; }
      }
      resetForm(); setActiveTab('all'); setNotice('Bill saved successfully.'); window.scrollTo(0, 0); await load();
    } catch (err) {
      setErrorMsg((billSaved ? 'Bill saved, but payment could not be confirmed. Retry this form to finish safely. ' : 'Could not confirm save. Retry this form safely. ') + err.message);
    } finally { savingRef.current = false; setSaving(false); }
  }

  async function pay(e) {
    e.preventDefault();
    if (savingRef.current || !online) return;
    savingRef.current = true; setSaving(true); setErrorMsg('');
    pendingPaymentId.current ||= crypto.randomUUID();
    try {
      const paymentPayload = { ...payment, sync_id: pendingPaymentId.current, bill_sync_id: paying.sync_id };
      try { await api.payments.add(paymentPayload); }
      catch (err) { if (window.supplierAPI) await window.supplierAPI.addPayment(paymentPayload); else throw err; }
      setPaying(null); pendingPaymentId.current = null;
      setPayment({ payment_date: today(), amount: '', payment_mode: 'CHEQUE', reference_no: '', remarks: '' });
      setNotice('Payment recorded successfully.'); await load();
    } catch (err) { setErrorMsg('Could not confirm payment. Retry safely. ' + err.message); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function openPayment(bill) {
    pendingPaymentId.current = null; setErrorMsg('');
    setPayment({ payment_date: today(), amount: '', payment_mode: 'CHEQUE', reference_no: '', remarks: '' });
    setPaying(bill);
  }
  function closePayment() {
    if (savingRef.current) return;
    if ((payment.amount || payment.reference_no || payment.remarks) && !confirm('Discard this payment form?')) return;
    setPaying(null); setErrorMsg('');
  }

  function onEditBill(b) {
    const next = {
      ...blank(),
      ...b,
      record_payment: false,
      payment_amount: '',
      payment_reference_no: '',
      payment_remarks: '',
    };
    setForm(next); setFormBaseline(JSON.stringify(next)); pendingBillId.current = b.sync_id; pendingPaymentId.current = null;
    setActiveTab('bills');
    window.scrollTo(0, 0);
  }

  function onDeleteBill(record, kind = 'bill') {
    setConfirming({
      kind,
      id: record.sync_id,
      label: kind === 'payment' ? 'this payment' : `bill ${record.supplier_bill_no || record.voucher_no || 'entry'}`,
    });
  }

  function handleLogout() {
    if (!savingRef.current && confirm(dirty ? 'Sign out and discard unsaved changes?' : 'Are you sure you want to sign out?')) {
      api.auth.logout();
      setCurrentUser(null); setItems([]); resetForm(); setPaying(null); setConfirming(null); setSearch(''); setNotice(''); loadVersion.current++; setActiveTab('summary');
    }
  }

  if (authChecking) {
    return (
      <div className="login-screen">
        <div className="login-container" style={{ textAlign: 'center' }}>
          <p style={{ color: '#34d399', fontWeight: 'bold' }}>Loading Zada SPMS...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  function renderTab() {
    switch (activeTab) {
      case 'bills':
        return (
          <AddBillView
            form={form}
            setForm={setForm}
            suppliers={suppliers}
            onSave={save}
            saving={saving} online={online}
            onCancel={() => { if (!dirty || confirm('Discard unsaved changes?')) resetForm(); }}
          />
        );
      case 'payments':
      case 'all':
        return (
          <AllBillsView
            visible={activeTab === 'payments' ? visible.filter(b => Number(b.remaining_balance) > 0) : visible}
            title={activeTab === 'payments' ? 'Record a payment' : 'Bills & Payments'}
            search={search}
            setSearch={setSearch}
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
            onEdit={onEditBill}
            onPay={openPayment}
            onDelete={onDeleteBill}
          />
        );
      case 'more':
        return <section className="account-panel">
          <span className="section-kicker">YOUR WORKSPACE</span><h2>{currentUser.full_name}</h2>
          <p>@{currentUser.username} · {currentUser.role}</p>
          <InstallApp />
          {currentUser.role === 'admin' && <button onClick={() => navigate('users')}>Manage users & staff →</button>}
          <button className="danger" onClick={handleLogout}>Sign out</button>
          <p className="muted">Bills and payments are saved online. Connect to the internet before making changes.</p>
        </section>;
      case 'users':
        return <UsersView currentUser={currentUser} />;
      default:
        return <SummaryView totals={totals} items={items} />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        onChange={navigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="content-shell">
        <header className="app-header">
          <div><small>ZADA PHARMACY</small><h1>{({ summary: 'Overview', all: 'Bills & payments', bills: 'Supplier bill', payments: 'Payments', more: 'Your account', users: 'Users & staff' })[activeTab]}</h1><p className="desktop-subtitle">Your supplier desk, always in reach.</p></div>
          <button className="header-add" onClick={() => navigate('bills')} aria-label="Add bill"><AppIcon name="bills" /><span>Add bill</span></button>
        </header>
        {!online && <div className="connection-banner" role="status">You’re offline. Reconnect to refresh records or save changes.</div>}
        {loading && <div className="loading-status" role="status">Refreshing records…</div>}
        {notice && <div className="notice" role="status">✓ {notice}</div>}
        {activeTab === 'summary' && <div className="dashboard-actions"><div><span className="section-kicker">THIS PERIOD</span><p>{from} — {to}</p></div><button className="primary" onClick={() => navigate('bills')}>+ New bill</button><button onClick={() => navigate('payments')}>Record payment ↗</button></div>}

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: 18 }}>
            ⚠️ {errorMsg} <button type="button" onClick={load}>Refresh</button>
          </div>
        )}

        {renderTab()}
        <DeveloperCredits />
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[['summary','Home'],['all','Bills'],['payments','Pay'],['more','More']].map(([id,label]) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}><AppIcon name={id} /><span>{label}</span></button>)}
      </nav>

      {paying && (
        <div className="overlay">
          <form ref={modalRef} tabIndex={-1} className="modal payment-modal" onSubmit={pay} role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <fieldset disabled={saving || !online}>
            <h2 id="payment-title">Record Payment</h2>
            {errorMsg && <p className="alert-error" role="alert">{errorMsg}</p>}
            {!online && <p role="status">Reconnect to save this payment.</p>}
            <p>
              {paying.supplier_name} · Balance Rs {money(paying.remaining_balance)}
            </p>
            <label>
              Payment Date
              <input
                type="date"
                value={payment.payment_date}
                onChange={(e) => setPayment((prev) => ({ ...prev, payment_date: e.target.value }))}
              />
            </label>
            <label>
              Amount
              <input
                type="number" inputMode="decimal" step="0.01" min="0.01"
                max={paying.remaining_balance}
                required
                value={payment.amount}
                onChange={(e) => setPayment((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <label>
              Mode
              <select
                value={payment.payment_mode}
                onChange={(e) => setPayment((prev) => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option>CHEQUE</option>
                <option>ONLINE_TRANSFER</option>
                <option>COUNTER_CASH</option>
                <option>CASH_FROM_AFTAB</option>
                <option>OTHER</option>
              </select>
            </label>
            <label>
              Reference / Cheque No.
              <input
                value={payment.reference_no}
                onChange={(e) => setPayment((prev) => ({ ...prev, reference_no: e.target.value }))}
              />
            </label>
            <label>
              Remarks
              <textarea
                value={payment.remarks}
                onChange={(e) => setPayment((prev) => ({ ...prev, remarks: e.target.value }))}
              />
            </label>
            <button className="primary">{saving ? 'Saving…' : 'Save payment'}</button>
            </fieldset>
            <button type="button" disabled={saving} onClick={closePayment}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {confirming && (
        <div className="overlay">
          <div ref={modalRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">Confirm deletion</h2>
            <p>
              Are you sure you want to delete {confirming.label}? The record will be removed from your active records.
            </p>
            <button
              className="danger"
              onClick={async () => {
                try {
                  if (confirming.kind === 'bill') {
                    await api.bills.delete(confirming.id);
                  } else {
                    await api.payments.delete(confirming.id);
                  }
                } catch (delErr) {
                  if (window.supplierAPI) {
                    confirming.kind === 'bill'
                      ? await window.supplierAPI.deleteBill(confirming.id)
                      : await window.supplierAPI.deletePayment(confirming.id);
                  } else {
                    alert(delErr.message);
                  }
                }
                setConfirming(null);
                await load();
              }}
            >
              Yes, delete
            </button>
            <button onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
