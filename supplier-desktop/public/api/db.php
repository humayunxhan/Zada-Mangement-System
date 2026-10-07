<?php
require_once __DIR__ . '/jwt.php';

function get_config() {
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function get_db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $cfg = get_config();
    $dsn = "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4";

    try {
        $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'Service temporarily unavailable. Please contact the administrator.'
        ]);
        exit;
    }

    // Schema provisioning is CLI-only; requests never create users or tables.
    return $pdo;
}

function init_schema($pdo, $cfg) {
    // 1. Users Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(100) NOT NULL,
            role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
            status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // 2. Bills Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS bills (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sync_id VARCHAR(64) NOT NULL UNIQUE,
            posting_date VARCHAR(20) NOT NULL,
            bill_date VARCHAR(20) NOT NULL,
            supplier_name VARCHAR(255) NOT NULL,
            supplier_bill_no VARCHAR(100) DEFAULT '',
            voucher_no VARCHAR(100) DEFAULT '',
            total_bill_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
            tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            actual_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            category VARCHAR(50) NOT NULL DEFAULT 'PAYABLE',
            remarks TEXT,
            created_by VARCHAR(50) DEFAULT NULL,
            deleted_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_posting_date (posting_date),
            INDEX idx_supplier_name (supplier_name),
            INDEX idx_deleted_at (deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // 3. Payments Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sync_id VARCHAR(64) NOT NULL UNIQUE,
            bill_sync_id VARCHAR(64) NOT NULL,
            payment_date VARCHAR(20) NOT NULL,
            amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            payment_mode VARCHAR(50) NOT NULL DEFAULT 'COUNTER_CASH',
            reference_no VARCHAR(100) DEFAULT '',
            remarks TEXT,
            created_by VARCHAR(50) DEFAULT NULL,
            deleted_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_bill_sync_id (bill_sync_id),
            INDEX idx_payment_date (payment_date),
            INDEX idx_deleted_at (deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // 4. Default Admin User if empty
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
    $row = $stmt->fetch();
    if ($row && (int)$row['count'] === 0) {
        $user = $cfg['default_admin_user'] ?? '';
        $pass = $cfg['default_admin_pass'] ?? '';
        if (!$user || strlen($pass) < 16) throw new RuntimeException('A strong initial admin credential is required');
        $hash = password_hash($pass, PASSWORD_BCRYPT);

        $ins = $pdo->prepare("INSERT INTO users (username, password_hash, full_name, role, status) VALUES (?, ?, ?, 'admin', 'active')");
        $ins->execute([$user, $hash, 'System Administrator']);
    }
}
