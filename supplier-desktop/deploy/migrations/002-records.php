<?php
function migrate_records($pdo,$temporary=false) {
    $mysql=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql';
    $create=$mysql&&$temporary?'CREATE TEMPORARY TABLE IF NOT EXISTS':'CREATE TABLE IF NOT EXISTS';
    $id=$mysql?'INT AUTO_INCREMENT PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT';
    $text=$mysql?'LONGTEXT':'TEXT';$engine=$mysql?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4':'';
    $pdo->exec("$create supplier_audit_log (id $id, sync_id VARCHAR(64) NOT NULL UNIQUE, actor VARCHAR(255) NOT NULL, action VARCHAR(50) NOT NULL, entity VARCHAR(50) NOT NULL, record_id VARCHAR(64) NOT NULL DEFAULT '', before_json $text, after_json $text, details_json $text, created_at VARCHAR(40) NOT NULL)$engine");
    $pdo->query('SELECT sync_id,actor,action,entity,record_id,before_json,after_json,details_json,created_at FROM supplier_audit_log LIMIT 0');
    $ignore=$mysql?'INSERT IGNORE':'INSERT OR IGNORE';$pdo->exec("$ignore INTO spms_migrations (version) VALUES ('002-records')");
}
