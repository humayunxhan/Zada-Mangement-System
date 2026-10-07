import React from 'react';

const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function AddBillView({ form, setForm, suppliers = [], onSave, onCancel, saving = false, online = true }) {
  const gross = Number(form.total_bill_amount || 0);
  const taxPct = Number(form.tax_percent || 0);
  const taxAmount = (gross * taxPct) / 100;
  const actualPayable = Math.max(0, gross - taxAmount);

  const paymentAmount = Number(form.payment_amount || 0);
  const remaining = Math.max(0, actualPayable - paymentAmount);

  const setFullPayment = () => {
    setForm((prev) => ({ ...prev, payment_amount: String(actualPayable) }));
  };

  const setHalfPayment = () => {
    setForm((prev) => ({ ...prev, payment_amount: String(Math.round(actualPayable / 2)) }));
  };

  const clearPayment = () => {
    setForm((prev) => ({ ...prev, payment_amount: '' }));
  };

  const handleTogglePayment = () => {
    setForm((prev) => {
      const nextRecord = !prev.record_payment;
      return {
        ...prev,
        record_payment: nextRecord,
        // If enabling and amount is empty, prefill with full payable amount
        payment_amount: nextRecord && !prev.payment_amount && actualPayable > 0 ? String(actualPayable) : prev.payment_amount,
        payment_date: prev.payment_date || prev.posting_date || new Date().toISOString().slice(0, 10),
      };
    });
  };

  return (
    <form className="bill-form" style={S.container} onSubmit={onSave}>
      <fieldset disabled={saving}>
      {/* ── Header ── */}
      <div style={S.header}>
        <span style={S.eyebrow}>SUPPLIER INVOICE</span>
        <h2 style={S.title}>{form.sync_id ? 'Edit Supplier Bill' : 'New Supplier Bill'}</h2>
        <p style={S.subtitle}>
          Enter invoice details and optionally record an immediate payment transaction.
        </p>
      </div>

      {/* ── Bill Details Card ── */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Bill Information</span>
        </div>

        <div className="bill-form-grid" style={S.grid}>
          {/* Posting Date */}
          <div style={S.field}>
            <label htmlFor="bill-field-1" style={S.label}>Posting Date</label>
            <input id="bill-field-1"
              type="date"
              style={S.input}
              value={form.posting_date || ''}
              onChange={(e) => setForm((p) => ({ ...p, posting_date: e.target.value }))}
              required
            />
          </div>

          {/* Bill Date */}
          <div style={S.field}>
            <label htmlFor="bill-field-2" style={S.label}>Bill Date</label>
            <input id="bill-field-2"
              type="date"
              style={S.input}
              value={form.bill_date || ''}
              onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))}
              required
            />
          </div>

          {/* Supplier Name with Datalist */}
          <div style={{ ...S.field, gridColumn: 'span 2' }}>
            <label htmlFor="bill-field-3" style={S.label}>Supplier / Distributor Name *</label>
            <input id="bill-field-3"
              list="suppliers-datalist"
              style={S.input}
              placeholder="e.g. Brooks Pharma, Helix, Zada Distributors"
              value={form.supplier_name || ''}
              onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
              required
            />
            <datalist id="suppliers-datalist">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Supplier Bill No */}
          <div style={S.field}>
            <label htmlFor="bill-field-4" style={S.label}>Supplier Bill No.</label>
            <input id="bill-field-4"
              style={S.input}
              placeholder="e.g. INV-90412"
              value={form.supplier_bill_no || ''}
              onChange={(e) => setForm((p) => ({ ...p, supplier_bill_no: e.target.value }))}
            />
          </div>

          {/* Abuzar Voucher No */}
          <div style={S.field}>
            <label htmlFor="bill-field-5" style={S.label}>Abuzar Voucher No.</label>
            <input id="bill-field-5"
              style={S.input}
              placeholder="e.g. V-1044"
              value={form.voucher_no || ''}
              onChange={(e) => setForm((p) => ({ ...p, voucher_no: e.target.value }))}
            />
          </div>

          {/* Total Bill Amount */}
          <div style={S.field}>
            <label htmlFor="bill-field-6" style={S.label}>Total Bill Amount (Gross) *</label>
            <input id="bill-field-6"
              type="number" inputMode="decimal" min="0"
              step="any"
              style={{ ...S.input, fontWeight: '700', fontSize: 15 }}
              placeholder="0.00"
              value={form.total_bill_amount || ''}
              onChange={(e) => setForm((p) => ({ ...p, total_bill_amount: e.target.value }))}
              required
            />
          </div>

          {/* Tax % */}
          <div style={S.field}>
            <label htmlFor="bill-field-7" style={S.label}>Tax Withholding %</label>
            <input id="bill-field-7"
              type="number" inputMode="decimal" min="0"
              step="0.01"
              style={S.input}
              placeholder="0.00"
              value={form.tax_percent ?? '0'}
              onChange={(e) => setForm((p) => ({ ...p, tax_percent: e.target.value }))}
            />
          </div>

          {/* Category */}
          <div style={{ ...S.field, gridColumn: 'span 2' }}>
            <label htmlFor="bill-field-8" style={S.label}>Bill Category</label>
            <select id="bill-field-8"
              style={S.select}
              value={form.category || 'PAYABLE'}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="PAYABLE">Payable (Normal settlement)</option>
              <option value="BILL_TO_BILL">Bill to Bill (Cleared instantly)</option>
              <option value="SALE_BASED">Sale Based (Consignment)</option>
              <option value="DISPUTED">Disputed (Hold)</option>
            </select>
          </div>
        </div>

        {/* Calculation Strip */}
        <div className="form-calculations" style={S.calcStrip}>
          <div style={S.calcCol}>
            <span style={S.calcLabel}>Gross Bill</span>
            <span style={S.calcVal}>Rs {money(gross)}</span>
          </div>
          <div style={S.calcDivider} />
          <div style={S.calcCol}>
            <span style={S.calcLabel}>Tax Deducted ({taxPct}%)</span>
            <span style={{ ...S.calcVal, color: '#f59e0b' }}>Rs {money(taxAmount)}</span>
          </div>
          <div style={S.calcDivider} />
          <div style={S.calcCol}>
            <span style={S.calcLabel}>Net Actual Payable</span>
            <span style={{ ...S.calcVal, color: '#34d399', fontSize: 18 }}>Rs {money(actualPayable)}</span>
          </div>
        </div>

        {/* Remarks */}
        <div style={{ ...S.field, marginTop: 14 }}>
          <label htmlFor="bill-field-9" style={S.label}>Remarks / Discrepancy Notes</label>
          <textarea id="bill-field-9"
            style={S.textarea}
            placeholder="Add any remarks or delivery discrepancy notes..."
            value={form.remarks || ''}
            onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Immediate Payment Section ── */}
      <div style={{ ...S.paymentContainer, ...(form.record_payment ? S.paymentContainerActive : {}) }}>
        {/* Toggle bar */}
        <div className="payment-toggle" style={S.paymentToggleBar} onClick={handleTogglePayment}>
          <label style={S.checkboxLabel} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              style={S.checkbox}
              checked={Boolean(form.record_payment)}
              onChange={handleTogglePayment}
            />
            <div style={S.checkboxTextWrap}>
              <span style={S.checkboxTitle}>⚡ Record Payment with this Bill</span>
              <span style={S.checkboxSub}>
                Automatically log a linked payment transaction (Counter cash, Cheque, Online transfer, etc.)
              </span>
            </div>
          </label>
          <span style={form.record_payment ? S.badgeActive : S.badgeInactive}>
            {form.record_payment ? 'PAYMENT ENABLED' : 'OPTIONAL'}
          </span>
        </div>

        {/* Expanded Payment Form */}
        {form.record_payment && (
          <div style={S.paymentBody}>
            {/* Quick Fill Buttons */}
            <div className="payment-quick-actions" style={S.quickActions}>
              <span style={S.quickLabel}>Quick Fill:</span>
              <button
                type="button"
                style={S.quickBtn}
                onClick={setFullPayment}
                disabled={actualPayable <= 0}
              >
                ⚡ Full Amount (Rs {money(actualPayable)})
              </button>
              <button
                type="button"
                style={S.quickBtn}
                onClick={setHalfPayment}
                disabled={actualPayable <= 0}
              >
                50% (Rs {money(actualPayable / 2)})
              </button>
              <button type="button" style={{ ...S.quickBtn, color: '#94a3b8' }} onClick={clearPayment}>
                Clear
              </button>
            </div>

            <div className="bill-form-grid" style={S.grid}>
              {/* Payment Date */}
              <div style={S.field}>
                <label htmlFor="bill-field-10" style={S.label}>Payment Date *</label>
                <input id="bill-field-10"
                  type="date"
                  style={S.input}
                  value={form.payment_date || form.posting_date || ''}
                  onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))}
                  required={Boolean(form.record_payment)}
                />
              </div>

              {/* Payment Amount */}
              <div style={S.field}>
                <label htmlFor="bill-field-11" style={S.label}>Paid Amount (Rs) *</label>
                <input id="bill-field-11"
                  type="number" inputMode="decimal" min="0"
                  step="any"
                  style={{ ...S.input, fontWeight: '800', color: '#34d399', fontSize: 16 }}
                  placeholder="0.00"
                  value={form.payment_amount || ''}
                  onChange={(e) => setForm((p) => ({ ...p, payment_amount: e.target.value }))}
                  required={Boolean(form.record_payment)}
                />
              </div>

              {/* Payment Mode */}
              <div style={S.field}>
                <label htmlFor="bill-field-12" style={S.label}>Payment Mode *</label>
                <select id="bill-field-12"
                  style={S.select}
                  value={form.payment_mode || 'COUNTER_CASH'}
                  onChange={(e) => setForm((p) => ({ ...p, payment_mode: e.target.value }))}
                >
                  <option value="COUNTER_CASH">Counter Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="ONLINE_TRANSFER">Online Transfer / Bank</option>
                  <option value="CASH_FROM_AFTAB">Cash from Aftab</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Reference / Cheque No */}
              <div style={S.field}>
                <label htmlFor="bill-field-13" style={S.label}>Reference / Cheque No.</label>
                <input id="bill-field-13"
                  style={S.input}
                  placeholder="e.g. CHQ-88219 or Txn ID"
                  value={form.payment_reference_no || ''}
                  onChange={(e) => setForm((p) => ({ ...p, payment_reference_no: e.target.value }))}
                />
              </div>

              {/* Payment Remarks */}
              <div style={{ ...S.field, gridColumn: 'span 2' }}>
                <label htmlFor="bill-field-14" style={S.label}>Payment Remarks / Note</label>
                <input id="bill-field-14"
                  style={S.input}
                  placeholder="e.g. Paid at delivery, handed over to distributor representative"
                  value={form.payment_remarks || ''}
                  onChange={(e) => setForm((p) => ({ ...p, payment_remarks: e.target.value }))}
                />
              </div>
            </div>

            {/* Live Settlement Breakdown */}
            <div className="settlement-strip" style={S.settlementStrip}>
              <div style={S.settleItem}>
                <span style={S.settleLabel}>Payable</span>
                <span style={S.settleVal}>Rs {money(actualPayable)}</span>
              </div>
              <span style={S.settleMath}>−</span>
              <div style={S.settleItem}>
                <span style={S.settleLabel}>Payment</span>
                <span style={{ ...S.settleVal, color: '#34d399' }}>Rs {money(paymentAmount)}</span>
              </div>
              <span style={S.settleMath}>=</span>
              <div style={S.settleItem}>
                <span style={S.settleLabel}>Remaining Balance</span>
                <span style={{ ...S.settleVal, color: remaining > 0 ? '#fbbf24' : '#34d399' }}>
                  Rs {money(remaining)}
                </span>
              </div>
              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                {paymentAmount >= actualPayable && actualPayable > 0 ? (
                  <span style={S.badgeComplete}>✓ FULLY PAID</span>
                ) : paymentAmount > 0 ? (
                  <span style={S.badgePartial}>● PARTIAL SETTLEMENT</span>
                ) : (
                  <span style={S.badgeUnpaid}>○ UNPAID</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Form Actions ── */}
      <div className="form-actions" style={S.actions}>
        <button type="submit" disabled={saving || !online} style={S.primaryBtn}>
          {saving ? 'Saving…' : form.record_payment && paymentAmount > 0 ? '✓ Save Bill & Record Payment' : '✓ Save Bill Only'}
        </button>
        {form.sync_id && (
          <button type="button" style={S.cancelBtn} onClick={onCancel}>
            Cancel Edit
          </button>
        )}
      </div>
    </fieldset>
    </form>
  );
}

/* ── Modern High-End Styles ── */
const S = {
  container: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 4,
  },
  eyebrow: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 4,
  },
  title: {
    margin: '0 0 6px',
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: 900,
  },
  subtitle: {
    margin: 0,
    color: '#64748b',
    fontSize: 13,
  },

  /* Card */
  card: {
    background: '#0d1729',
    border: '1px solid #1e293b',
    borderRadius: 18,
    padding: 22,
  },
  cardHeader: {
    marginBottom: 16,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 12,
  },
  cardTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: 800,
  },

  /* Grid & Fields */
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    background: '#07101f',
    border: '1px solid #1e293b',
    borderRadius: 10,
    color: '#f1f5f9',
    padding: '11px 13px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: '#07101f',
    border: '1px solid #1e293b',
    borderRadius: 10,
    color: '#f1f5f9',
    padding: '11px 13px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  textarea: {
    background: '#07101f',
    border: '1px solid #1e293b',
    borderRadius: 10,
    color: '#f1f5f9',
    padding: '11px 13px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 70,
    resize: 'vertical',
  },

  /* Calc strip */
  calcStrip: {
    display: 'flex',
    alignItems: 'center',
    background: '#07101f',
    border: '1px solid #1e293b',
    borderRadius: 14,
    padding: '14px 18px',
    marginTop: 16,
  },
  calcCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  calcDivider: {
    width: 1,
    height: 36,
    background: '#1e293b',
  },
  calcLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calcVal: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: 900,
  },

  /* Payment Section Container */
  paymentContainer: {
    background: '#0d1729',
    border: '1px solid #1e293b',
    borderRadius: 18,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  paymentContainerActive: {
    border: '1px solid #166534',
    background: '#07161b',
  },
  paymentToggleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
    flex: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
    accentColor: '#34d399',
    margin: 0,
  },
  checkboxTextWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  checkboxTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 800,
  },
  checkboxSub: {
    color: '#64748b',
    fontSize: 12,
  },
  badgeActive: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1,
    padding: '4px 10px',
    borderRadius: 99,
    background: '#0a2e22',
    color: '#34d399',
    border: '1px solid #166534',
  },
  badgeInactive: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    padding: '4px 10px',
    borderRadius: 99,
    background: '#0f172a',
    color: '#475569',
    border: '1px solid #1e293b',
  },

  /* Payment Body */
  paymentBody: {
    padding: '0 20px 20px 20px',
    borderTop: '1px solid #133928',
    paddingTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  quickActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 700,
  },
  quickBtn: {
    background: '#0d2d22',
    border: '1px solid #166534',
    color: '#34d399',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },

  /* Settlement Strip */
  settlementStrip: {
    display: 'flex',
    alignItems: 'center',
    background: '#051410',
    border: '1px solid #166534',
    borderRadius: 14,
    padding: '12px 18px',
    gap: 14,
    flexWrap: 'wrap',
  },
  settleItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  settleLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settleVal: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: 900,
  },
  settleMath: {
    color: '#334155',
    fontSize: 16,
    fontWeight: 800,
  },
  badgeComplete: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.5,
    padding: '4px 12px',
    borderRadius: 99,
    background: '#0a2e22',
    color: '#34d399',
    border: '1px solid #166534',
  },
  badgePartial: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.5,
    padding: '4px 12px',
    borderRadius: 99,
    background: '#2d1f07',
    color: '#fbbf24',
    border: '1px solid #92400e',
  },
  badgeUnpaid: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: '4px 12px',
    borderRadius: 99,
    background: '#2d0e0e',
    color: '#fb7185',
    border: '1px solid #991b1b',
  },

  /* Form actions */
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    background: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: 12,
    padding: '13px 24px',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    background: '#101c30',
    color: '#94a3b8',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '13px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
