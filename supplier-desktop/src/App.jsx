import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon';
import Modal from './components/Modal';
import Feedback from './components/Feedback';
import Sidebar from './components/Sidebar';
import SummaryView from './views/SummaryView';
import AddBillView from './views/AddBillView';
import AllBillsView from './views/AllBillsView';
import ReturnsView from './views/ReturnsView';
import RecordsView from './views/RecordsView';
import UsersView from './views/UsersView';
import LoginView from './views/LoginView';
import { newSyncId } from './ids';
import { api, getSavedUser, setToken, setSavedUser } from './api';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
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
  payment_sync_id: newSyncId(),
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

  const [returning, setReturning] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank());
  const [paying, setPaying] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [payment, setPayment] = useState({
    sync_id: newSyncId(),
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
  const [loading, setLoading] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const requestSequence = useRef(0);

  // Check current user session on load
  useEffect(() => {
    async function checkAuth() {
      try {
        if (currentUser) {
          const res = await api.auth.me();
          setCurrentUser(res.user);
          setSavedUser(res.user);
        }
      } catch (e) {
        if (window.supplierAPI && currentUser && !String(e.message).includes('Session expired')) return;
        setCurrentUser(null);
        setSavedUser(null);
        setToken(null);
      } finally {
        setAuthChecking(false);
      }
    }

    checkAuth();

    function onAuthExpired() {
      setCurrentUser(null);
    }
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

  // Load bills when user is logged in
  const load = async () => {
    if (!currentUser) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const data = await api.bills.list({ from, to });
      if (sequence === requestSequence.current) { setItems(data || []); setErrorMsg(''); }
    } catch (err) {
      if (sequence === requestSequence.current) setErrorMsg(err.message || 'Could not load bills. Check the connection and try again.');
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  };

  useEffect(() => {
    if (currentUser) {
      load();
    }
  }, [from, to, currentUser]);

  const tabs = useMemo(() => {
    const list = [
      { id: 'summary', label: 'Overview', icon: 'overview' },
      { id: 'bills', label: 'Add a bill', icon: 'plus' },
      { id: 'all', label: 'All bills', icon: 'bill' },
      { id: 'returns', label: 'Returns & credits', icon: 'returns' },
    ];
    if (currentUser?.role === 'admin') {
      list.push({ id: 'users', label: 'Team access', icon: 'users' });
      list.push({ id: 'records', label: 'Backups & audit', icon: 'lock' });
    }
    return list;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const check = () => api.returns.syncStatus().then(setSyncStatus).catch(() => {});
    void check(); const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [currentUser, items]);

  const totals = useMemo(() => {
    return items.reduce(
      (s, b) => ({
        gross: s.gross + Number(b.total_bill_amount || 0),
        tax: s.tax + Number(b.tax_amount || 0),
        actual: s.actual + (Number(b.net_payable || 0)),
        paid: s.paid + Number(b.paid_amount || 0),
        balance: s.balance + Number(b.remaining_balance || 0),
        credit: s.credit + Number(b.pending_credit || 0),
        returned: s.returned + Number(b.returned_amount || 0),
        refunded: s.refunded + Number(b.refund_amount || 0),
        adjusted: s.adjusted + Number(b.credit_applied || 0),
      }),
      { gross: 0, tax: 0, actual: 0, paid: 0, balance: 0, credit: 0, returned: 0, refunded: 0, adjusted: 0 }
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

  async function save(e, acknowledged = []) {
    e?.preventDefault();
    if (savingBill) return;
    setSavingBill(true); setFormError(''); setNotice('');
    let billSaved = false;
    try {
      const payload = { ...form, sync_id: form.sync_id || newSyncId(), duplicate_acknowledged: acknowledged };
      const matches = await api.records.duplicates(payload);
      if (matches.some(b => !acknowledged.includes(b.sync_id))) { setDuplicateWarning(matches); return; }
      setDuplicateWarning(null);
      setForm(payload);
      const saved = await api.bills.save(payload);
      billSaved = true;

      // Record immediate payment if checked
      if (form.record_payment && Number(form.payment_amount) > 0 && saved?.sync_id) {
        const paymentPayload = {
          sync_id: form.payment_sync_id,
          bill_sync_id: saved.sync_id,
          payment_date: form.payment_date || form.posting_date || today(),
          amount: Number(form.payment_amount),
          payment_mode: form.payment_mode || 'COUNTER_CASH',
          reference_no: form.payment_reference_no || '',
          remarks: form.payment_remarks || (form.remarks ? `Paid with bill: ${form.remarks}` : 'Payment recorded on bill entry'),
        };

        await api.payments.add(paymentPayload);
      }

      setNotice(form.record_payment && Number(form.payment_amount) > 0 ? 'Bill and payment saved.' : 'Supplier bill saved.');
      setForm(blank());
      setActiveTab('all');
      await load();
    } catch (err) {
      setFormError(billSaved ? `Bill saved, but the payment could not be recorded. ${err.message} Your entries are kept; retry to finish the payment.` : err.message);
    } finally { setSavingBill(false); }
  }

  async function pay(e) {
    e.preventDefault();
    if (savingPayment) return;
    setSavingPayment(true); setPaymentError('');
    try {
      const paymentPayload = { ...payment, bill_sync_id: paying.sync_id };
      await api.payments.add(paymentPayload);

      setNotice('Payment recorded.');
      setPaying(null);
      setPayment({ sync_id: newSyncId(), payment_date: today(), amount: '', payment_mode: 'CHEQUE', reference_no: '', remarks: '' });
      await load();
    } catch (err) {
      setPaymentError(err.message);
    } finally { setSavingPayment(false); }
  }

  function onEditBill(b) {
    setFormError(''); setNotice('');
    setForm({
      ...blank(),
      ...b,
      record_payment: false,
      payment_amount: '',
      payment_reference_no: '',
      payment_remarks: '',
    });
    setActiveTab('bills');
    window.scrollTo(0, 0);
  }

  function onDeleteBill(record, kind = 'bill') {
    setDeleteError('');
    setConfirming({
      kind,
      id: record.sync_id,
      label: kind === 'payment' ? 'this payment' : `bill ${record.supplier_bill_no || record.voucher_no || 'entry'}`,
    });
  }

  function handleLogout() {
    if (confirm('Are you sure you want to sign out?')) {
      api.auth.logout();
      setCurrentUser(null);
    }
  }

  if (authChecking) {
    return (
      <div className="login-screen">
        <div className="login-container" style={{ textAlign: 'center' }}>
          <div className="loading-state" role="status"><span className="loading-spinner" />Opening supplier desk…</div>
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
            saving={savingBill}
            error={formError}
            onCancel={() => { setForm(blank()); setFormError(''); }}
          />
        );
      case 'all':
        return (
          <AllBillsView
            visible={visible}
            search={search}
            setSearch={setSearch}
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
            onEdit={onEditBill}
            onPay={(bill) => { setPaymentError(''); setPaying(bill); }}
            loading={loading}
            onDelete={onDeleteBill}
            onReturn={(b) => { setNotice(''); setReturning(b); setActiveTab('returns'); }}
          />
        );
      case 'returns':
        return <ReturnsView key={returning?.sync_id || 'returns'} initialBill={returning} onChanged={load} />;
      case 'records':
        return <RecordsView onChanged={load} />;
      case 'users':
        return <UsersView currentUser={currentUser} />;
      default:
        return <SummaryView totals={totals} items={items} from={from} to={to} setFrom={setFrom} setTo={setTo} onAddBill={() => { setForm(blank()); setFormError(''); setActiveTab('bills'); }} onViewBills={() => setActiveTab('all')} />;
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to content</a>
      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tab) => { setReturning(null); setFormError(''); setNotice(''); setActiveTab(tab); }}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="content-shell" id="workspace" tabIndex={-1}>
        <header className="app-header">
          <div><h1>Supplier reconciliation</h1><p>Zada Pharmacy / {window.supplierAPI ? 'Desktop workspace' : 'Shared workspace'}</p></div>
          <div className="header-tools"><span className="today-label">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })}</span>{['summary', 'all'].includes(activeTab) && <button type="button" className="icon-button" aria-label="Refresh bills" onClick={load} disabled={loading}><Icon name="refresh" className={loading ? 'is-loading' : ''} /></button>}</div>
        </header>
        {errorMsg && <Feedback>{errorMsg} <button type="button" className="quiet-button" onClick={load} disabled={loading}>Try again</button></Feedback>}
        {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}
        {syncStatus?.recoveryRequired && <Feedback>The local database needs recovery. An administrator can restore a saved backup from Backups &amp; audit before entering records.</Feedback>}
        {syncStatus && !syncStatus.recoveryRequired && (syncStatus.pending > 0 || syncStatus.error) && <Feedback tone="success">Changes saved. {syncStatus.pending} update{syncStatus.pending === 1 ? '' : 's'} waiting to reach CEO reports.{syncStatus.error ? ' Check the connection if this persists.' : ''}</Feedback>}
        {loading && !items.length && ['summary', 'all'].includes(activeTab) ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading supplier records…</div> : renderTab()}
      </main>

      {duplicateWarning && <Modal title="Possible duplicate invoice" busy={savingBill} onClose={() => setDuplicateWarning(null)}><p>This supplier already has the same invoice number. Review the existing entries before saving another bill.</p><div className="duplicate-matches">{duplicateWarning.map(b => <div key={b.sync_id}><strong>{b.supplier_name} / {b.supplier_bill_no}</strong><small>Posted {b.posting_date} · Rs {money(b.total_bill_amount)} · Voucher {b.voucher_no || '—'}</small></div>)}</div>{formError && <Feedback>{formError}</Feedback>}<div className="dialog-actions"><button disabled={savingBill} onClick={() => setDuplicateWarning(null)}>Go back</button><button className="primary" disabled={savingBill} onClick={() => save(null,duplicateWarning.map(b => b.sync_id))}>{savingBill?'Saving…':'Save anyway'}</button></div></Modal>}
      {paying && <Modal title="Record payment" onClose={() => setPaying(null)} busy={savingPayment}>
        <form onSubmit={pay}>
          <p className="dialog-description">{paying.supplier_name} / Bill {paying.supplier_bill_no || paying.voucher_no || '—'}</p>
          <div className="dialog-balance"><span>Remaining payable</span><strong>Rs {money(paying.remaining_balance)}</strong></div>
          <fieldset disabled={savingPayment} className="dialog-fields">
            <div className="field-grid"><label>Payment date<input autoFocus type="date" required value={payment.payment_date} onChange={e => setPayment(p => ({ ...p, payment_date: e.target.value }))} /></label><label>Amount (Rs)<input type="number" min="0.01" step="0.01" max={paying.remaining_balance} required value={payment.amount} onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} /></label></div>
            <label>Payment method<select value={payment.payment_mode} onChange={e => setPayment(p => ({ ...p, payment_mode: e.target.value }))}>{[['CHEQUE','Cheque'],['ONLINE_TRANSFER','Bank transfer'],['COUNTER_CASH','Counter cash'],['CASH_FROM_AFTAB','Cash from Aftab'],['OTHER','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Reference or cheque number<input maxLength={100} value={payment.reference_no} onChange={e => setPayment(p => ({ ...p, reference_no: e.target.value }))} /></label>
            <label>Remarks<textarea value={payment.remarks} onChange={e => setPayment(p => ({ ...p, remarks: e.target.value }))} /></label>
          </fieldset>
          {paymentError && <Feedback>{paymentError}</Feedback>}
          <div className="dialog-actions"><button type="button" onClick={() => setPaying(null)} disabled={savingPayment}>Cancel</button><button className="primary" disabled={savingPayment}>{savingPayment ? 'Saving payment…' : 'Save payment'}</button></div>
        </form>
      </Modal>}
      {confirming && <Modal title="Delete record?" onClose={() => setConfirming(null)} busy={deleting}>
        <p className="dialog-description">Delete {confirming.label}? The balance and payment history will be recalculated.</p>
        {deleteError && <Feedback>{deleteError}</Feedback>}
        <div className="dialog-actions"><button onClick={() => setConfirming(null)} disabled={deleting}>Keep record</button><button className="danger" disabled={deleting} onClick={async () => {
          if (deleting) return;
          setDeleting(true); setDeleteError('');
          try {
            if (confirming.kind === 'bill') await api.bills.delete(confirming.id); else await api.payments.delete(confirming.id);
            setConfirming(null); setNotice('Record deleted.'); await load();
          } catch (e) { setDeleteError(e.message); } finally { setDeleting(false); }
        }}>{deleting ? 'Deleting…' : 'Delete record'}</button></div>
      </Modal>}
    </div>
  );
}
