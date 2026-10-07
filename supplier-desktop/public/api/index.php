<?php
// ====================================================================
// Zada Pharmacy SPMS - Unified REST API Router (PHP + Hostinger MySQL)
// ====================================================================

require_once __DIR__ . '/db.php';

// Set JSON response headers and CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$pdo = get_db();
$cfg = get_config();

// Helper to send json
function send_json($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Helper to get request body
function get_json_body() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

// Helper to get bearer token user
function get_auth_user() {
    global $cfg;
    $headers = getallheaders();
    $auth = '';
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'authorization') {
            $auth = $v;
            break;
        }
    }
    if (!$auth && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (!$auth || !preg_match('/Bearer\s+(.+)$/i', $auth, $m)) {
        send_json(['error' => 'Authentication required. Please log in.'], 401);
    }

    $token = $m[1];
    $user = jwt_decode($token, $cfg['jwt_secret']);
    if (!$user) {
        send_json(['error' => 'Invalid or expired session. Please log in again.'], 401);
    }
    return $user;
}

function require_admin($user) {
    if (empty($user['role']) || $user['role'] !== 'admin') {
        send_json(['error' => 'Forbidden. Administrator privileges required.'], 403);
    }
}

function generate_uuid() {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

// Parse request path
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Normalize uri: remove leading /api or project subfolder if needed
$path = preg_replace('#^.*?/api/#', '', $uri);
$path = trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Health Check
if ($path === 'health') {
    send_json([
        'status' => 'ok',
        'service' => 'Zada Pharmacy SPMS PHP API',
        'database' => 'MySQL (Hostinger)',
        'timestamp' => date('c'),
    ]);
}

// ====================================================================
// AUTHENTICATION ROUTES
// ====================================================================

// POST /api/auth/login
if ($path === 'auth/login' && $method === 'POST') {
    $body = get_json_body();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) {
        send_json(['error' => 'Username and password are required'], 400);
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        send_json(['error' => 'Invalid username or password'], 401);
    }

    if ($user['status'] !== 'active') {
        send_json(['error' => 'This account has been deactivated. Contact Administrator.'], 403);
    }

    $payload = [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'],
        'role' => $user['role'],
    ];

    $token = jwt_encode($payload, $cfg['jwt_secret']);

    send_json([
        'token' => $token,
        'user' => $payload,
    ]);
}

// GET /api/auth/me
if ($path === 'auth/me' && $method === 'GET') {
    $authUser = get_auth_user();
    $stmt = $pdo->prepare('SELECT id, username, full_name, role, status, created_at FROM users WHERE id = ?');
    $stmt->execute([$authUser['id']]);
    $user = $stmt->fetch();
    if (!$user) send_json(['error' => 'User not found'], 404);
    send_json(['user' => $user]);
}

// POST /api/auth/change-password
if ($path === 'auth/change-password' && $method === 'POST') {
    $authUser = get_auth_user();
    $body = get_json_body();
    $curr = $body['current_password'] ?? '';
    $next = $body['new_password'] ?? '';

    if (!$curr || !$next) {
        send_json(['error' => 'Current and new password are required'], 400);
    }
    if (strlen($next) < 6) {
        send_json(['error' => 'New password must be at least 6 characters'], 400);
    }

    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$authUser['id']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($curr, $user['password_hash'])) {
        send_json(['error' => 'Current password is incorrect'], 400);
    }

    $newHash = password_hash($next, PASSWORD_BCRYPT);
    $up = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $up->execute([$newHash, $authUser['id']]);

    send_json(['success' => true, 'message' => 'Password updated successfully']);
}

// GET /api/auth/users (Admin only)
if ($path === 'auth/users' && $method === 'GET') {
    $authUser = get_auth_user();
    require_admin($authUser);

    $stmt = $pdo->query('SELECT id, username, full_name, role, status, created_at FROM users ORDER BY id ASC');
    send_json(['users' => $stmt->fetchAll()]);
}

// POST /api/auth/users (Admin only)
if ($path === 'auth/users' && $method === 'POST') {
    $authUser = get_auth_user();
    require_admin($authUser);

    $body = get_json_body();
    $username = trim($body['username'] ?? '');
    $full_name = trim($body['full_name'] ?? '');
    $password = $body['password'] ?? '';
    $role = ($body['role'] ?? '') === 'admin' ? 'admin' : 'operator';

    if (!$username || !$full_name || !$password) {
        send_json(['error' => 'Username, full name, and password are required'], 400);
    }
    if (strlen($password) < 6) {
        send_json(['error' => 'Password must be at least 6 characters'], 400);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $check->execute([$username]);
    if ($check->fetch()) {
        send_json(['error' => 'Username already exists'], 400);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $ins = $pdo->prepare('INSERT INTO users (username, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, "active")');
    $ins->execute([$username, $hash, $full_name, $role]);

    send_json([
        'success' => true,
        'user' => [
            'id' => (int)$pdo->lastInsertId(),
            'username' => $username,
            'full_name' => $full_name,
            'role' => $role,
            'status' => 'active',
        ],
    ], 201);
}

// PATCH /api/auth/users/{id}/status
if (preg_match('#^auth/users/(\d+)/status$#', $path, $m) && $method === 'PATCH') {
    $authUser = get_auth_user();
    require_admin($authUser);

    $targetId = (int)$m[1];
    if ($targetId === (int)$authUser['id']) {
        send_json(['error' => 'You cannot deactivate your own account'], 400);
    }

    $body = get_json_body();
    $status = ($body['status'] ?? '') === 'active' ? 'active' : 'inactive';

    $up = $pdo->prepare('UPDATE users SET status = ? WHERE id = ?');
    $up->execute([$status, $targetId]);

    send_json(['success' => true, 'status' => $status]);
}

// ====================================================================
// BILLS ROUTES
// ====================================================================

// GET /api/bills/suppliers
if ($path === 'bills/suppliers' && $method === 'GET') {
    get_auth_user();
    $stmt = $pdo->query('SELECT DISTINCT supplier_name FROM bills WHERE deleted_at IS NULL AND supplier_name != "" ORDER BY supplier_name ASC');
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    send_json($rows ?: []);
}

// GET /api/bills
if ($path === 'bills' && $method === 'GET') {
    get_auth_user();
    $from = $_GET['from'] ?? null;
    $to = $_GET['to'] ?? null;
    $search = $_GET['search'] ?? null;

    $sql = 'SELECT * FROM bills WHERE deleted_at IS NULL';
    $params = [];

    if ($from) {
        $sql .= ' AND posting_date >= ?';
        $params[] = $from;
    }
    if ($to) {
        $sql .= ' AND posting_date <= ?';
        $params[] = $to;
    }
    if ($search) {
        $sql .= ' AND (supplier_name LIKE ? OR supplier_bill_no LIKE ? OR voucher_no LIKE ?)';
        $s = "%$search%";
        $params[] = $s;
        $params[] = $s;
        $params[] = $s;
    }

    $sql .= ' ORDER BY posting_date DESC, id DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $bills = $stmt->fetchAll();

    // Fetch active payments
    $pStmt = $pdo->query('SELECT * FROM payments WHERE deleted_at IS NULL ORDER BY payment_date ASC, id ASC');
    $payments = $pStmt->fetchAll();

    $enriched = array_map(function ($b) use ($payments) {
        $linked = array_values(array_filter($payments, function ($p) use ($b) {
            return $p['bill_sync_id'] === $b['sync_id'];
        }));

        $paid = 0.0;
        foreach ($linked as $p) {
            $paid += (float)($p['amount'] ?? 0);
        }
        $paid = round($paid, 2);

        $excluded = !in_array($b['category'], ['PAYABLE', 'BILL_TO_BILL'], true);
        $actual = (float)($b['actual_amount'] ?? 0);
        $remaining = $excluded ? 0.0 : round(max(0.0, $actual - $paid), 2);

        if ($excluded) {
            $paymentStatus = $b['category'];
        } elseif ($paid == 0) {
            $paymentStatus = 'UNPAID';
        } elseif ($remaining > 0) {
            $paymentStatus = 'PARTIAL';
        } elseif ($paid > $actual) {
            $paymentStatus = 'OVERPAID';
        } else {
            $paymentStatus = 'COMPLETE';
        }

        return [
            'id' => (int)$b['id'],
            'sync_id' => $b['sync_id'],
            'posting_date' => $b['posting_date'],
            'bill_date' => $b['bill_date'],
            'supplier_name' => $b['supplier_name'],
            'supplier_bill_no' => $b['supplier_bill_no'],
            'voucher_no' => $b['voucher_no'],
            'total_bill_amount' => (float)$b['total_bill_amount'],
            'tax_percent' => (float)$b['tax_percent'],
            'tax_amount' => (float)$b['tax_amount'],
            'actual_amount' => $actual,
            'category' => $b['category'],
            'remarks' => $b['remarks'],
            'created_by' => $b['created_by'],
            'created_at' => $b['created_at'],
            'payments' => array_map(function ($p) {
                return [
                    'id' => (int)$p['id'],
                    'sync_id' => $p['sync_id'],
                    'bill_sync_id' => $p['bill_sync_id'],
                    'payment_date' => $p['payment_date'],
                    'amount' => (float)$p['amount'],
                    'payment_mode' => $p['payment_mode'],
                    'reference_no' => $p['reference_no'],
                    'remarks' => $p['remarks'],
                    'created_at' => $p['created_at'],
                ];
            }, $linked),
            'paid_amount' => $paid,
            'remaining_balance' => $remaining,
            'payment_status' => $paymentStatus,
        ];
    }, $bills);

    send_json($enriched);
}

// POST /api/bills
if ($path === 'bills' && $method === 'POST') {
    $authUser = get_auth_user();
    $b = get_json_body();

    $total = round((float)($b['total_bill_amount'] ?? 0), 2);
    $tax = (float)($b['tax_percent'] ?? 0);
    $taxAmount = round(($total * $tax) / 100, 2);
    $actual = round($total - $taxAmount, 2);
    $syncId = !empty($b['sync_id']) ? $b['sync_id'] : generate_uuid();

    $check = $pdo->prepare('SELECT id FROM bills WHERE sync_id = ?');
    $check->execute([$syncId]);
    $existing = $check->fetch();

    if ($existing) {
        $up = $pdo->prepare('UPDATE bills SET
            posting_date = ?, bill_date = ?, supplier_name = ?, supplier_bill_no = ?,
            voucher_no = ?, total_bill_amount = ?, tax_percent = ?, tax_amount = ?,
            actual_amount = ?, category = ?, remarks = ?
            WHERE sync_id = ?');
        $up->execute([
            $b['posting_date'] ?? date('Y-m-d'),
            $b['bill_date'] ?? date('Y-m-d'),
            $b['supplier_name'] ?? '',
            $b['supplier_bill_no'] ?? '',
            $b['voucher_no'] ?? '',
            $total,
            $tax,
            $taxAmount,
            $actual,
            $b['category'] ?? 'PAYABLE',
            $b['remarks'] ?? '',
            $syncId,
        ]);
    } else {
        $ins = $pdo->prepare('INSERT INTO bills (
            sync_id, posting_date, bill_date, supplier_name, supplier_bill_no,
            voucher_no, total_bill_amount, tax_percent, tax_amount, actual_amount,
            category, remarks, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([
            $syncId,
            $b['posting_date'] ?? date('Y-m-d'),
            $b['bill_date'] ?? date('Y-m-d'),
            $b['supplier_name'] ?? '',
            $b['supplier_bill_no'] ?? '',
            $b['voucher_no'] ?? '',
            $total,
            $tax,
            $taxAmount,
            $actual,
            $b['category'] ?? 'PAYABLE',
            $b['remarks'] ?? '',
            $authUser['username'] ?? 'system',
        ]);
    }

    $out = $pdo->prepare('SELECT * FROM bills WHERE sync_id = ?');
    $out->execute([$syncId]);
    send_json($out->fetch());
}

// DELETE /api/bills/{syncId}
if (preg_match('#^bills/(.+)$#', $path, $m) && $method === 'DELETE') {
    get_auth_user();
    $syncId = urldecode($m[1]);
    $stmt = $pdo->prepare('UPDATE bills SET deleted_at = CURRENT_TIMESTAMP WHERE sync_id = ?');
    $stmt->execute([$syncId]);
    send_json(['success' => true, 'syncId' => $syncId]);
}

// ====================================================================
// PAYMENTS ROUTES
// ====================================================================

// POST /api/payments
if ($path === 'payments' && $method === 'POST') {
    $authUser = get_auth_user();
    $p = get_json_body();
    $syncId = !empty($p['sync_id']) ? $p['sync_id'] : generate_uuid();
    $amount = round((float)($p['amount'] ?? 0), 2);

    $check = $pdo->prepare('SELECT id FROM payments WHERE sync_id = ?');
    $check->execute([$syncId]);
    $existing = $check->fetch();

    if ($existing) {
        $up = $pdo->prepare('UPDATE payments SET
            bill_sync_id = ?, payment_date = ?, amount = ?, payment_mode = ?,
            reference_no = ?, remarks = ? WHERE sync_id = ?');
        $up->execute([
            $p['bill_sync_id'] ?? '',
            $p['payment_date'] ?? date('Y-m-d'),
            $amount,
            $p['payment_mode'] ?? 'COUNTER_CASH',
            $p['reference_no'] ?? '',
            $p['remarks'] ?? '',
            $syncId,
        ]);
    } else {
        $ins = $pdo->prepare('INSERT INTO payments (
            sync_id, bill_sync_id, payment_date, amount,
            payment_mode, reference_no, remarks, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([
            $syncId,
            $p['bill_sync_id'] ?? '',
            $p['payment_date'] ?? date('Y-m-d'),
            $amount,
            $p['payment_mode'] ?? 'COUNTER_CASH',
            $p['reference_no'] ?? '',
            $p['remarks'] ?? '',
            $authUser['username'] ?? 'system',
        ]);
    }

    $out = $pdo->prepare('SELECT * FROM payments WHERE sync_id = ?');
    $out->execute([$syncId]);
    send_json($out->fetch());
}

// DELETE /api/payments/{syncId}
if (preg_match('#^payments/(.+)$#', $path, $m) && $method === 'DELETE') {
    get_auth_user();
    $syncId = urldecode($m[1]);
    $stmt = $pdo->prepare('UPDATE payments SET deleted_at = CURRENT_TIMESTAMP WHERE sync_id = ?');
    $stmt->execute([$syncId]);
    send_json(['success' => true, 'syncId' => $syncId]);
}

// 404 Fallback
send_json(['error' => 'API endpoint not found: ' . $path], 404);
