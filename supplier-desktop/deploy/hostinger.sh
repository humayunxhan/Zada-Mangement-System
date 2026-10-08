#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:?Commit SHA required}"
run="${2:?GitHub run identifier required}"
key="${3:?SSH key path required}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$run" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'Invalid run identifier' >&2; exit 1; }

host='u728298835@82.25.87.211'
private='/home/u728298835/domains/zadapharmacy.com/spms-private'
upload="$private/incoming/$sha-$run"
source_known_hosts="$(cd "$(dirname "$0")" && pwd)/known_hosts"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$source_known_hosts" "$work/known_hosts"
known_hosts="$work/known_hosts"
ssh_opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -p 65002)
scp_opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -P 65002)

test -f dist-php/index.html
test -f dist-php/api/index.php
COPYFILE_DISABLE=1 tar -czf "$work/release.tar.gz" -C dist-php .
COPYFILE_DISABLE=1 tar -czf "$work/tools.tar.gz" -C deploy apply-returns.php backup-database.php migrations

ssh "${ssh_opts[@]}" "$host" "install -d -m 700 '$upload'"
scp "${scp_opts[@]}" "$work/release.tar.gz" "$work/tools.tar.gz" "$host:$upload/"
ssh "${ssh_opts[@]}" "$host" bash -s -- "$sha" "$run" < "$(dirname "$0")/remote-hostinger.sh"
