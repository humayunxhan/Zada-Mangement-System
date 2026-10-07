<?php
// PHP counterpart of server/src/modules/suppliers/ledger.cjs.
// All financial calculations use integer cents; historical rows remain intact.
class LedgerError extends RuntimeException {}
function ledger_fail($message) { throw new LedgerError($message); }
function ledger_cents($n) { return (int) round((float)$n * 100); }
function ledger_positive($value) {
    if (!is_numeric($value) || !is_finite((float)$value) || (float)$value > 9999999999.99 || ledger_cents($value) <= 0) ledger_fail('Enter a positive amount within the supported currency range.');
    return ledger_cents($value) / 100;
}
function ledger_date($value) {
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) ledger_fail('Enter a valid date (YYYY-MM-DD).');
    [$year,$month,$day] = array_map('intval', explode('-', $value));
    if (!checkdate($month,$day,$year)) ledger_fail('Enter a valid date (YYYY-MM-DD).');
    return $value;
}
function ledger_text($value, $limit = 65535) {
    if (!is_string($value) && !is_numeric($value)) ledger_fail('Invalid text field.');
    $value = trim((string)$value);
    if (mb_strlen($value) > $limit) ledger_fail('A field exceeds its allowed length.');
    return $value;
}
function ledger_id($value) {
    $value=ledger_text($value,64);
    if ($value === '' || !preg_match('/^[a-zA-Z0-9_-]+$/D',$value)) ledger_fail('Invalid record reference.');
    return $value;
}
function ledger_event_row($e) {
    return ['syncId'=>$e['sync_id'],'kind'=>$e['kind'],'billSyncId'=>$e['bill_sync_id'],'targetBillSyncId'=>$e['target_bill_sync_id'] ?? '',
        'eventDate'=>$e['event_date'],'amount'=>(float)$e['amount'],'paymentMode'=>$e['payment_mode'] ?? '',
        'referenceNo'=>$e['reference_no'] ?? '', 'remarks'=>$e['remarks'] ?? '', 'createdAt'=>$e['created_at'] ?? '', 'createdBy'=>$e['created_by'] ?? ''];
}
function ledger_active($rows) { return array_values(array_filter($rows, fn($r)=>empty($r['deleted_at']))); }
function ledger_decorate($bills, $payments, $events) {
    $out=[];
    foreach (ledger_active($bills) as $b) {
        $id=$b['sync_id']; $linked=array_values(array_filter(ledger_active($payments),fn($p)=>$p['bill_sync_id']===$id));
        $history=array_values(array_filter($events,fn($e)=>$e['billSyncId']===$id || $e['targetBillSyncId']===$id));
        usort($history,fn($a,$c)=>strcmp($a['eventDate'],$c['eventDate']) ?: strcmp($a['createdAt'] ?? '',$c['createdAt'] ?? ''));
        $paid=array_sum(array_map(fn($p)=>ledger_cents($p['amount']),$linked));
        $returned=$refunded=$used=$received=0; $lastReturn=null;
        foreach ($history as $e) {
            $amount=ledger_cents($e['amount']);
            if ($e['billSyncId']===$id) {
                if ($e['kind']==='RETURN') { $returned+=$amount; $lastReturn=$e['eventDate']; }
                if ($e['kind']==='REFUND') $refunded+=$amount;
                if ($e['kind']==='ADJUSTMENT') $used+=$amount;
            }
            if ($e['kind']==='ADJUSTMENT' && $e['targetBillSyncId']===$id) $received+=$amount;
        }
        $net=max(0,ledger_cents($b['actual_amount'])-$returned); $excluded=$b['category']!=='PAYABLE';
        $effective=$paid+$received-$refunded-$used;
        $remaining=$excluded ? 0 : max(0,$net-$effective); $credit=$excluded ? 0 : max(0,$effective-$net);
        $returnStatus=$returned>0 ? ($net===0 ? 'RETURNED':'PARTIALLY_RETURNED'):'NONE';
        $status=$excluded ? $b['category'] : ($net===0 && $returned>0 ? 'RETURNED' : ($remaining===0 ? ($credit>0?'OVERPAID':'COMPLETE') : ($effective>0?'PARTIAL':'UNPAID')));
        foreach (['total_bill_amount','tax_percent','tax_amount','actual_amount'] as $k) $b[$k]=(float)$b[$k];
        $b['id']=(int)$b['id'];
        $b['payments']=array_map(function($p){$p['amount']=(float)$p['amount'];$p['id']=(int)$p['id'];return $p;},$linked);
        $b['ledgerEvents']=$history;
        foreach (['paid_amount'=>$paid,'returned_amount'=>$returned,'net_payable'=>$excluded?0:$net,'refund_amount'=>$refunded,'credit_used'=>$used,'credit_applied'=>$received,'remaining_balance'=>$remaining,'pending_credit'=>$credit] as $key=>$value) $b[$key]=$value/100;
        $b['payment_status']=$status; $b['return_status']=$returnStatus; $b['credit_status']=$credit>0?'CREDIT_PENDING':($returned>0 && ($refunded+$used)>0?'SETTLED':'NONE'); $b['last_return_date']=$lastReturn;
        $out[]=$b;
    }
    return $out;
}
function ledger_normalize_event($input) {
    $kind=$input['kind'] ?? '';
    if (!in_array($kind,['RETURN','REFUND','ADJUSTMENT'],true)) ledger_fail('Invalid return/settlement type.');
    return ['syncId'=>ledger_id($input['syncId'] ?? ''),'kind'=>$kind,'billSyncId'=>ledger_id($input['billSyncId'] ?? ''),
        'targetBillSyncId'=>$kind==='ADJUSTMENT'?ledger_id($input['targetBillSyncId'] ?? ''):'',
        'eventDate'=>ledger_date($input['eventDate'] ?? ''),'amount'=>ledger_positive($input['amount'] ?? null),
        'paymentMode'=>$kind==='REFUND'?ledger_text($input['paymentMode'] ?? 'COUNTER_CASH',50):'',
        'referenceNo'=>ledger_text($input['referenceNo'] ?? '',100),'remarks'=>ledger_text($input['remarks'] ?? '')];
}
function ledger_chronological($bill,$date,$includePayments=true) {
    $dates=[$bill['posting_date'],$bill['bill_date']];
    if ($includePayments) foreach ($bill['payments'] as $p) $dates[]=$p['payment_date'];
    foreach ($bill['ledgerEvents'] as $e) $dates[]=$e['eventDate'];
    $latest=max($dates);
    if ($date<$latest) ledger_fail('Date must be on or after '.$latest.', the latest activity for this bill.');
}
function ledger_validate_event($input,$bills,$payments,$events) {
    $e=ledger_normalize_event($input);
    foreach ($events as $old) if ($old['syncId']===$e['syncId']) {
        if (ledger_normalize_event($old)!=$e) ledger_fail('This reference was already used for a different transaction.');
        return $e;
    }
    $rows=array_column(ledger_decorate($bills,$payments,$events),null,'sync_id');
    $source=$rows[$e['billSyncId']] ?? null;
    if (!$source || $source['category']!=='PAYABLE') ledger_fail('Select an active payable bill.');
    ledger_chronological($source,$e['eventDate']);
    $amount=ledger_cents($e['amount']);
    if ($e['kind']==='RETURN') {
        if (!$e['remarks']) ledger_fail('Enter a return reason.');
        if ($amount>ledger_cents($source['actual_amount'])-ledger_cents($source['returned_amount'])) ledger_fail('Return exceeds the unreturned net bill amount.');
    } else {
        if ($amount>ledger_cents($source['pending_credit'])) ledger_fail('Amount exceeds available supplier credit.');
        if ($e['kind']==='ADJUSTMENT') {
            $target=$rows[$e['targetBillSyncId']] ?? null;
            if (!$target || $target['sync_id']===$source['sync_id'] || $target['category']!=='PAYABLE' || mb_strtolower(trim($target['supplier_name']))!==mb_strtolower(trim($source['supplier_name']))) ledger_fail('Choose another payable bill from the same supplier.');
            ledger_chronological($target,$e['eventDate']);
            if ($amount>ledger_cents($target['remaining_balance'])) ledger_fail('Adjustment exceeds the target bill balance.');
        }
    }
    return $e;
}
function ledger_unlocked($id,$events) {
    foreach ($events as $e) if ($e['billSyncId']===$id || $e['targetBillSyncId']===$id) ledger_fail('This bill has return/settlement history. Its original bill and payments are preserved.');
}
function ledger_validate_payment($p,$bills,$payments,$events) {
    ledger_date($p['payment_date']); ledger_positive($p['amount']);
    foreach ($payments as $old) if ($old['sync_id']===$p['sync_id']) { ledger_unlocked($old['bill_sync_id'],$events);ledger_unlocked($p['bill_sync_id'],$events); }
    $remaining=array_values(array_filter($payments,fn($old)=>$old['sync_id']!==$p['sync_id']));
    $rows=array_column(ledger_decorate($bills,$remaining,$events),null,'sync_id');$bill=$rows[$p['bill_sync_id']] ?? null;
    if (!$bill || $bill['category']!=='PAYABLE') ledger_fail('Select an active payable bill.');
    ledger_chronological($bill,$p['payment_date'],false);
    if (ledger_cents($p['amount'])>ledger_cents($bill['remaining_balance'])) ledger_fail('Payment exceeds the remaining bill balance.');
}
