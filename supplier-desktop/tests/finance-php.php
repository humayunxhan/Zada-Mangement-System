<?php
require __DIR__.'/../public/api/finance.php';
require __DIR__.'/../deploy/migrations/001-returns.php';
function check($ok,$message){if(!$ok)throw new RuntimeException($message);}
function rejects($work,$message){try{$work();}catch(LedgerError $e){return;}throw new RuntimeException('Expected rejection: '.$message);}
$mysql=in_array('--mysql-private',$argv,true);
if($mysql){
 $cfg=require '/home/u728298835/domains/zadapharmacy.com/spms-private/config.php';
 if(!preg_match('/^u728298835_.*spms$/i',$cfg['db_name']))throw new RuntimeException('Unexpected database');
 $pdo=new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4",$cfg['db_user'],$cfg['db_pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
 // Connection-scoped temporary tables shadow the real names. No data is copied.
 foreach(['bills','payments'] as $table){
  $ddl=$pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
  $pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$ddl,1));
 }
} else {
$pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$pdo->exec("CREATE TABLE bills (id INTEGER PRIMARY KEY AUTOINCREMENT,sync_id TEXT UNIQUE,posting_date TEXT,bill_date TEXT,supplier_name TEXT,supplier_bill_no TEXT,voucher_no TEXT,total_bill_amount DECIMAL,tax_percent DECIMAL,tax_amount DECIMAL,actual_amount DECIMAL,category TEXT,remarks TEXT,created_by TEXT,deleted_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$pdo->exec("CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT,sync_id TEXT UNIQUE,bill_sync_id TEXT,payment_date TEXT,amount DECIMAL,payment_mode TEXT,reference_no TEXT,remarks TEXT,created_by TEXT,deleted_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");


}
migrate_returns($pdo,$mysql);migrate_returns($pdo,$mysql);
if($mysql)foreach(['bills','payments','supplier_ledger_events','supplier_sync_state','supplier_sync_outbox','spms_migrations'] as $t){
 $definition=$pdo->query("SHOW CREATE TABLE $t")->fetch(PDO::FETCH_NUM)[1];
 check(str_contains($definition,'CREATE TEMPORARY TABLE'),'Refuse testing against persistent table '.$t);
}
function bill($id,$supplier='Alpha',$date='2026-10-01',$amount=100){return ['sync_id'=>$id,'posting_date'=>$date,'bill_date'=>$date,'supplier_name'=>$supplier,'total_bill_amount'=>$amount,'tax_percent'=>0,'category'=>'PAYABLE','voucher_no'=>$id];}
function payment($id,$bill,$amount){return ['sync_id'=>$id,'bill_sync_id'=>$bill,'payment_date'=>'2026-10-02','amount'=>$amount];}
function event($id,$kind,$bill,$amount,$date='2026-10-03',$target=''){return ['syncId'=>$id,'kind'=>$kind,'billSyncId'=>$bill,'amount'=>$amount,'eventDate'=>$date,'targetBillSyncId'=>$target,'remarks'=>'Test return'];}
function rows($pdo){$s=finance_read($pdo);return array_column(ledger_decorate($s['bills'],$s['payments'],$s['events']),null,'sync_id');}
foreach(['paid','partial','unpaid','target','other'] as $id)finance_bill($pdo,bill($id,$id==='other'?'Beta':'Alpha',$id==='paid'?'2026-09-01':'2026-10-01'),'tester');
finance_payment($pdo,payment('p-paid','paid',100),'tester');finance_payment($pdo,payment('p-partial','partial',60),'tester');
finance_event($pdo,event('r-unpaid','RETURN','unpaid',100),'tester');check(rows($pdo)['unpaid']['remaining_balance']==0,'Unpaid full return');
finance_event($pdo,event('r-paid','RETURN','paid',80),'tester');check(rows($pdo)['paid']['pending_credit']==80,'Paid partial return creates credit');
finance_event($pdo,event('r-partial','RETURN','partial',50),'tester');check(rows($pdo)['partial']['pending_credit']==10,'Partially paid return credit');
finance_event($pdo,event('refund','REFUND','paid',30,'2026-10-04'),'tester');
finance_event($pdo,event('adjust','ADJUSTMENT','paid',40,'2026-10-05','target'),'tester');
$r=rows($pdo);check($r['paid']['pending_credit']==10 && $r['target']['remaining_balance']==60,'Refund plus adjustment balances');
finance_event($pdo,event('adjust','ADJUSTMENT','paid',40,'2026-10-05','target'),'tester');check(rows($pdo)['paid']['pending_credit']==10,'Duplicate retry does not consume credit');
rejects(fn()=>finance_event($pdo,event('adjust','ADJUSTMENT','paid',39,'2026-10-05','target'),'tester'),'ID collision');
rejects(fn()=>finance_event($pdo,event('cross','ADJUSTMENT','paid',5,'2026-10-06','other'),'tester'),'Cross supplier');
rejects(fn()=>finance_event($pdo,event('excess','REFUND','paid',11,'2026-10-06'),'tester'),'Excess credit');
rejects(fn()=>finance_event($pdo,event('old-date','REFUND','paid',5,'2026-10-03'),'tester'),'Backdated settlement');
rejects(fn()=>finance_bill($pdo,bill('paid','Alpha','2026-09-01',101),'tester'),'Locked bill edit');
rejects(fn()=>finance_delete($pdo,'payments','p-paid'),'Locked payment delete');
rejects(fn()=>finance_payment($pdo,payment('too-much','target',61),'tester'),'Excess payment');
// A byte-equivalent original payment retry remains safe after a return.
finance_payment($pdo,payment('p-paid','paid',100),'tester');check(count(rows($pdo)['paid']['payments'])===1,'Payment retry after return');
[$october]=$tmp=finance_route($pdo,'bills','GET',['from'=>'2026-10-01','to'=>'2026-10-31'],[],'tester');
check(!in_array('paid',array_column($october,'sync_id'),true),'Original-bill date scope preserved');
check(array_column($october,null,'sync_id')['target']['credit_applied']==40,'Cross-period source credit retained');
check(count(rows($pdo)['paid']['ledgerEvents'])===3,'Audit history preserved');
$before=$pdo->query('SELECT version FROM supplier_sync_state')->fetchColumn();
try{finance_mutate($pdo,function()use($pdo){$pdo->exec("UPDATE bills SET supplier_name='BROKEN'");throw new RuntimeException('Force rollback');});}catch(RuntimeException $e){}
check(rows($pdo)['paid']['supplier_name']==='Alpha' && $pdo->query('SELECT version FROM supplier_sync_state')->fetchColumn()===$before,'Transaction rollback');
rejects(fn()=>finance_bill($pdo,bill('zero','Alpha','2026-10-01',0),'tester'),'Zero amount');
rejects(fn()=>ledger_date('2026-02-30'),'Invalid date');
check($pdo->query('SELECT COUNT(*) FROM supplier_sync_outbox')->fetchColumn()==0,'No external sync queued');
// Allow golden fixtures to compare exact results against the upstream JS ledger.
if(isset($argv[1]))foreach(json_decode(file_get_contents($argv[1]),true) as $fixture){
 $actual=ledger_decorate($fixture['bills'],$fixture['payments'],array_map('ledger_event_row',$fixture['events']));
 foreach($actual as $i=>$b)foreach($fixture['expected'][$i] as $k=>$v)check($b[$k]==$v,'JS/PHP parity: '.$fixture['name'].' '.$k);
}
echo "PASS: PHP ledger, return/refund/adjustment, retry, limits, historical locks, period filters, rollback, additive migration and JS parity.\n";
