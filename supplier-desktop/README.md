# Zada Supplier Reconciliation

Separate Electron app for supplier bills and linked payments. It stores data locally in SQLite and syncs changes to `https://cashbook-e9h7.onrender.com` with an offline retry outbox.

## Run

```bash
npm install
npm run app
```

Use **Pay** on a bill to record partial or complete payments. Totals, tax deduction, actual payable, paid amount, remaining balance and payment status are calculated automatically. Bill-to-bill bills remain payable until an actual payment is recorded: when the next supplier bill arrives, use **Pay** on the previous bill and enter its payment date, amount and method. Adding the next bill does not automatically create a payment. Existing bill-to-bill bills also show their unpaid balances. Sale-based and disputed entries remain outside the payable balance.

The server must be redeployed with the new `/api/v1/suppliers/*` routes before live sync and CEO reports will return data.

## Stock returns and supplier credit

Use **Return** in All Bills, or open **Returns & Credits** and select **All bills**. Enter the actual return date, agreed net return amount after tax deduction, reason and optional slip/reference. The full remaining net amount makes a full return; a smaller amount makes a partial return. Original bill dates, amounts and payment history remain available.

An unpaid full return clears the payable. A paid return creates credit only for the amount paid above the revised net payable. Credit stays pending until **Receive Refund** records an actual cash/bank receipt or **Adjust Credit** applies it to another payable bill from the same supplier. Both actions accept partial amounts. Add the next bill before applying credit; older source bills are available regardless of the All Bills date filter. Refunds and adjustments are separate from cash payments.

**Dated activity** filters returns and settlements by their own dates. Summary and All Bills totals describe the selected original bills and their current balances. Return/settlement dates cannot precede the latest existing activity on either involved bill. Bills and payments involved in a return/settlement are protected from edits and deletion; new payments on a partially returned bill are limited to its remaining payable. This app tracks bill-level stock return values, not item quantities or inventory movements.

## Storage and CEO sync

Electron consistently uses its local SQLite database; the web app uses MySQL. Financial validation errors are never retried against another database. New return and outbox tables are created automatically without changing old bills or payments.

Business changes and a versioned full snapshot are committed together. Unsent snapshots are replaced by the latest complete state, retried every 15 seconds, and acknowledged only after the CEO server commits the snapshot. The UI shows pending sync. Existing installations bootstrap their current records on startup, including changes left in the former Electron JSON outbox.

Deploy the updated CEO server **before** running the upgraded supplier app. Configure `CEO_SERVER_URL`, `CEO_PHARMACY_ID` and `CEO_BRANCH_ID` on the Electron process or MySQL server. The server now needs MongoDB transactions (Atlas or a replica set). Each local/MySQL database has its own persistent sync source identity; conflicting copies of the same database cannot overwrite one another silently. Do not use an Electron local database as a fallback for a different web/MySQL database.

## Verification

Install dependencies in both `server` and `supplier-desktop`. Run `npm test` in each folder and `npm run build` in `supplier-desktop`. Tests cover full/partial paid and unpaid returns, credit limits, same-supplier adjustments, refunds, retry idempotency, preserved history, cross-period reporting, snapshot validation and SQLite restart persistence. No test writes to the live databases.


## Backups, audit history and exports

Administrators can open **Backups & audit** to create/download backups, restore a server/local backup or choose a downloaded JSON backup, and inspect change history. The Electron app and Node/MySQL server check for a daily backup on startup and hourly while running; the latest 30 files are retained. Electron stores backups under its data folder in `backups`; the Node server uses `supplier-desktop/server/backups` or `BACKUP_DIR`. Configure a persistent writable backup directory on hosted servers. Download copies to a separate drive/device for protection against disk loss.

Backups contain bills, payments, immutable return/credit events, audit entries and the database sync identity. They exclude user accounts, passwords, credentials and session tokens. Restore requires typing **RESTORE**, validates the checksum and financial relationships, and creates a safety copy before changing data. Existing audit entries are retained and protected settlement history cannot be removed. Missing newer financial records are preserved as deletion markers for CEO sync. Sync versions advance after restoration. A backup from another database can be restored into an empty database; stop the original installation before recovering its sync identity on another computer. The updated CEO server must be deployed to enforce restored-snapshot protection and removals.

If Electron cannot read its SQLite database, it preserves the unreadable file, blocks new financial entries and automatic backups, and lets an administrator recover from **Backups & audit**. Explicit restore retains the damaged database as a separate safety file before saving the recovered records. Hosted MySQL itself must be accessible before application-level restore can run; these financial backups do not replace infrastructure/database-server recovery.

Changes to bills, payments, returns, refunds, adjustments and web accounts record actor, UTC time, action, record ID and relevant before/after values. Financial changes and their audit entries commit together. Reads, polling and refreshes are not logged. Audit dates are filtered by Pakistan calendar dates and displayed in Pakistan time; exported audit timestamps are explicitly labelled UTC. Audit exports respect the chosen filters and limit (up to 1,000 entries per export).

**All bills** exports the complete filtered set, across pagination, as bills or linked payments. **Returns & credits** also exports filtered bills/payments and separately the dated return activity. Choose **Export Excel** for a genuine `.xlsx` workbook or **Export CSV** for UTF-8 CSV. Leading-zero references, numeric amounts, quoting, Urdu text and spreadsheet formula safety are preserved. Excel generation loads only when requested.

Duplicate checks compare normalized supplier name and invoice number, ignore deleted records and exclude the bill being edited. The warning shows existing matching entries; **Save anyway** explicitly acknowledges those IDs. The storage layer repeats the check inside the financial transaction to prevent races. Confirmed duplicates are identifiable in their audit details.

Electron audit attribution and administrative management use signed session tokens. Set the Electron process's `JWT_SECRET` to match a customized authentication server; development can load it from `supplier-desktop/.env`. The existing Node/PHP development signing keys remain compatible when no custom key is configured. Do not place signing secrets in frontend environment variables.

Run `npm test` in `supplier-desktop` for persistence, restore/recovery, duplicate, CSV/XLSX and mocked MySQL/permission tests. Shared accounting and CEO snapshot tests remain in `server`. Tests use disposable databases or mocks, never live financial records.
