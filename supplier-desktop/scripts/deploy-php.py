"""Upload the audited PHP-only release to the existing SPMS subdomain."""
from pathlib import Path
import datetime, os, subprocess

ROOT = Path(__file__).resolve().parents[1]
SSH = ['ssh', '-i', '/Users/bakhtzada/.ssh/drbakhtzada_deploy', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-p', '65002', 'u728298835@82.25.87.211']
BASE = '/home/u728298835/domains/zadapharmacy.com'
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
STAGE = f'{BASE}/spms-private/releases/{STAMP}'
PUBLIC = f'{BASE}/public_html/spms'

def remote(script):
    subprocess.run(SSH + ['bash -se'], input=script.encode(), check=True)

assert (ROOT / 'dist-php/index.html').is_file()
remote(f'''umask 077
mkdir -p '{STAGE}' '{BASE}/spms-private/backups'
test -d '{PUBLIC}'
''')
archive = subprocess.Popen(['tar', '-czf', '-', '-C', str(ROOT / 'dist-php'), '.'], stdout=subprocess.PIPE, env={**os.environ, 'COPYFILE_DISABLE': '1'})
subprocess.run(SSH + [f"tar -xzf - -C '{STAGE}'"], stdin=archive.stdout, check=True)
archive.stdout.close()
assert archive.wait() == 0
remote(f'''for source in '{STAGE}'/api/*.php; do php -l "$source"; done
tar -czf '{BASE}/spms-private/backups/{STAMP}.tar.gz' -C '{PUBLIC}' .
cp -a '{STAGE}/.' '{PUBLIC}/'
find '{PUBLIC}' -type d -exec chmod 755 {{}} +
find '{PUBLIC}' -type f -exec chmod 644 {{}} +
if test -f '{PUBLIC}/default.php'; then mv '{PUBLIC}/default.php' '{BASE}/spms-private/backups/default-{STAMP}.php'; fi
''')
print('PHP release deployed with prior docroot backup:', STAMP)
