"""Exercise the real authenticated PHP API; remove only uniquely tagged test records."""
import json, uuid, urllib.request, urllib.error, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://spms.zadapharmacy.com'
login = json.loads((ROOT / 'deploy/initial-login.credentials.json').read_text())
TOKEN = None
MARKER = 'SPMS deployment verification ' + str(uuid.uuid4())
bill_id, payment_id = str(uuid.uuid4()), str(uuid.uuid4())

def request(path, method='GET', data=None, authenticated=False):
    headers = {'Content-Type': 'application/json'}
    if authenticated: headers['Authorization'] = 'Bearer ' + TOKEN
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try: response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as e: response = e
    raw = response.read()
    try: body = json.loads(raw)
    except ValueError: body = None
    return response.status, body, response.headers

def expect(condition, label):
    if not condition: raise RuntimeError('Failed: ' + label)
    print('PASS:', label)

status, _, headers = request('/')
expect(status == 200 and 'noindex' in headers.get('X-Robots-Tag', ''), 'HTTPS page and noindex directive')
for path in ['/api/bills', '/api/bills/suppliers', '/api/auth/me', '/api/auth/users']:
    status, _, _ = request(path)
    expect(status == 401, 'Unauthenticated access denied: ' + path)
status, auth, _ = request('/api/auth/login', 'POST', {'username': login['username'], 'password': login['password']})
expect(status == 200 and bool(auth.get('token')), 'Admin login')
TOKEN = auth['token']
for path, key in [('/api/auth/me', 'user'), ('/api/auth/users', 'users')]:
    status, body, _ = request(path, authenticated=True)
    expect(status == 200 and key in body, 'Authorized access: ' + path)
status, body, _ = request('/api/bills', authenticated=True)
expect(status == 200 and isinstance(body, list), 'Supplier bills load')

try:
    status, body, _ = request('/api/bills', 'POST', {
        'sync_id': bill_id, 'posting_date': '2026-10-04', 'bill_date': '2026-10-04',
        'supplier_name': MARKER, 'total_bill_amount': 100, 'tax_percent': 10,
        'category': 'PAYABLE', 'remarks': MARKER,
    }, True)
    expect(status == 200 and body.get('sync_id') == bill_id and float(body['actual_amount']) == 90, 'Bill save and calculation')
    status, body, _ = request('/api/payments', 'POST', {
        'sync_id': payment_id, 'bill_sync_id': bill_id, 'payment_date': '2026-10-04',
        'amount': 25, 'payment_mode': 'COUNTER_CASH', 'remarks': MARKER,
    }, True)
    expect(status == 200 and body.get('sync_id') == payment_id, 'Payment save')
    status, body, _ = request('/api/bills', authenticated=True)
    row = next((r for r in body if r['sync_id'] == bill_id), {})
    expect(status == 200 and row.get('paid_amount') == 25 and row.get('remaining_balance') == 65 and row.get('payment_status') == 'PARTIAL', 'Saved bill and payment reload with correct balance')
    for path in ['/api/payments/' + payment_id, '/api/bills/' + bill_id]:
        status, body, _ = request(path, 'DELETE', authenticated=True)
        expect(status == 200 and body.get('success'), 'Soft-delete test record')
    status, body, _ = request('/api/bills', authenticated=True)
    expect(status == 200 and all(r['sync_id'] != bill_id for r in body), 'Deleted test bill excluded')
finally:
    # UUIDs are generated here; marker checks prevent touching any unrelated row.
    cleanup = '''<?php
require '/home/u728298835/domains/zadapharmacy.com/public_html/spms/api/db.php';
$pdo = get_db(); $pdo->beginTransaction();
$records = %s;
foreach ($records as $r) {
    $stmt = $pdo->prepare('DELETE FROM ' . $r[0] . ' WHERE sync_id = ? AND remarks = ?');
    $stmt->execute([$r[1], $r[2]]);
}
$pdo->commit(); echo "PASS: Verification records cleaned up\\n";
''' % ("[['payments','" + payment_id + "','" + MARKER + "'],['bills','" + bill_id + "','" + MARKER + "']]")
    ssh = ['ssh', '-i', '/Users/bakhtzada/.ssh/drbakhtzada_deploy', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-p', '65002', 'u728298835@82.25.87.211', 'php']
    subprocess.run(ssh, input=cleanup.encode(), check=True)
for path in ['/api/config.php', '/api/db.php', '/api/jwt.php']:
    status, _, _ = request(path)
    expect(status == 403, 'Private include blocked: ' + path)
print('All live API checks completed; credentials and tokens were not logged.')
