<?php
// ====================================================================
// Zada Pharmacy SPMS - Unified REST API Router (PHP + Hostinger MySQL)
// ====================================================================

ini_set('display_errors', '0');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
header('Cache-Control: private, no-store, max-age=0');
set_exception_handler(function ($error) {
    error_log('SPMS request failed: ' . get_class($error));
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Service temporarily unavailable. Please contact the administrator.']);
});
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/finance.php';

// Set JSON response headers and CORS
header('Content-Type: application/json; charset=utf-8');
// Same-origin deployment; no cross-origin API access is advertised.
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
    global $cfg, $pdo;
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
    $stmt = $pdo->prepare('SELECT id, username, full_name, role, status, password_hash FROM users WHERE id = ?');
    $stmt->execute([$user['id'] ?? 0]);
    $current = $stmt->fetch();
    if (!$current || $current['status'] !== 'active' || !hash_equals(hash('sha256', $current['password_hash']), $user['credential_version'] ?? '')) {
        send_json(['error' => 'Session expired. Please log in again.'], 401);
    }
    unset($current['password_hash']);
    return $current;
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

// Bound password attempts per remote address; state stays outside the public root.
function limit_login_attempts() {
    global $cfg;
    $dir = $cfg['private_dir'] . '/login-attempts';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Login limiter unavailable');
    }
    $key = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $cfg['jwt_secret']);
    $file = fopen($dir . '/' . $key, 'c+');
    if (!$file || !flock($file, LOCK_EX)) throw new RuntimeException('Login limiter unavailable');
    $entry = json_decode(stream_get_contents($file), true);
    $now = time();
    if (!is_array($entry) || ($entry['until'] ?? 0) <= $now) {
        $entry = ['until' => $now + 900, 'count' => 0];
    }
    if ($entry['count'] >= 10) {
        flock($file, LOCK_UN);
        fclose($file);
        header('Retry-After: ' . max(1, $entry['until'] - $now));
        send_json(['error' => 'Too many login attempts. Please try again later.'], 429);
    }
    $entry['count']++;
    rewind($file);
    ftruncate($file, 0);
    fwrite($file, json_encode($entry));
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);
}

// POST /api/auth/login
if ($path === 'auth/login' && $method === 'POST') {
    limit_login_attempts();
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
    $claims = $payload;
    $claims['credential_version'] = hash('sha256', $user['password_hash']);

    $token = jwt_encode($claims, $cfg['jwt_secret'], 28800);

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
    if (strlen($next) < 12) {
        send_json(['error' => 'New password must be at least 12 characters'], 400);
    }

    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$authUser['id']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($curr, $user['password_hash'])) {
        send_json(['error' => 'Current password is incorrect'], 400);
    }

    $newHash = password_hash($next, PASSWORD_BCRYPT);
    $up = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    finance_mutate($pdo,function()use($pdo,$up,$newHash,$authUser){
        $up->execute([$newHash,$authUser['id']]);
        records_audit($pdo,$authUser['username'],'PASSWORD_CHANGE','account',(string)$authUser['id']);
    });

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
    if (strlen($password) < 12) {
        send_json(['error' => 'Password must be at least 12 characters'], 400);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $check->execute([$username]);
    if ($check->fetch()) {
        send_json(['error' => 'Username already exists'], 400);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $ins = $pdo->prepare('INSERT INTO users (username, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, "active")');
    $newId=finance_mutate($pdo,function()use($pdo,$ins,$username,$hash,$full_name,$role,$authUser){
        $ins->execute([$username,$hash,$full_name,$role]);$id=(int)$pdo->lastInsertId();
        records_audit($pdo,$authUser['username'],'CREATE','account',(string)$id,null,['username'=>$username,'full_name'=>$full_name,'role'=>$role,'status'=>'active']);
        return $id;
    });

    send_json([
        'success' => true,
        'user' => [
            'id' => $newId,
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
    finance_mutate($pdo,function()use($pdo,$up,$status,$targetId,$authUser){
        $stmt=$pdo->prepare('SELECT id,username,full_name,role,status FROM users WHERE id=?');$stmt->execute([$targetId]);$before=$stmt->fetch(PDO::FETCH_ASSOC);
        $up->execute([$status,$targetId]);
        if($before)records_audit($pdo,$authUser['username'],'STATUS_CHANGE','account',(string)$targetId,$before,array_merge($before,['status'=>$status]));
    });

    send_json(['success' => true, 'status' => $status]);
}

// All finance routes share authentication and transactional accounting rules.
require_once __DIR__ . '/finance.php';
$actor = get_auth_user();
try {
    try { records_automatic_backup($pdo,$cfg); } catch(Throwable $e) { error_log('SPMS automatic backup failed: '.get_class($e)); }
    $body = in_array($method, ['POST', 'PUT', 'PATCH'], true) ? get_json_body() : [];
    if (!is_array($body)) throw new LedgerError('Invalid request body.');
    // Preserve older clients that let the server assign identifiers.
    if ($method === 'POST' && in_array($path, ['bills', 'payments'], true) && empty($body['sync_id'])) $body['sync_id'] = generate_uuid();
    if ($method === 'POST' && $path === 'returns' && empty($body['syncId'])) $body['syncId'] = generate_uuid();
    if (str_starts_with($path,'records/')) { [$result,$code]=records_route($pdo,$cfg,$actor,$path,$method,$body,$_GET); send_json($result,$code); }
    [$result, $code] = finance_route($pdo, $path, $method, $_GET, $body, $actor['username']);
    send_json($result, $code);
} catch (LedgerError $e) { send_json(['error' => $e->getMessage()], 400); }
