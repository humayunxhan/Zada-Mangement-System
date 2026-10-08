<?php
// Private CLI only. Credentials never enter process arguments or output.
if (PHP_SAPI !== 'cli') exit(1);
ini_set('display_errors', '0');
umask(0077);
$defaults = null;
$failed = false;
try {
    $private = dirname(__DIR__);
    $cfg = require $private.'/config.php';
    $stamp = $argv[1] ?? '';
    if (!preg_match('/^\d{8}T\d{6}Z$/D', $stamp) ||
        !preg_match('/^u728298835_.*spms$/i', $cfg['db_name']) || $cfg['db_host'] !== 'localhost') {
        throw new RuntimeException('Unexpected backup target');
    }
    $output = $private.'/backups/'.$stamp.'.sql';
    if (file_exists($output)) throw new RuntimeException('Backup already exists');
    $quote = fn($s) => '"'.str_replace(["\\", '"', "\n", "\r"], ["\\\\", '\\"', '\\n', '\\r'], $s).'"';
    $defaults = tempnam($private, '.mysql-');
    file_put_contents($defaults, "[client]\nhost=".$quote($cfg['db_host'])."\nuser=".$quote($cfg['db_user'])."\npassword=".$quote($cfg['db_pass'])."\n");
    chmod($defaults, 0600);
    $process = proc_open(['/usr/bin/mysqldump', '--defaults-extra-file='.$defaults, '--single-transaction', '--skip-lock-tables', '--no-tablespaces', $cfg['db_name']],
        [0=>['pipe','r'], 1=>['file',$output,'x'], 2=>['pipe','w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Backup process unavailable');
    fclose($pipes[0]);
    stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($process);
    $dump = file_get_contents($output);
    if ($code !== 0 || strlen($dump) < 100 || !str_contains($dump, 'CREATE TABLE `bills`') || !str_contains($dump, 'CREATE TABLE `payments`') || !str_contains($dump, 'CREATE TABLE `users`')) {
        throw new RuntimeException('Database backup verification failed');
    }
    chmod($output, 0600);
    echo "PASS: dedicated SPMS database backup created and checked.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Database backup failed; deployment must not continue.\n"); $failed = true;
} finally {
    if ($defaults && is_file($defaults)) unlink($defaults);
}
if ($failed) exit(1);
