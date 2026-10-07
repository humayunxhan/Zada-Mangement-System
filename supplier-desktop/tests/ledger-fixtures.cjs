const ledger=require('../../server/src/modules/suppliers/ledger.cjs');
const scenarios=[];
for(const category of ['PAYABLE','BILL_TO_BILL'])for(const paid of [0,30,100])for(const returned of [0,20,70,100]) {
 const bills=[{id:1,sync_id:'a',posting_date:'2026-09-01',bill_date:'2026-09-01',supplier_name:'Alpha',supplier_bill_no:'1',voucher_no:'10',total_bill_amount:100,tax_percent:0,tax_amount:0,actual_amount:100,category,deleted_at:null},{id:2,sync_id:'b',posting_date:'2026-10-01',bill_date:'2026-10-01',supplier_name:'Alpha',supplier_bill_no:'2',voucher_no:'20',total_bill_amount:100,tax_percent:0,tax_amount:0,actual_amount:100,category,deleted_at:null}];
 const payments=paid?[{id:1,sync_id:'p',bill_sync_id:'a',payment_date:'2026-10-02',amount:paid,deleted_at:null}]:[];
 const events=returned?[{sync_id:'r',kind:'RETURN',bill_sync_id:'a',target_bill_sync_id:'',event_date:'2026-10-03',amount:returned,payment_mode:'',reference_no:'',remarks:'Return',created_at:'2026-10-03',created_by:'test'}]:[];
 const credit=Math.max(0,paid-(100-returned));
 if(credit>0){events.push({sync_id:'refund',kind:'REFUND',bill_sync_id:'a',target_bill_sync_id:'',event_date:'2026-10-04',amount:credit/2,payment_mode:'COUNTER_CASH',reference_no:'',remarks:'',created_at:'2026-10-04',created_by:'test'});events.push({sync_id:'adjust',kind:'ADJUSTMENT',bill_sync_id:'a',target_bill_sync_id:'b',event_date:'2026-10-05',amount:credit/2,payment_mode:'',reference_no:'',remarks:'',created_at:'2026-10-05',created_by:'test'});}
 const fields=['paid_amount','returned_amount','net_payable','refund_amount','credit_used','credit_applied','remaining_balance','pending_credit','payment_status','return_status','credit_status','last_return_date'];
 scenarios.push({name:`${category}-paid-${paid}-returned-${returned}`,bills,payments,events,expected:ledger.decorateRows(bills,payments,events).map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))});
}
process.stdout.write(JSON.stringify(scenarios));
