<?php
require_once __DIR__.'/ledger.php';
require_once __DIR__.'/records.php';
function finance_state($pdo) {
    return ['bills'=>$pdo->query('SELECT * FROM bills ORDER BY posting_date DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC),
        'payments'=>$pdo->query('SELECT * FROM payments ORDER BY payment_date, id')->fetchAll(PDO::FETCH_ASSOC),
        'events'=>array_map('ledger_event_row',$pdo->query('SELECT * FROM supplier_ledger_events ORDER BY id')->fetchAll(PDO::FETCH_ASSOC))];
}
function finance_read($pdo) {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql') $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    try { $state=finance_state($pdo);$pdo->commit();return $state; }
    catch (Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
}
function finance_mutate($pdo,$work) {
    $pdo->beginTransaction();
    try {
        // Every financial mutation locks the same row before reading balances.
        if ($pdo->exec('UPDATE supplier_sync_state SET version = version + 1 WHERE id = 1')!==1) throw new RuntimeException('Financial lock unavailable');
        $result=$work(finance_state($pdo));$pdo->commit();return $result;
    } catch (Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
}
function finance_save_row($pdo,$table,$fields,$old,$actor) {
    $names=array_keys($fields);$values=array_values($fields);
    if ($old) {
        if (!empty($old['deleted_at'])) ledger_fail('This record was deleted. Refresh before continuing.');
        $query='UPDATE '.$table.' SET '.implode(', ',array_map(fn($k)=>$k.' = ?',$names)).' WHERE sync_id = ?';$values[]=$fields['sync_id'];
    } else { $names[]='created_by';$values[]=$actor;$query='INSERT INTO '.$table.' ('.implode(',',$names).') VALUES ('.implode(',',array_fill(0,count($names),'?')).')'; }
    $pdo->prepare($query)->execute($values);
    $stmt=$pdo->prepare('SELECT * FROM '.$table.' WHERE sync_id = ?');$stmt->execute([$fields['sync_id']]);$row=$stmt->fetch(PDO::FETCH_ASSOC);
    records_audit($pdo,$actor,$old?'UPDATE':'CREATE',$table==='bills'?'bill':'payment',$fields['sync_id'],$old,$row);return $row;
}
function finance_same_fields($old,$fields,$numeric=[]) {
    foreach($fields as $k=>$v) if (in_array($k,$numeric,true) ? ledger_cents($old[$k])!==ledger_cents($v) : (string)($old[$k]??'')!==(string)$v) return false;
    return empty($old['deleted_at']);
}
function finance_bill($pdo,$b,$actor) {
    $total=ledger_positive($b['total_bill_amount']??null);$tax=$b['tax_percent']??0;
    if(!is_numeric($tax)||!is_finite((float)$tax)||(float)$tax<0||(float)$tax>100) ledger_fail('Tax must be between 0 and 100.');
    $tax=round((float)$tax,2);$taxAmount=round($total*$tax/100,2);
    $category=$b['category']??'PAYABLE';if(!in_array($category,['PAYABLE','BILL_TO_BILL','SALE_BASED','DISPUTED'],true))ledger_fail('Invalid bill category.');
    $fields=['sync_id'=>ledger_id($b['sync_id']??''),'posting_date'=>ledger_date($b['posting_date']??''),'bill_date'=>ledger_date($b['bill_date']??''),
        'supplier_name'=>ledger_text($b['supplier_name']??'',255),'supplier_bill_no'=>ledger_text($b['supplier_bill_no']??'',100),'voucher_no'=>ledger_text($b['voucher_no']??'',100),
        'total_bill_amount'=>$total,'tax_percent'=>$tax,'tax_amount'=>$taxAmount,'actual_amount'=>round($total-$taxAmount,2),'category'=>$category,'remarks'=>ledger_text($b['remarks']??'')];
    if(!$fields['supplier_name'])ledger_fail('Supplier name is required.');
    return finance_mutate($pdo,function($s)use($pdo,$fields,$actor,$b){
        $old=array_column($s['bills'],null,'sync_id')[$fields['sync_id']]??null;
        // Identical retries remain safe even if a later return locked the bill.
        if($old && finance_same_fields($old,$fields,['total_bill_amount','tax_percent','tax_amount','actual_amount']))return $old;
        $duplicates=records_check_duplicate($b,$s['bills']);
        if($duplicates)records_audit($pdo,$actor,'DUPLICATE_OVERRIDE','bill',$fields['sync_id'],null,null,['matches'=>$duplicates]);
        ledger_unlocked($fields['sync_id'],$s['events']);
        return finance_save_row($pdo,'bills',$fields,$old,$actor);
    });
}
function finance_payment($pdo,$p,$actor) {
    $fields=['sync_id'=>ledger_id($p['sync_id']??''),'bill_sync_id'=>ledger_id($p['bill_sync_id']??''),'payment_date'=>ledger_date($p['payment_date']??''),
        'amount'=>ledger_positive($p['amount']??null),'payment_mode'=>ledger_text($p['payment_mode']??'COUNTER_CASH',50),'reference_no'=>ledger_text($p['reference_no']??'',100),'remarks'=>ledger_text($p['remarks']??'')];
    return finance_mutate($pdo,function($s)use($pdo,$fields,$actor){
        $old=array_column($s['payments'],null,'sync_id')[$fields['sync_id']]??null;
        if($old && finance_same_fields($old,$fields,['amount']))return $old;
        ledger_validate_payment($fields,$s['bills'],$s['payments'],$s['events']);
        return finance_save_row($pdo,'payments',$fields,$old,$actor);
    });
}
function finance_event($pdo,$input,$actor) {
    return finance_mutate($pdo,function($s)use($pdo,$input,$actor){
        $e=ledger_validate_event($input,$s['bills'],$s['payments'],$s['events']);
        foreach($s['events'] as $old)if($old['syncId']===$e['syncId'])return $old;
        $pdo->prepare('INSERT INTO supplier_ledger_events (sync_id,kind,bill_sync_id,target_bill_sync_id,event_date,amount,payment_mode,reference_no,remarks,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([$e['syncId'],$e['kind'],$e['billSyncId'],$e['targetBillSyncId'],$e['eventDate'],$e['amount'],$e['paymentMode'],$e['referenceNo'],$e['remarks'],$actor]);
        $stmt=$pdo->prepare('SELECT * FROM supplier_ledger_events WHERE sync_id=?');$stmt->execute([$e['syncId']]);
        records_audit($pdo,$actor,$e['kind'],'event',$e['syncId'],null,$stmt->fetch(PDO::FETCH_ASSOC));
        return $e;
    });
}
function finance_delete($pdo,$table,$id,$actor='system') {
    return finance_mutate($pdo,function($s)use($pdo,$table,$id,$actor){
        $record=array_column($s[$table],null,'sync_id')[$id]??null;if(!$record)ledger_fail('Record not found.');
        if(!empty($record['deleted_at']))return ['success'=>true,'syncId'=>$id];
        $billId=$table==='bills'?$id:$record['bill_sync_id'];ledger_unlocked($billId,$s['events']);
        if($table==='bills')foreach($s['payments'] as $p)if($p['bill_sync_id']===$id && empty($p['deleted_at']))ledger_fail('Delete payments before deleting this bill, or record a stock return.');
        $pdo->prepare('UPDATE '.$table.' SET deleted_at = CURRENT_TIMESTAMP WHERE sync_id = ?')->execute([$id]);records_audit($pdo,$actor,'DELETE',$table==='bills'?'bill':'payment',$id,$record,array_merge($record,['deleted_at'=>gmdate('Y-m-d H:i:s')]));return ['success'=>true,'syncId'=>$id];
    });
}
function finance_route($pdo,$path,$method,$query,$body,$actor) {
    if($path==='returns/sync-status' && $method==='GET')return [['enabled'=>false,'pending'=>0,'error'=>null,'mode'=>'private-php'],200];
    if($path==='bills/suppliers' && $method==='GET')return [$pdo->query("SELECT DISTINCT supplier_name FROM bills WHERE deleted_at IS NULL AND supplier_name != '' ORDER BY supplier_name")->fetchAll(PDO::FETCH_COLUMN),200];
    if($path==='bills' && $method==='GET') {
        $s=finance_read($pdo);$rows=ledger_decorate($s['bills'],$s['payments'],$s['events']);
        foreach(['from','to'] as $k)if(!empty($query[$k]))ledger_date($query[$k]);
        $search=mb_strtolower(ledger_text($query['search']??'',255));
        $rows=array_values(array_filter($rows,function($b)use($query,$search){
            $withinFrom=empty($query['from']) || $b['posting_date'] >= $query['from'];
            $withinTo=empty($query['to']) || $b['posting_date'] <= $query['to'];
            $haystack=mb_strtolower($b['supplier_name'].' '.$b['supplier_bill_no'].' '.$b['voucher_no']);
            return $withinFrom && $withinTo && ($search==='' || str_contains($haystack,$search));
        }));
        return [$rows,200];
    }
    if($path==='bills' && $method==='POST')return [finance_bill($pdo,$body,$actor),200];
    if($path==='payments' && $method==='POST')return [finance_payment($pdo,$body,$actor),200];
    if($path==='returns' && $method==='POST')return [finance_event($pdo,$body,$actor),201];
    if(preg_match('#^(bills|payments)/([a-zA-Z0-9_-]{1,64})$#D',$path,$m)&&$method==='DELETE')return [finance_delete($pdo,$m[1],$m[2],$actor),200];
    return [['error'=>'API endpoint not found'],404];
}
