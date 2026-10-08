#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:?Commit SHA required}"
run="${2:?GitHub run identifier required}"
key="${3:?SSH key path required}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$run" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'Invalid run identifier' >&2; exit 1; }

host='u728298835@82.25.87.211'
source_known_hosts="$(cd "$(dirname "$0")" && pwd)/known_hosts"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$source_known_hosts" "$work/known_hosts"
known_hosts="$work/known_hosts"
ssh_opts=(-T -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -p 65002)

test -f dist-php/index.html
test -f dist-php/api/index.php
COPYFILE_DISABLE=1 tar -czf "$work/release.tar.gz" -C dist-php .
COPYFILE_DISABLE=1 tar -czf "$work/tools.tar.gz" -C deploy apply-returns.php backup-database.php migrations
printf 'app=spms\nsha=%s\nrun=%s\n' "$sha" "$run" > "$work/metadata.env"
COPYFILE_DISABLE=1 tar -czf "$work/deployment-bundle.tar.gz" -C "$work" metadata.env release.tar.gz tools.tar.gz
ssh "${ssh_opts[@]}" "$host" '/home/u728298835/domains/zadapharmacy.com/spms-private/deploy-system/gateway.sh' < "$work/deployment-bundle.tar.gz"
