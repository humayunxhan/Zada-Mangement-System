#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:?Commit SHA required}"
run="${2:?GitHub run identifier required}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$run" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'Invalid run identifier' >&2; exit 1; }

umask 077
base='/home/u728298835/domains/zadapharmacy.com'
private="$base/spms-private"
public="$base/public_html/spms"
incoming="$private/incoming/$sha-$run"
release="$private/releases/$sha-$run"
tools="$private/integration-deploy"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$private/backups/$stamp.tar.gz"

test -f "$private/config.php"
test -f "$public/.htaccess"
test -f "$incoming/release.tar.gz"
test -f "$incoming/tools.tar.gz"
test ! -e "$release"
mkdir -p "$release/app" "$release/tools" "$private/backups" "$tools/migrations"
tar -xzf "$incoming/release.tar.gz" -C "$release/app"
tar -xzf "$incoming/tools.tar.gz" -C "$release/tools"
cp -a "$release/tools/." "$tools/"

for source in "$release"/app/api/*.php "$tools"/*.php "$tools"/migrations/*.php; do
  php -l "$source" >/dev/null
done
tar -czf "$backup" -C "$public" .
tar -tzf "$backup" >/dev/null
cp "$public/.htaccess" "$private/backups/$stamp.htaccess"

{
  printf 'RewriteEngine On\nRewriteRule ^api(?:/.*)?$ - [R=503,L]\n'
  cat "$public/.htaccess"
} > "$public/.htaccess.pending"
chmod 644 "$public/.htaccess.pending"
mv "$public/.htaccess.pending" "$public/.htaccess"

paused=1
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 && paused == 1 )); then
    echo 'SPMS deploy failed while paused; restoring previous public files.' >&2
    rollback="$release/rollback"
    mkdir -p "$rollback"
    tar -xzf "$backup" -C "$rollback"
    find "$rollback" -mindepth 1 -maxdepth 1 ! -name .htaccess -exec cp -a {} "$public/" \;
    cp "$private/backups/$stamp.htaccess" "$public/.htaccess.restore"
    chmod 644 "$public/.htaccess.restore"
    mv "$public/.htaccess.restore" "$public/.htaccess"
  fi
  exit "$status"
}
trap cleanup EXIT

sleep 3
status="$(curl -sS -o /dev/null -w '%{http_code}' https://spms.zadapharmacy.com/api/bills)"
test "$status" = 503
php "$tools/backup-database.php" "$stamp"
php "$tools/apply-returns.php"

find "$release/app" -mindepth 1 -maxdepth 1 ! -name .htaccess ! -name index.html -exec cp -a {} "$public/" \;
cp "$release/app/index.html" "$public/index.html.pending"
find "$public" -type d -exec chmod 755 {} +
find "$public" -type f -exec chmod 644 {} +
mv "$public/index.html.pending" "$public/index.html"
cp "$release/app/.htaccess" "$public/.htaccess.pending"
chmod 644 "$public/.htaccess.pending"
mv "$public/.htaccess.pending" "$public/.htaccess"
paused=0

health_page="$release/health-home.html"
curl -fsS --max-time 20 -o "$health_page" "https://spms.zadapharmacy.com/?deploy=$sha"
grep -q 'Zada SPMS' "$health_page"
rm -f "$health_page"
unauthorized="$(curl -sS -o /dev/null -w '%{http_code}' https://spms.zadapharmacy.com/api/bills)"
test "$unauthorized" = 401
trap - EXIT
printf 'SPMS release %s deployed; backup %s created and verified.\n' "$sha" "$stamp"
