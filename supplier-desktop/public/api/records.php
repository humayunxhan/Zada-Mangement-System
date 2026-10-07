<?php
// Authenticated management services. Financial backups never include accounts or secrets.
function records_fields() {
    return [
        'bills'=>explode(',', 'sync_id,posting_date,bill_date,supplier_name,supplier_bill_no,voucher_no,total_bill_amount,tax_percent,tax_amount,actual_amount,category,remarks,deleted_at,created_at,created_by'),
        'payments'=>explode(',', 'sync_id,bill_sync_id,payment_date,amount,payment_mode,reference_no,remarks,deleted_at,created_at,created_by'),
        'events'=>explode(',', 'sync_id,kind,bill_sync_id,target_bill_sync_id,event_date,amount,payment_mode,reference_no,remarks,created_by,created_at'),
        'audit'=>explode(',', 'sync_id,actor,action,entity,record_id,before_json,after_json,details_json,created_at'),
    ];
}
function records_json($value) { return json_encode($value, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); }
function records_clean($table,$row) { $out=[]; foreach(records_fields()[$table] as $k)$out[$k]=$row[$k]??null; return $out; }
function records_audit($pdo,$actor,$action,$entity,$id='',$before=null,$after=null,$details=[]) {
    $table=['bill'=>'bills','payment'=>'payments','event'=>'events'][$entity]??null;
    if($table){if($before)$before=records_clean($table,$before);if($after)$after=records_clean($table,$after);}
    if($before && $before==$after)return;
    $pdo->prepare('INSERT INTO supplier_audit_log (sync_id,actor,action,entity,record_id,before_json,after_json,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)')->execute([bin2hex(random_bytes(16)),$actor,$action,$entity,$id,records_json($before),records_json($after),records_json($details),gmdate('Y-m-d\TH:i:s\Z')]);
}
function records_duplicates($input,$bills) {
    $norm=fn($v)=>mb_strtolower(preg_replace('/\s+/u',' ',trim((string)$v)));
    $invoice=$norm($input['supplier_bill_no']??'');if($invoice==='')return [];
    return array_values(array_filter($bills,fn($b)=>empty($b['deleted_at']) && $b['sync_id']!==($input['sync_id']??'') && $norm($b['supplier_name'])===$norm($input['supplier_name']??'') && $norm($b['supplier_bill_no'])===$invoice));
}
function records_check_duplicate($input,$bills) {
    $ids=array_column(records_duplicates($input,$bills),'sync_id');
    if(array_diff($ids,is_array($input['duplicate_acknowledged']??null)?$input['duplicate_acknowledged']:[]))ledger_fail('This supplier invoice already exists. Review the duplicate warning and choose Save anyway if intentional.');
    return $ids;
}
function records_snapshot($pdo) {
    $s=finance_state($pdo);
    $s['events']=$pdo->query('SELECT * FROM supplier_ledger_events ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $s['audit']=$pdo->query('SELECT * FROM supplier_audit_log ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $sync=$pdo->query('SELECT * FROM supplier_sync_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
    $s['sync']=['sourceId'=>$sync['source_id'],'version'=>(int)$sync['version']];return $s;
}
function records_encode($s) {
    $data=[];foreach(records_fields() as $table=>$fields)$data[$table]=array_map(fn($r)=>records_clean($table,$r),$s[$table]??[]);
    $sync=$s['sync']??null;
    return ['format'=>'zada-supplier-backup','version'=>1,'createdAt'=>gmdate('Y-m-d\TH:i:s\Z'),'sync'=>$sync,'checksum'=>hash('sha256',records_json(['data'=>$data,'sync'=>$sync])),'data'=>$data];
}
function records_dir($cfg) {
    $dir=$cfg['private_dir'].'/financial-backups';
    if(!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir))throw new RuntimeException('Backup directory unavailable');
    return $dir;
}
function records_file($cfg,$id) {
    if(!is_string($id)||!preg_match('/^backup-[0-9TZ.-]+-[a-f0-9-]+\.json$/D',$id))ledger_fail('Invalid backup name.');
    return records_dir($cfg).'/'.$id;
}
function records_backups($cfg) {
    $items=[];foreach(glob(records_dir($cfg).'/backup-*.json') as $path){
        $id=basename($path);if(!preg_match('/^backup-[0-9TZ.-]+-[a-f0-9-]+\.json$/D',$id))continue;
        $items[]=['id'=>$id,'createdAt'=>gmdate('Y-m-d\TH:i:s\Z',filemtime($path)),'bytes'=>filesize($path)];
    }
    usort($items,fn($a,$b)=>strcmp($b['createdAt'],$a['createdAt'])?:strcmp($b['id'],$a['id']));return $items;
}
function records_write_backup($cfg,$backup) {
    $id='backup-'.gmdate('Y-m-d\TH-i-s\Z').'-'.bin2hex(random_bytes(16)).'.json';$file=records_file($cfg,$id);
    $json=records_json($backup);if(strlen($json)>50*1024*1024)ledger_fail('Backup exceeds the supported 50 MB limit.');
    $old=umask(0077);
    try {if(file_put_contents($file.'.pending',$json,LOCK_EX)!==strlen($json) || !rename($file.'.pending',$file))throw new RuntimeException('Backup could not be written');}
    finally{umask($old);}
    // No automatic deletion: keep all private snapshots until an admin archives them.
    return ['id'=>$id,'createdAt'=>$backup['createdAt']];
}
function records_read_backup($cfg,$id) {
    $file=records_file($cfg,$id);
    if(!is_file($file)||filesize($file)>50*1024*1024)ledger_fail('Backup unavailable or too large.');
    return json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
}
function records_backup($pdo,$cfg,$actor,$reason='MANUAL') {
    return finance_mutate($pdo,function()use($pdo,$cfg,$actor,$reason){
        $result=records_write_backup($cfg,records_encode(records_snapshot($pdo)));
        records_audit($pdo,$actor,'BACKUP','backup',$result['id'],null,null,['reason'=>$reason]);return $result;
    });
}
function records_decode($input) {
    if(!is_array($input)||($input['format']??'')!=='zada-supplier-backup'||($input['version']??0)!==1||!is_array($input['data']??null))ledger_fail('Unsupported backup.');
    if(!hash_equals(hash('sha256',records_json(['data'=>$input['data'],'sync'=>$input['sync']??null])),(string)($input['checksum']??'')))ledger_fail('Backup checksum does not match.');
    if(!is_string($input['createdAt']??null)||strtotime($input['createdAt'])===false)ledger_fail('Invalid backup timestamp.');
    $sync=$input['sync']??null;
    if($sync && (!preg_match('/^[a-zA-Z0-9-]{1,64}$/D',$sync['sourceId']??'') || !is_int($sync['version']??null) || $sync['version']<0))ledger_fail('Invalid backup identity.');
    $data=[];
    foreach(records_fields() as $table=>$fields){
        $rows=$input['data'][$table]??null;if(!is_array($rows)||!array_is_list($rows)||count($rows)>200000)ledger_fail('Invalid backup records.');
        $data[$table]=[];$seen=[];
        foreach($rows as $row){
            if(!is_array($row))ledger_fail('Invalid backup record.');
            $id=ledger_id($row['sync_id']??'');if(isset($seen[$id]))ledger_fail('Duplicate backup ID.');$seen[$id]=true;
            $r=records_clean($table,$row);
            foreach($r as $value)if($value!==null&&!is_scalar($value))ledger_fail('Invalid backup value.');
            foreach(['created_at','deleted_at'] as $key)if(!empty($r[$key])&&strtotime($r[$key])===false)ledger_fail('Invalid record timestamp.');
            $data[$table][]=$r;
        }
    }
    foreach($data['bills'] as $b){
        ledger_date($b['posting_date']);ledger_date($b['bill_date']);ledger_positive($b['total_bill_amount']);
        if(!trim($b['supplier_name'])||!in_array($b['category'],['PAYABLE','BILL_TO_BILL','SALE_BASED','DISPUTED'],true))ledger_fail('Invalid backup bill.');
        foreach(['total_bill_amount','tax_percent','tax_amount','actual_amount'] as $k)if(!is_numeric($b[$k])||(float)$b[$k]<0)ledger_fail('Invalid backup amounts.');
        if($b['tax_percent']>100||ledger_cents(round($b['total_bill_amount']*$b['tax_percent']/100,2))!==ledger_cents($b['tax_amount'])||ledger_cents($b['total_bill_amount'])-ledger_cents($b['tax_amount'])!==ledger_cents($b['actual_amount']))ledger_fail('Backup totals do not match.');
    }
    $bills=array_column(ledger_active($data['bills']),null,'sync_id');
    foreach($data['payments'] as $p){ledger_date($p['payment_date']);ledger_positive($p['amount']);if(empty($p['deleted_at'])&&!isset($bills[$p['bill_sync_id']]))ledger_fail('Orphaned backup payment.');}
    $events=array_map('ledger_event_row',$data['events']);usort($events,fn($a,$b)=>strcmp($a['eventDate'],$b['eventDate']));$replay=[];
    foreach($events as $e){$payments=array_values(array_filter($data['payments'],fn($p)=>$p['payment_date']<=$e['eventDate']));ledger_validate_event($e,$data['bills'],$payments,$replay);$replay[]=$e;}
    return $data;
}
function records_protect($current,$data) {
    $events=array_column($data['events'],null,'sync_id');$bills=array_column($data['bills'],null,'sync_id');$payments=array_column($data['payments'],null,'sync_id');
    foreach($current['events'] as $old){
        if(!isset($events[$old['sync_id']])||ledger_normalize_event(ledger_event_row($old))!=ledger_normalize_event(ledger_event_row($events[$old['sync_id']])))ledger_fail('Backup would remove or change settlement history.');
        foreach(array_filter([$old['bill_sync_id'],$old['target_bill_sync_id']]) as $id){
            $before=array_column($current['bills'],null,'sync_id')[$id];$after=$bills[$id]??null;
            if(!$after||!empty($after['deleted_at']))ledger_fail('Backup would remove a protected bill.');
            foreach(array_diff(records_fields()['bills'],['created_by','created_at','remarks']) as $k)if((string)($before[$k]??'')!==(string)($after[$k]??''))ledger_fail('Backup would alter a protected bill.');
            foreach($current['payments'] as $p)if($p['bill_sync_id']===$id&&empty($p['deleted_at'])){
                $next=$payments[$p['sync_id']]??null;if(!$next||!empty($next['deleted_at']))ledger_fail('Backup would remove protected payment history.');
                foreach(array_diff(records_fields()['payments'],['created_by','created_at']) as $k)if((string)($p[$k]??'')!==(string)($next[$k]??''))ledger_fail('Backup would alter protected payment history.');
            }
        }
    }
}
function records_restore($pdo,$cfg,$input,$actor) {
    $data=records_decode($input);
    return finance_mutate($pdo,function()use($pdo,$cfg,$input,$actor,$data){
        $current=records_snapshot($pdo);
        if(!empty($input['sync'])&&$input['sync']['sourceId']!==$current['sync']['sourceId']&&($current['bills']||$current['payments']||$current['events']))ledger_fail('Backup belongs to another supplier database.');
        records_protect($current,$data);
        $safety=records_write_backup($cfg,records_encode($current));
        foreach(['bills','payments'] as $table){$ids=array_column($data[$table],'sync_id');foreach($current[$table] as $r)if(!in_array($r['sync_id'],$ids,true)){$r['deleted_at']=$r['deleted_at']?:gmdate('Y-m-d H:i:s');$data[$table][]=records_clean($table,$r);}}
        foreach(['events'=>'supplier_ledger_events','payments'=>'payments','bills'=>'bills'] as $table=>$destination){
            $pdo->exec('DELETE FROM '.$destination);$keys=records_fields()[$table];
            $stmt=$pdo->prepare('INSERT INTO '.$destination.' ('.implode(',',$keys).') VALUES ('.implode(',',array_fill(0,count($keys),'?')).')');
            foreach($data[$table] as $r){foreach(['created_at','deleted_at'] as $k)if(!empty($r[$k]))$r[$k]=gmdate('Y-m-d H:i:s',strtotime($r[$k]));$stmt->execute(array_map(fn($k)=>$r[$k],$keys));}
        }
        $ignore=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?'INSERT IGNORE':'INSERT OR IGNORE';$keys=records_fields()['audit'];
        $stmt=$pdo->prepare($ignore.' INTO supplier_audit_log ('.implode(',',$keys).') VALUES ('.implode(',',array_fill(0,count($keys),'?')).')');
        foreach($data['audit'] as $r)$stmt->execute(array_map(fn($k)=>$r[$k],$keys));
        if(!empty($input['sync']))$pdo->prepare('UPDATE supplier_sync_state SET source_id=?,version=? WHERE id=1')->execute([$input['sync']['sourceId'],max($current['sync']['version'],$input['sync']['version'])+1]);
        records_audit($pdo,$actor,'RESTORE','backup','',null,null,['backupDate'=>$input['createdAt'],'safetyBackup'=>$safety['id']]);
        return ['safetyBackup'=>$safety['id'],'bills'=>count($data['bills']),'payments'=>count($data['payments']),'events'=>count($data['events'])];
    });
}
function records_audit_list($pdo,$filters) {
    $where=[];$args=[];
    foreach(['from'=>'>=','to'=>'<='] as $key=>$op)if(!empty($filters[$key])){
        ledger_date($filters[$key]);$time=$filters[$key].($key==='from'?'T00:00:00+05:00':'T23:59:59+05:00');$where[]='created_at '.$op.' ?';$args[]=gmdate('Y-m-d\TH:i:s\Z',strtotime($time));
    }
    if(!empty($filters['action'])){$where[]='action=?';$args[]=ledger_text($filters['action'],50);}
    if(!empty($filters['search'])){$where[]='(actor LIKE ? OR action LIKE ? OR entity LIKE ? OR record_id LIKE ?)';$search='%'.ledger_text($filters['search'],255).'%';array_push($args,$search,$search,$search,$search);}
    $limit=min(1000,max(1,(int)($filters['limit']??200)));
    $stmt=$pdo->prepare('SELECT * FROM supplier_audit_log'.($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY id DESC LIMIT '.$limit);$stmt->execute($args);return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
function records_export($pdo,$input) {
    $s=finance_read($pdo);$ids=is_array($input['ids']??null)?$input['ids']:[];$dataset=$input['dataset']??'bills';
    $rows=ledger_decorate($s['bills'],$s['payments'],$s['events']);$selected=array_values(array_filter($rows,fn($b)=>in_array($b['sync_id'],$ids,true)));
    if($dataset==='bills')return ['rows'=>$selected];
    $bills=array_column($s['bills'],null,'sync_id');$result=[];
    if($dataset==='events'){
        foreach($s['events'] as $e)if(in_array($e['syncId'],$ids,true)&& (empty($input['from'])||$e['eventDate']>=$input['from'])&&(empty($input['to'])||$e['eventDate']<=$input['to']))$result[]=['sync_id'=>$e['syncId'],'kind'=>$e['kind'],'bill_sync_id'=>$e['billSyncId'],'target_bill_sync_id'=>$e['targetBillSyncId'],'event_date'=>$e['eventDate'],'amount'=>$e['amount'],'payment_mode'=>$e['paymentMode'],'reference_no'=>$e['referenceNo'],'remarks'=>$e['remarks'],'created_by'=>$e['createdBy'],'created_at'=>$e['createdAt']];
    }elseif($dataset==='payments'){$selectedIds=array_column($selected,'sync_id');$result=array_values(array_filter(ledger_active($s['payments']),fn($p)=>in_array($p['bill_sync_id'],$selectedIds,true)));}
    else ledger_fail('Invalid export dataset.');
    foreach($result as &$r){$b=$bills[$r['bill_sync_id']]??[];$r['supplier_name']=$b['supplier_name']??'';$r['supplier_bill_no']=$b['supplier_bill_no']??'';}
    return ['rows'=>$result];
}
function records_route($pdo,$cfg,$user,$path,$method,$input,$query) {
    if($path==='records/duplicates'&&$method==='POST')return [records_duplicates($input,finance_read($pdo)['bills']),200];
    if($path==='records/export'&&$method==='POST'&&($input['dataset']??'')!=='audit')return [records_export($pdo,$input),200];
    if(($user['role']??'')!=='admin')return [['error'=>'Administrator access required.'],403];
    if($path==='records/export'&&$method==='POST')return [['rows'=>records_audit_list($pdo,$input)],200];
    if($path==='records/audit'&&$method==='GET')return [records_audit_list($pdo,$query),200];
    if($path==='records/backups'&&$method==='GET')return [['items'=>records_backups($cfg),'schedule'=>'Daily on authenticated use; snapshots retained privately','error'=>is_file(records_dir($cfg).'/.last-error')?'Automatic backup could not be completed. Create a backup and contact the administrator if it fails.':null],200];
    if($path==='records/backups'&&$method==='POST')return [records_backup($pdo,$cfg,$user['username']),201];
    if(preg_match('#^records/backups/([^/]+)$#D',$path,$m)&&$method==='GET')return [records_read_backup($cfg,rawurldecode($m[1])),200];
    if($path==='records/restore'&&$method==='POST')return [records_restore($pdo,$cfg,!empty($input['id'])?records_read_backup($cfg,$input['id']):($input['backup']??null),$user['username']),200];
    return [['error'=>'API endpoint not found'],404];
}
function records_automatic_backup($pdo,$cfg) {
    $items=records_backups($cfg);if($items&&time()-strtotime($items[0]['createdAt'])<86400)return;
    $file=fopen(records_dir($cfg).'/.schedule-lock','c');if(!$file)return;
    try{if(flock($file,LOCK_EX|LOCK_NB)){$items=records_backups($cfg);if(!$items||time()-strtotime($items[0]['createdAt'])>=86400){records_backup($pdo,$cfg,'system','AUTOMATIC');if(is_file(records_dir($cfg).'/.last-error'))unlink(records_dir($cfg).'/.last-error');}}}
    catch(Throwable $e){file_put_contents(records_dir($cfg).'/.last-error','Backup failed',LOCK_EX);throw $e;}
    finally{fclose($file);}
}
