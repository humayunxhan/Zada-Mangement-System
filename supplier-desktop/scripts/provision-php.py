"""Provision only the empty dedicated SPMS MySQL database; never print credentials."""
from pathlib import Path
import json, os, subprocess
ROOT = Path(__file__).resolve().parents[1]
SSH = ['ssh', '-i', '/Users/bakhtzada/.ssh/drbakhtzada_deploy', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-p', '65002', 'u728298835@82.25.87.211']
PRIVATE = '/home/u728298835/domains/zadapharmacy.com/spms-private'
cred = ROOT / 'deploy/spms.credentials.json'
os.chmod(cred, 0o600)
data = json.loads(cred.read_text())
if any(not isinstance(data.get(k), str) or not data[k] for k in ['db_host', 'db_name', 'db_user', 'db_pass']):
    raise SystemExit('Waiting for complete database credentials in the private local file.')
subprocess.run(SSH + [f"umask 077; cat > '{PRIVATE}/provision.php'"], input=(ROOT / 'deploy/provision.php').read_bytes(), check=True)
subprocess.run(SSH + [f"umask 077; mkdir -p '{PRIVATE}/migrations'; cat > '{PRIVATE}/migrations/001-returns.php'"], input=(ROOT / 'deploy/migrations/001-returns.php').read_bytes(), check=True)
subprocess.run(SSH + [f"umask 077; cat > '{PRIVATE}/migrations/002-records.php'"], input=(ROOT / 'deploy/migrations/002-records.php').read_bytes(), check=True)
subprocess.run(SSH + [f"php -l '{PRIVATE}/provision.php'"], check=True)
subprocess.run(SSH + [f"php '{PRIVATE}/provision.php'"], input=json.dumps(data).encode(), check=True)
result = subprocess.run(SSH + [f"cat '{PRIVATE}/initial-login.credentials.json'"], check=True, stdout=subprocess.PIPE)
fd = os.open(ROOT / 'deploy/initial-login.credentials.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'wb') as f: f.write(result.stdout)
print('Portal login saved in deploy/initial-login.credentials.json (private local file).')
