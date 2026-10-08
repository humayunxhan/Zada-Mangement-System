<?php
require __DIR__.'/../public/api/finance.php';
require __DIR__.'/../deploy/migrations/001-returns.php';
require __DIR__.'/../deploy/migrations/002-records.php';
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
migrate_returns($pdo,$mysql);migrate_records($pdo,$mysql);migrate_returns($pdo,$mysql);migrate_records($pdo,$mysql);
if($mysql)foreach(['bills','payments','supplier_ledger_events','supplier_sync_state','supplier_sync_outbox','spms_migrations','supplier_audit_log'] as $t){
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
// Exercise management entirely inside the same isolated test database.
$private=sys_get_temp_dir().'/spms-records-test-'.bin2hex(random_bytes(8));mkdir($private,0700);
$cfg=['private_dir'=>$private];
try {
 $b2b=bill('b2b');$b2b['category']='BILL_TO_BILL';finance_bill($pdo,$b2b,'tester');
 finance_payment($pdo,payment('b2b-pay','b2b',50),'tester');check(rows($pdo)['b2b']['remaining_balance']==50,'Bill-to-bill accepts payments');
 finance_event($pdo,event('b2b-return','RETURN','b2b',80),'tester');check(rows($pdo)['b2b']['pending_credit']==30,'Bill-to-bill credit');
 finance_event($pdo,event('b2b-refund','REFUND','b2b',10,'2026-10-04'),'tester');
 $sale=bill('sale');$sale['category']='SALE_BASED';finance_bill($pdo,$sale,'tester');
 finance_payment($pdo,payment('sale-pay','sale',40),'tester');check(rows($pdo)['sale']['remaining_balance']==60,'Sale based accepts partial payments');
 rejects(fn()=>finance_payment($pdo,payment('sale-over','sale',61),'tester'),'Sale based overpayment rejected');
 finance_event($pdo,event('sale-return','RETURN','sale',80),'tester');check(rows($pdo)['sale']['pending_credit']==20,'Sale based return credit');
 finance_event($pdo,event('sale-refund','REFUND','sale',20,'2026-10-04'),'tester');check(rows($pdo)['sale']['pending_credit']==0,'Sale based refund settles credit');
 $first=bill('invoice-one');$first['supplier_bill_no']=' INV  123 ';finance_bill($pdo,$first,'tester');
 $second=bill('invoice-two');$second['supplier_bill_no']='inv 123';
 check(count(records_duplicates($second,finance_read($pdo)['bills']))===1,'Normalized duplicate match');
 rejects(fn()=>finance_bill($pdo,$second,'tester'),'Duplicate invoice rejected inside transaction');
 $second['duplicate_acknowledged']=['invoice-one'];finance_bill($pdo,$second,'tester');
 $beforeAudit=$pdo->query('SELECT COUNT(*) FROM supplier_audit_log')->fetchColumn();finance_bill($pdo,$second,'tester');
 check($pdo->query('SELECT COUNT(*) FROM supplier_audit_log')->fetchColumn()===$beforeAudit,'Identical retry does not duplicate audit');
 $operator=['username'=>'staff','role'=>'operator'];$admin=['username'=>'tester','role'=>'admin'];
 foreach(['records/backups','records/audit','records/restore'] as $path){[, $status]=records_route($pdo,$cfg,$operator,$path,'POST',[],[]);check($status===403,'Operator blocked from '.$path);}
 [$dup,$status]=records_route($pdo,$cfg,$operator,'records/duplicates','POST',$second,[]);check($status===200&&count($dup)===1,'Operator duplicate lookup');
 $export=records_export($pdo,['dataset'=>'bills','ids'=>['target']]);check(count($export['rows'])===1&&$export['rows'][0]['credit_applied']==40,'Filtered export preserves cross-bill credit');
 $export=records_export($pdo,['dataset'=>'payments','ids'=>['b2b']]);check(count($export['rows'])===1,'Payment export scope');
 $export=records_export($pdo,['dataset'=>'events','ids'=>['b2b-return']]);check(count($export['rows'])===1&&$export['rows'][0]['kind']==='RETURN','Event export scope');
 $snapshot=records_backup($pdo,$cfg,'tester');$input=records_read_backup($cfg,$snapshot['id']);
 check(!isset($input['data']['users'])&&!str_contains(records_json($input),'password_hash'),'Backup excludes accounts and credentials');
 check((fileperms(records_file($cfg,$snapshot['id']))&0777)===0600,'Backup private permissions');
 $decoded=records_decode($input);check(count($decoded['bills'])>0,'Backup round trip validates');
 $corrupt=$input;$corrupt['data']['bills'][0]['actual_amount']=1;rejects(fn()=>records_decode($corrupt),'Corrupt checksum');
 rejects(fn()=>records_file($cfg,'../config.php'),'Backup path traversal');
 $bad=records_snapshot($pdo);$bad['events']=[];$erased=records_encode($bad);
 rejects(fn()=>records_restore($pdo,$cfg,$erased,'tester'),'Cannot erase settlement history');
 $foreign=$input;$foreign['sync']['sourceId']='different-database';$foreign['checksum']=hash('sha256',records_json(['data'=>$foreign['data'],'sync'=>$foreign['sync']]));
 rejects(fn()=>records_restore($pdo,$cfg,$foreign,'tester'),'Cross-database restore');
 finance_bill($pdo,bill('after-backup'),'tester');
 $result=records_restore($pdo,$cfg,$input,'tester');check(!isset(rows($pdo)['after-backup']),'Restored later unprotected bill to tombstone');
 check(is_file(records_file($cfg,$result['safetyBackup'])),'Restore safety snapshot');
 check(rows($pdo)['b2b']['pending_credit']==20&&rows($pdo)['target']['credit_applied']==40,'Restore preserves settlements');
 $logs=records_audit_list($pdo,[]);check($logs[0]['action']==='RESTORE','Restore audited');
 check(count(records_audit_list($pdo,['action'=>'DUPLICATE_OVERRIDE']))===1,'Duplicate override audited');
 $count=count(records_backups($cfg));records_automatic_backup($pdo,$cfg);check(count(records_backups($cfg))===$count,'Automatic backup not repeated within 24 hours');
 echo "PASS: bill-to-bill, duplicate overrides, exports, audit, private backups, checked restore, settlement protection and role restrictions.\n";
} finally {
 foreach(glob($private.'/financial-backups/*') as $file)unlink($file);
 if(is_file($private.'/financial-backups/.schedule-lock'))unlink($private.'/financial-backups/.schedule-lock');
 if(is_dir($private.'/financial-backups'))rmdir($private.'/financial-backups');rmdir($private);
}
