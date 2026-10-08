<?php
// CLI-only, additive migration. No updates/deletes to existing financial rows.
function migrate_returns($pdo, $temporary = false) {
    $mysql=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql';
    $create=$temporary && $mysql ? 'CREATE TEMPORARY TABLE IF NOT EXISTS' : 'CREATE TABLE IF NOT EXISTS';
    $engine=$mysql?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4':'';
    $identity=$mysql?'INT AUTO_INCREMENT PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT';
    $pdo->exec("$create supplier_ledger_events (
        id $identity, sync_id VARCHAR(64) NOT NULL UNIQUE, kind VARCHAR(20) NOT NULL,
        bill_sync_id VARCHAR(64) NOT NULL, target_bill_sync_id VARCHAR(64) NOT NULL DEFAULT '',
        event_date VARCHAR(10) NOT NULL, amount DECIMAL(12,2) NOT NULL,
        payment_mode VARCHAR(50) DEFAULT '', reference_no VARCHAR(100) DEFAULT '',
        remarks TEXT, created_by VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )$engine");
    $pdo->exec("$create supplier_sync_state (id INT PRIMARY KEY, source_id VARCHAR(64) NOT NULL, version BIGINT NOT NULL DEFAULT 0)$engine");
    $pdo->exec("$create supplier_sync_outbox (id $identity, payload TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)$engine");
    $pdo->exec("$create spms_migrations (version VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)$engine");
    $ignore=$mysql?'INSERT IGNORE':'INSERT OR IGNORE';
    $pdo->prepare("$ignore INTO supplier_sync_state (id,source_id,version) VALUES (1,?,0)")->execute([bin2hex(random_bytes(16))]);
    // Validate shape even when tables were created by a previous failed attempt.
    $pdo->query('SELECT sync_id,kind,bill_sync_id,target_bill_sync_id,event_date,amount,payment_mode,reference_no,remarks,created_by,created_at FROM supplier_ledger_events LIMIT 0');
    $pdo->query('SELECT source_id,version FROM supplier_sync_state WHERE id=1');
    foreach (['idx_source'=>'bill_sync_id','idx_target'=>'target_bill_sync_id','idx_date'=>'event_date'] as $name=>$column) {
        if($mysql){$exists=false;foreach($pdo->query('SHOW INDEX FROM supplier_ledger_events') as $r)if($r['Key_name']===$name)$exists=true;}
        else {$exists=false;foreach($pdo->query("PRAGMA index_list('supplier_ledger_events')") as $r)if($r['name']===$name)$exists=true;}
        if(!$exists)$pdo->exec("CREATE INDEX $name ON supplier_ledger_events ($column)");
    }
    $pdo->exec("$ignore INTO spms_migrations (version) VALUES ('001-returns')");
}
