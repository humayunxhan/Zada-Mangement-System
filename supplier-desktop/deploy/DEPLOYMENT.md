# SPMS PHP deployment

Target: https://spms.zadapharmacy.com
Public root: /home/u728298835/domains/zadapharmacy.com/public_html/spms
Private root: /home/u728298835/domains/zadapharmacy.com/spms-private

Only `dist-php` is uploaded. The cash-counter app, Node server, Electron runtime,
source files, dependencies and database credentials are excluded from the public release.
Node is used locally for the Vite build only.

## Current state (2026-10-04)

- PHP release built, remotely linted and deployed; previous docroot backed up.
- HTTPS login shell responds 200 and sends X-Robots-Tag noindex/noarchive/nofollow/nosnippet.
- API include files respond 403. Parent-domain /spms/ responds 404.
- Both existing root websites responded 200 following upload.
- Dedicated SPMS MySQL database connected and schema provisioned.
- Initial admin credentials saved in the private local login file (mode 600).
- Live API checks passed: login, authenticated reads, unauthorized access rejection,
  bill/payment writes, balance calculations, reloads, soft deletion and private include protection.
- Uniquely marked verification records were removed after testing.

## Fresh installation only — never rerun on this live database

Fill `spms.credentials.json` locally with the exact Hostinger database name,
database username and password. Preserve its mode 600 and do not commit it.
Run `python3 scripts/provision-php.py` from supplier-desktop. This explicitly
requires the dedicated account-prefixed SPMS database to be empty and preserves
an existing config. It creates application and ledger tables and a strong initial
admin account. Login details are saved privately to deploy/initial-login.credentials.json.

The initial deployment was verified using `python3 scripts/verify-live.py`.
This performs API checks with uniquely tagged disposable records and cleans them up.
Never print database credentials, JWT keys, or tokens in logs.

## Subsequent releases

Run `npm run build:php`, then `python3 scripts/deploy-integration.py`.
The upgrade script uploads and lints privately, backs up the SPMS docroot,
briefly pauses API traffic, verifies a dedicated MySQL dump, and applies the
additive ledger migration. Existing users/bills/payments are hashed before and
after migration and must remain identical. It publishes the entry page and
reopens API traffic last. Existing credentials and private configuration stay
in place. No Node service or other domain is deployed.

Before API access resumes, an upgrade failure restores the previous files.
After reopening, do not automatically restore an older release: it cannot
interpret new return/refund/adjustment records. Keep the maintenance gate active
while investigating, preserve a fresh database backup, and fix forward. SQL
backups contain private data and remain mode 600 outside public_html.

`scripts/deploy-php.py` is the legacy file-only publisher; do not use it for this
schema upgrade. Verification: `npm run test:mobile`, `npm test`,
`python3 scripts/test-php-remote.py`, then `python3 scripts/verify-pwa-live.py`.
The remote test uses SQLite in memory and connection-scoped MySQL temporary
tables; it copies no production rows and writes no live financial transactions.
Set `SPMS_LOGIN_FILE` to an existing private login file for read-only live checks.

No-index directives request exclusion by compliant crawlers; actual data privacy
is enforced by authenticated API routes. Static login assets remain publicly accessible.

## Mobile / PWA release — 4 October 2026

Deployed release: `20261004T174630Z` (previous SPMS docroot backed up).

- Mobile bottom navigation, dashboard, expandable bill cards and payment forms.
- Manifest, home-screen icons, install control, safe-area metadata and offline page.
- Only the generic offline page is service-worker cached; API/data are network-only.
- Duplicate-submit protection, stable retry record identities, offline submit blocking,
  unsaved-form confirmation, modal focus handling and expired-session cleanup.
- `npm run test:mobile` passed script-only DOM workflow and service-worker tests.
- Production build and `git diff --check` passed; remote PHP lint passed.
- `python3 scripts/verify-pwa-live.py` passed live asset, manifest MIME, login,
  authenticated-read, unauthorized access and existing root-site checks.
- Hostinger optimizes PNGs and strips X-Robots-Tag on those non-sensitive icon
  responses. Icon PNG dimensions verified; page/offline/manifest/SW directives
  verified, and financial API responses retain no-store and authentication.
- No live financial writes were made for this mobile release verification.
- Physical iOS/Android installation and virtual-keyboard behavior were not tested.
  The user requested finishing through code/scripts without browser UI.

## Collaborator integration — 7 October 2026

- Preserved the live uncommitted release in commit `0c32855`, then merged
  collaborator commits through `480b098` on `codex/spms-php-integration`.
- Deployed code commit `294f598`; release/backup ID `20261007T105510Z`.
- Private backups: `spms-private/backups/20261007T105510Z.tar.gz` (files) and
  `spms-private/backups/20261007T105510Z.sql` (dedicated database).
- API maintenance gate was verified as HTTP 503 before migration. The additive
  migration ran twice and confirmed identical existing users/bills/payments.
- Returns, refunds and same-supplier credit adjustments now have PHP persistence,
  transaction locking, retry identities and historical-edit protection.
- PHP external CEO synchronization is explicitly disabled for this private portal;
  the collaborator's Node/Electron synchronization source remains intact.
- Production build, mobile/PWA workflows, 14 server tests, Electron persistence,
  SQLite and isolated MySQL financial tests passed. Live read-only checks passed
  for login, ledger balances, protected includes, assets and both existing sites.
- No browser UI was used; no live financial test records were created. Physical
  phone rendering/install behavior remains unverified.

## Follow-up integration — master through d5dde27

- Restore newest-date grouping, with descending voucher order within each date.
- Treat BILL_TO_BILL invoices as payable in PHP payments, returns and settlements,
  matching the shared JavaScript ledger.
- Support duplicate invoice acknowledgement, filtered CSV/Excel exports, account
  and financial audit entries, private JSON backups and administrator-only restore.
- Migration `002-records` adds the audit table without altering existing records.
  Audit writes and their financial/account mutations share one transaction.
- The PHP portal creates a daily snapshot on authenticated financial API use;
  it does not require a Node server or a scheduled process. Private snapshots are
  retained without automatic deletion. Backups exclude accounts/passwords.
- Restore validates the checksum, accounting and database identity, rejects removal
  or alteration of settlement history, retains audit history, and saves a safety
  snapshot first. Restore tests run only in temporary databases, never live.
- ExcelJS loads on demand for Excel exports; its separate bundle exceeds Vite's
  size advisory. It is not part of the initial app bundle.
- Validation: 17 server tests, 12 desktop/management/export tests, mobile/PWA DOM
  tests, and PHP accounting/management tests on SQLite and temporary MySQL tables.
