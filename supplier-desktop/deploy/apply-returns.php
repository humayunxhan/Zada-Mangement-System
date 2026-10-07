<?php
if(PHP_SAPI!=='cli')exit(1);
ini_set('display_errors','0');
require __DIR__.'/migrations/001-returns.php';
try {
    $cfg=require dirname(__DIR__).'/config.php';
    if(empty($cfg['configured']) || !preg_match('/^u728298835_.*spms$/i',$cfg['db_name']))throw new RuntimeException('Unexpected database');
    $pdo=new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4",$cfg['db_user'],$cfg['db_pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $snapshot=function()use($pdo){$hashes=[];foreach(['users','bills','payments'] as $t){$h=hash_init('sha256');foreach($pdo->query("SELECT * FROM $t ORDER BY id") as $row)hash_update($h,json_encode($row));$hashes[$t]=hash_final($h);}return $hashes;};
    $before=$snapshot();
    migrate_returns($pdo);migrate_returns($pdo);
    if($before!==$snapshot())throw new RuntimeException('Existing rows changed during migration');
    echo "PASS: additive migration applied twice; existing users/bills/payments unchanged.\n";
} catch(Throwable $e){fwrite(STDERR,"Migration failed (".get_class($e)."). Keep write pause active and inspect privately.\n");exit(1);}
