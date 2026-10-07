const test=require('node:test'),assert=require('node:assert/strict');
test('CSV exports escape delimiters, preserve amounts, support Urdu and neutralize spreadsheet formulas',async()=>{
 const {csv}=await import('./export.js');
 const text=csv([{supplier_name:'=HYPERLINK("unsafe")',supplier_bill_no:'INV,"1"',remarks:'اردو\nnotes',remaining_balance:1234.56}], 'bills');
 assert.ok(text.startsWith('\uFEFF'));assert.ok(text.includes("'=HYPERLINK"));assert.ok(text.includes('INV,""1""'));assert.ok(text.includes('اردو\nnotes'));assert.ok(text.includes('"1234.56"'));
});
test('Excel export is a real workbook with numeric monetary cells and text-only references',async()=>{
 const {xlsx}=await import('./export.js');const ExcelJS=require('exceljs');
 const buffer=await xlsx([{supplier_name:'@danger',supplier_bill_no:'000123',amount:1234.56,payment_date:'2026-10-07'}],'payments');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);const sheet=workbook.getWorksheet('Payments');
 assert.equal(sheet.getCell('B2').value,"'@danger");assert.equal(sheet.getCell('C2').value,'000123');assert.equal(sheet.getCell('D2').value,1234.56);assert.equal(sheet.getCell('D2').type,ExcelJS.ValueType.Number);
 assert.equal(sheet.getCell('D2').numFmt,'#,##0.00');assert.ok(sheet.autoFilter);
});
test('export selection respects filtered bill IDs and includes linked payments and activity once',()=>{
 const records=require('./records.cjs');
 const state={bills:[{sync_id:'a',supplier_name:'A',supplier_bill_no:'1',category:'PAYABLE',actual_amount:100,posting_date:'2026-10-01'},{sync_id:'b',supplier_name:'B',supplier_bill_no:'2',category:'PAYABLE',actual_amount:50,posting_date:'2026-10-02'}],payments:[{sync_id:'p',bill_sync_id:'a',payment_date:'2026-10-03',amount:20}],events:[{sync_id:'r',bill_sync_id:'a',event_date:'2026-10-04',kind:'RETURN',amount:10}]};
 assert.equal(records.exportData(state,{ids:['a'],dataset:'bills'}).rows.length,1);
 assert.equal(records.exportData(state,{ids:['a'],dataset:'bills'}).rows[0].remaining_balance,70);
 assert.equal(records.exportData(state,{ids:['b'],dataset:'payments'}).rows.length,0);
 assert.equal(records.exportData(state,{ids:['a'],dataset:'payments'}).rows[0].supplier_name,'A');
 assert.equal(records.exportData(state,{ids:['r'],dataset:'events',from:'2026-10-05'}).rows.length,0);
});


test('audit date filters cover Pakistan calendar dates across UTC midnight',()=>{
 const {auditRange}=require('./records.cjs');
 assert.deepEqual(auditRange({from:'2026-10-07',to:'2026-10-07'}),{from:'2026-10-06T19:00:00.000Z',to:'2026-10-07T18:59:59.999Z'});
});
