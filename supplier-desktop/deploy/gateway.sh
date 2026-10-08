#!/usr/bin/env bash
set -Eeuo pipefail

base='/home/u728298835/domains/zadapharmacy.com'
private="$base/spms-private"
system="$private/deploy-system"
incoming="$private/incoming"
lock="$system/deploy.lock"
umask 077
payload="$(mktemp "$incoming/gateway.XXXXXX")"
stage="$(mktemp -d "$incoming/gateway.XXXXXX")"
locked=0

cleanup() {
  status=$?
  trap - EXIT
  rm -f "$payload"
  rm -rf "$stage"
  if (( locked == 1 )); then rmdir "$lock" 2>/dev/null || true; fi
  exit "$status"
}
trap cleanup EXIT

expected_command='/home/u728298835/domains/zadapharmacy.com/spms-private/deploy-system/gateway.sh'
[[ -z "${SSH_ORIGINAL_COMMAND:-}" || "$SSH_ORIGINAL_COMMAND" == "$expected_command" ]] || { echo 'SPMS deploy key does not accept other remote commands.' >&2; exit 1; }
if ! mkdir "$lock" 2>/dev/null; then
  echo 'An SPMS deployment is already running.' >&2
  exit 1
fi
locked=1
ulimit -f 524288
cat > "$payload"
size="$(stat -c %s "$payload")"
(( size > 0 && size <= 268435456 )) || { echo 'Invalid SPMS deployment bundle size.' >&2; exit 1; }

tar -tzf "$payload" | LC_ALL=C sort > "$stage/entries"
mapfile -t entries < "$stage/entries"
expected=(metadata.env release.tar.gz tools.tar.gz)
[[ "${entries[*]}" == "${expected[*]}" ]] || { echo 'Unexpected SPMS deployment bundle contents.' >&2; exit 1; }
rm "$stage/entries"
tar -xzf "$payload" -C "$stage"

grep -qx 'app=spms' "$stage/metadata.env"
sha="$(sed -n 's/^sha=//p' "$stage/metadata.env")"
run="$(sed -n 's/^run=//p' "$stage/metadata.env")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid SPMS commit SHA.' >&2; exit 1; }
[[ "$run" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'Invalid SPMS run identifier.' >&2; exit 1; }

destination="$incoming/$sha-$run"
test ! -e "$destination"
install -d -m 700 "$destination"
mv "$stage/release.tar.gz" "$stage/tools.tar.gz" "$destination/"
"$system/remote-hostinger.sh" "$sha" "$run"
