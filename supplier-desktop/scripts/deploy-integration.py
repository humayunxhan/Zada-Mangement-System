"""Upgrade the existing private PHP portal with a write pause and verified backups.

No provisioning, credential reset, Node deployment, or financial test writes.
Before API access resumes, failure restores files; additive schema stays harmless.
After reopening, never automatically downgrade a ledger-capable release.
"""
from pathlib import Path
import datetime, io, os, subprocess, tarfile

ROOT = Path(__file__).resolve().parents[1]
SSH = ['ssh', '-i', '/Users/bakhtzada/.ssh/drbakhtzada_deploy', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-p', '65002', 'u728298835@82.25.87.211']
BASE = '/home/u728298835/domains/zadapharmacy.com'
PRIVATE = BASE + '/spms-private'
PUBLIC = BASE + '/public_html/spms'
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
STAGE = PRIVATE + '/releases/' + STAMP

def remote(script):
    subprocess.run(SSH + ['bash -se'], input=script.encode(), check=True)

assert (ROOT/'dist-php/api/finance.php').is_file(), 'Build the PHP release first'
remote(f"umask 077\nmkdir -p '{STAGE}' '{PRIVATE}/backups' '{PRIVATE}/integration-deploy/migrations'\ntest -f '{PUBLIC}/.htaccess'\ntest -f '{PRIVATE}/config.php'\n")
with io.BytesIO() as stream:
    with tarfile.open(fileobj=stream, mode='w:gz') as tar:
        tar.add(ROOT/'dist-php', arcname='release')
        for name in ['apply-returns.php', 'backup-database.php', 'migrations/001-returns.php', 'migrations/002-records.php']:
            tar.add(ROOT/'deploy'/name, arcname='tools/'+name)
    subprocess.run(SSH+[f"tar -xzf - -C '{STAGE}'"], input=stream.getvalue(), check=True)
remote(f"""umask 077
cp -a '{STAGE}/tools/.' '{PRIVATE}/integration-deploy/'
for source in '{STAGE}'/release/api/*.php '{PRIVATE}'/integration-deploy/*.php '{PRIVATE}'/integration-deploy/migrations/*.php; do php -l "$source"; done
tar -czf '{PRIVATE}/backups/{STAMP}.tar.gz' -C '{PUBLIC}' .
tar -tzf '{PRIVATE}/backups/{STAMP}.tar.gz' >/dev/null
cp '{PUBLIC}/.htaccess' '{PRIVATE}/backups/{STAMP}.htaccess'
# Install the gate atomically. Existing in-flight requests get time to finish.
{{ printf 'RewriteEngine On\\nRewriteRule ^api(?:/.*)?$ - [R=503,L]\\n'; cat '{PUBLIC}/.htaccess'; }} > '{PUBLIC}/.htaccess.pending'
chmod 644 '{PUBLIC}/.htaccess.pending'
mv '{PUBLIC}/.htaccess.pending' '{PUBLIC}/.htaccess'
rollback() {{
  code=$?
  if test "$code" -ne 0; then
    echo 'Upgrade failed while paused; restoring prior SPMS files.' >&2
    # Extract privately first so the gate is restored last.
    mkdir -p '{STAGE}/rollback'
    tar -xzf '{PRIVATE}/backups/{STAMP}.tar.gz' -C '{STAGE}/rollback'
    find '{STAGE}/rollback' -mindepth 1 -maxdepth 1 ! -name .htaccess -exec cp -a {{}} '{PUBLIC}/' \\;
    cp '{PRIVATE}/backups/{STAMP}.htaccess' '{PUBLIC}/.htaccess.restore'
    chmod 644 '{PUBLIC}/.htaccess.restore'
    mv '{PUBLIC}/.htaccess.restore' '{PUBLIC}/.htaccess'
  fi
}}
trap rollback EXIT
sleep 5
status=$(curl -sS -o /dev/null -w '%{{http_code}}' https://spms.zadapharmacy.com/api/bills)
test "$status" = 503
php '{PRIVATE}/integration-deploy/backup-database.php' '{STAMP}'
php '{PRIVATE}/integration-deploy/apply-returns.php'
find '{STAGE}/release' -mindepth 1 -maxdepth 1 ! -name .htaccess ! -name index.html -exec cp -a {{}} '{PUBLIC}/' \\;
cp '{STAGE}/release/index.html' '{PUBLIC}/index.html.pending'
find '{PUBLIC}' -type d -exec chmod 755 {{}} +
find '{PUBLIC}' -type f -exec chmod 644 {{}} +
mv '{PUBLIC}/index.html.pending' '{PUBLIC}/index.html'
# Resume requests only once all PHP, JS and entry files are present.
cp '{STAGE}/release/.htaccess' '{PUBLIC}/.htaccess.pending'
chmod 644 '{PUBLIC}/.htaccess.pending'
mv '{PUBLIC}/.htaccess.pending' '{PUBLIC}/.htaccess'
trap - EXIT
echo 'PASS: PHP upgrade published; API resumed. Private backup: {STAMP}'
""")
print('Release and rollback backup identifier:', STAMP)
