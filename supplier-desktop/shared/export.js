const moneyKeys = new Set(['total_bill_amount','tax_amount','actual_amount','net_payable','paid_amount','returned_amount','refund_amount','credit_applied','credit_used','remaining_balance','pending_credit','amount','tax_percent']);
export const columns = {
  bills: [['posting_date','Posting date'],['bill_date','Bill date'],['supplier_name','Supplier'],['supplier_bill_no','Invoice number'],['voucher_no','Voucher'],['category','Category'],['total_bill_amount','Gross bill'],['tax_percent','Tax %'],['tax_amount','Tax deducted'],['actual_amount','Original net'],['returned_amount','Returned'],['net_payable','Net payable'],['paid_amount','Payments'],['refund_amount','Refunds'],['credit_applied','Credit applied'],['credit_used','Credit used'],['remaining_balance','Balance'],['pending_credit','Pending credit'],['payment_status','Payment status'],['return_status','Return status'],['last_return_date','Last return date'],['remarks','Remarks'],['sync_id','Record ID']],
  payments: [['payment_date','Payment date'],['supplier_name','Supplier'],['supplier_bill_no','Invoice number'],['amount','Amount'],['payment_mode','Payment method'],['reference_no','Reference'],['remarks','Remarks'],['created_by','Recorded by'],['bill_sync_id','Bill ID'],['sync_id','Payment ID']],
  events: [['event_date','Activity date'],['supplier_name','Supplier'],['supplier_bill_no','Invoice number'],['kind','Activity'],['amount','Amount'],['payment_mode','Refund method'],['reference_no','Reference'],['remarks','Reason / remarks'],['created_by','Recorded by'],['target_bill_sync_id','Target bill ID'],['bill_sync_id','Source bill ID'],['sync_id','Activity ID']],
  audit: [['created_at','Time (UTC)'],['actor','User'],['action','Action'],['entity','Record type'],['record_id','Record ID'],['before_json','Before'],['after_json','After'],['details_json','Details'],['sync_id','Audit ID']],
};
export const safeText = value => /^[\s]*[=+\-@]|^[\t\r\n]/.test(String(value ?? '')) ? `'${String(value ?? '')}` : String(value ?? '');
const cell = (row,key) => moneyKeys.has(key) ? Number(row[key] || 0) : safeText(row[key]);
export function csv(rows,dataset) {
  if (!columns[dataset]) throw new Error('Unsupported export type.');
  const quote = value => `"${String(value).replace(/"/g,'""')}"`;
  return '\uFEFF' + [columns[dataset].map(([,label])=>quote(label)).join(','), ...rows.map(row=>columns[dataset].map(([key])=>quote(cell(row,key))).join(','))].join('\r\n') + '\r\n';
}
export async function xlsx(rows,dataset) {
  if (!columns[dataset]) throw new Error('Unsupported export type.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook(); workbook.creator='Zada Pharmacy'; workbook.created=new Date();
  const sheet=workbook.addWorksheet({bills:'Bills',payments:'Payments',events:'Return activity',audit:'Audit log'}[dataset]);
  sheet.columns=columns[dataset].map(([key,header])=>({key,header,width:moneyKeys.has(key)?18:25}));
  for (const row of rows) sheet.addRow(Object.fromEntries(columns[dataset].map(([key])=>[key,cell(row,key)])));
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF163B37'}};
  sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:columns[dataset].length}};
  for (const [key] of columns[dataset]) if (moneyKeys.has(key)) sheet.getColumn(key).numFmt='#,##0.00';
  return workbook.xlsx.writeBuffer();
}
