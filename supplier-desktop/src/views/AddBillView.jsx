import React from 'react';
import Feedback from '../components/Feedback';
const money = v => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export default function AddBillView({ form, setForm, suppliers = [], onSave, onCancel, saving, error, online = true }) {
  const gross = Number(form.total_bill_amount || 0), tax = gross * Number(form.tax_percent || 0) / 100;
  const payable = Math.max(0, gross - tax), paid = Number(form.payment_amount || 0);
  const patch = values => setForm(p => ({ ...p, ...values }));
  const field = (name, label, options = {}) => <label className={options.wide ? 'field-wide' : ''} htmlFor={`bill-${name}`}>{label}<input id={`bill-${name}`} type={options.type || 'text'} inputMode={options.type==='number'?'decimal':undefined} value={form[name] ?? ''} onChange={e => patch({ [name]: e.target.value })} required={options.required} min={options.min} max={options.max} step={options.step} placeholder={options.placeholder} list={options.list} /></label>;
  return <form className="bill-form" onSubmit={onSave}>
    <div className="page-heading"><div><h2>{form.sync_id ? 'Edit supplier bill' : 'Add a supplier bill'}</h2><p>Enter the invoice details. Record a payment now, or settle it later.</p></div></div>
    <fieldset disabled={saving} className="bill-fields">
      <section className="form-section"><h3>Invoice details</h3><div className="field-grid">
        {field('posting_date', 'Posting date', { type: 'date', required: true })}
        {field('bill_date', 'Bill date', { type: 'date', required: true })}
        {field('supplier_name', 'Supplier / distributor', { wide: true, required: true, list: 'supplier-names', placeholder: 'Enter or choose a supplier' })}
        <datalist id="supplier-names">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
        {field('supplier_bill_no', 'Supplier bill number', { placeholder: 'e.g. INV-90412' })}
        {field('voucher_no', 'Abuzar voucher number', { placeholder: 'e.g. V-1044' })}
        {field('total_bill_amount', 'Gross bill amount (Rs)', { type: 'number', required: true, min: '0.01', step: '0.01', placeholder: '0.00' })}
        {field('tax_percent', 'Tax withholding (%)', { type: 'number', min: 0, max: 100, step: '0.01' })}
        <label className="field-wide" htmlFor="bill-category">Bill category<select id="bill-category" value={form.category || 'PAYABLE'} onChange={e => patch({ category: e.target.value })}><option value="PAYABLE">Payable — normal settlement</option><option value="BILL_TO_BILL">Bill to bill — pay on next delivery</option><option value="SALE_BASED">Sale based — consignment</option><option value="DISPUTED">Disputed — on hold</option></select></label>
      </div>{form.category === 'BILL_TO_BILL' && <p className="panel-sub" style={{ marginTop: 14 }}>When the next bill arrives, use Pay on the previous bill to record its payment. This bill stays unpaid until you record a payment.</p>}{form.category === 'SALE_BASED' && <p className="panel-sub" style={{ marginTop: 14 }}>Use Pay to record the amount due from sales, with its payment date. Partial payments reduce the remaining balance; unsold stock can be returned.</p>}<div className="calculation-row"><div><span>Gross bill</span><strong>Rs {money(gross)}</strong></div><div><span>Tax deducted</span><strong>Rs {money(tax)}</strong></div><div><span>Net invoice value</span><strong className="amount-cleared">Rs {money(payable)}</strong></div></div>
      <label htmlFor="bill-remarks">Remarks / discrepancy notes<textarea id="bill-remarks" value={form.remarks || ''} onChange={e => patch({ remarks: e.target.value })} placeholder="Optional delivery or invoice notes" /></label></section>
      <section className={`form-section payment-section ${form.record_payment ? 'payment-enabled' : ''}`}>
        <label className="payment-toggle"><input type="checkbox" checked={Boolean(form.record_payment)} onChange={e => patch({ record_payment: e.target.checked, payment_amount: e.target.checked && !form.payment_amount && payable > 0 ? String(payable) : form.payment_amount })} /><span><strong>Record payment with this bill</strong><small>Save a linked cash or bank payment in the same step.</small></span><span className="optional-label">Optional</span></label>
        {form.record_payment && <div className="payment-body"><div className="quick-actions"><span>Fill amount</span><button type="button" disabled={payable <= 0} onClick={() => patch({ payment_amount: String(payable) })}>Full: Rs {money(payable)}</button><button type="button" disabled={payable <= 0} onClick={() => patch({ payment_amount: String(Math.round(payable * 50) / 100) })}>50%</button><button type="button" onClick={() => patch({ payment_amount: '' })}>Clear</button></div><div className="field-grid">
          {field('payment_date', 'Payment date', { type: 'date', required: true })}
          {field('payment_amount', 'Paid amount (Rs)', { type: 'number', required: true, min: '0.01', max: payable, step: '0.01' })}
          <label htmlFor="bill-payment-mode">Payment method<select id="bill-payment-mode" value={form.payment_mode || 'COUNTER_CASH'} onChange={e => patch({ payment_mode: e.target.value })}>{[['COUNTER_CASH','Counter cash'],['CHEQUE','Cheque'],['ONLINE_TRANSFER','Bank transfer'],['CASH_FROM_AFTAB','Cash from Aftab'],['OTHER','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {field('payment_reference_no', 'Reference / cheque number')}
          {field('payment_remarks', 'Payment remarks', { wide: true })}
        </div><div className="calculation-row"><div><span>Payment</span><strong>Rs {money(paid)}</strong></div><div><span>Remaining balance</span><strong className={payable > paid ? 'amount-due' : 'amount-cleared'}>Rs {money(Math.max(0, payable - paid))}</strong></div></div></div>}
      </section>
    </fieldset>
    {error && <Feedback>{error}</Feedback>}
    <div className="form-actions"><button className="primary" disabled={saving || !online}>{saving ? 'Saving bill…' : form.record_payment && paid > 0 ? 'Save bill & payment' : 'Save bill'}</button>{form.sync_id && <button type="button" onClick={onCancel} disabled={saving}>Cancel edit</button>}</div>
  </form>;
}
