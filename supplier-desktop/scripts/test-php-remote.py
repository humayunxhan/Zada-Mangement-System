"""Run PHP/SQLite regression tests in a private scratch directory, never on live data."""
import io, subprocess, tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SSH=['ssh','-i','/Users/bakhtzada/.ssh/drbakhtzada_deploy','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-p','65002','u728298835@82.25.87.211']
STAGE='/home/u728298835/domains/zadapharmacy.com/spms-private/integration-tests-20261007'
fixtures=subprocess.check_output(['node',str(ROOT/'tests/ledger-fixtures.cjs')])
archive=io.BytesIO()
with tarfile.open(fileobj=archive,mode='w:gz') as tar:
 for name in ['public/api/records.php','public/api/finance.php','public/api/ledger.php','deploy/migrations/001-returns.php','deploy/migrations/002-records.php','tests/finance-php.php']:
  tar.add(ROOT/name,arcname=name)
 info=tarfile.TarInfo('tests/golden.json');info.size=len(fixtures);tar.addfile(info,io.BytesIO(fixtures))
subprocess.run(SSH+[f"umask 077; mkdir -p '{STAGE}'; tar -xzf - -C '{STAGE}'"],input=archive.getvalue(),check=True)
subprocess.run(SSH+[f"cd '{STAGE}' && php -d display_errors=1 -l public/api/finance.php && php -d display_errors=1 -l public/api/ledger.php && php -d display_errors=1 tests/finance-php.php tests/golden.json && php -d display_errors=1 tests/finance-php.php tests/golden.json --mysql-private"],check=True)
