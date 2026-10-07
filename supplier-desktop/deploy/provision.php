<?php
// Run only over SSH; never upload this file beneath public_html.
if (PHP_SAPI !== 'cli') exit(1);
ini_set('display_errors', '0');
try {
    $private = __DIR__;
    $cfg = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
    foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $field) {
        if (!is_string($cfg[$field] ?? null) || $cfg[$field] === '') throw new RuntimeException('Incomplete credentials');
    }
    if (!preg_match('/^u728298835_[a-zA-Z0-9_]*spms$/i', $cfg['db_name'])) throw new RuntimeException('Not the dedicated SPMS database');
    if ($cfg['db_host'] !== 'localhost') throw new RuntimeException('Unexpected database host');
    if (is_file($private . '/config.php')) throw new RuntimeException('Already provisioned; configuration preserved');
    $pdo = new PDO("mysql:host=localhost;dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if ($pdo->query('SHOW TABLES')->fetch()) throw new RuntimeException('Database is not empty; existing data preserved');
    require dirname($private) . '/public_html/spms/api/db.php';
    $admin = ['username' => 'spms-admin', 'password' => bin2hex(random_bytes(16)), 'url' => 'https://spms.zadapharmacy.com'];
    $cfg['jwt_secret'] = bin2hex(random_bytes(32));
    $cfg['default_admin_user'] = $admin['username'];
    $cfg['default_admin_pass'] = $admin['password'];
    umask(0077);
    file_put_contents($private . '/initial-login.credentials.json', json_encode($admin, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    init_schema($pdo, $cfg);
    require $private . '/migrations/001-returns.php';
    migrate_returns($pdo);
    require $private . '/migrations/002-records.php';
    migrate_records($pdo);
    unset($cfg['default_admin_user'], $cfg['default_admin_pass']);
    $cfg['configured'] = true;
    file_put_contents($private . '/config.php.tmp', "<?php\nreturn " . var_export($cfg, true) . ";\n", LOCK_EX);
    rename($private . '/config.php.tmp', $private . '/config.php');
    echo "Dedicated database provisioned; private configuration saved.\n";
} catch (Throwable $e) {
    // Suppress driver details, which can contain private identifiers.
    fwrite(STDERR, $e instanceof PDOException ? "Database connection or schema setup failed.\n" : $e->getMessage() . "\n");
    exit(1);
}
