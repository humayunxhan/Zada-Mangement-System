# Zada CEO Server

Flexible API and live-update layer between the existing CashBook desktop app and the CEO mobile app.

## Start locally

1. Start MongoDB.
2. Copy `.env.example` to `.env` and update `MONGODB_URI` if needed.
3. Run `npm install` and `npm run dev` inside this folder.
4. Check `http://localhost:4100/api/health`.

Authentication is intentionally disabled for the first version. Do not expose this server directly to the public internet. Keep it on a trusted LAN/VPN until authentication is enabled.

## Deploy on Render

The repository root contains `render.yaml`. In Render, create a **Blueprint**, connect this repository, and apply the detected `zada-cashbook-ceo-server` service. When prompted, enter a MongoDB Atlas connection string for `MONGODB_URI`.

After deployment, open `https://YOUR-SERVICE.onrender.com/` or `/api/health`. Then configure the desktop app with:

```text
CEO_SERVER_URL=https://YOUR-SERVICE.onrender.com
```

Configure the mobile app with the same URL in `EXPO_PUBLIC_API_URL`. Render runs this as a persistent Node web service, so the included Socket.IO live connection is supported.

The API is versioned under `/api/v1`, data is scoped by pharmacy and branch, mutations arrive as versioned events, and Mongo documents retain the original desktop record in `raw`. These boundaries allow later CEO features to be added without rewriting the sync system.

Set these variables before starting the desktop app so it can sync:

```text
CEO_SERVER_URL=http://SERVER_LAN_IP:4100
CEO_PHARMACY_ID=zada-pharmacy
CEO_BRANCH_ID=main
```

Supplier returns and settlements sync through `POST /api/v1/suppliers/snapshot`. Deploy this version before upgrading the supplier app. Snapshot updates and financial API mutations use MongoDB transactions and require Atlas or a replica set. Versions are checked per source, accounting history is preserved, and a committed snapshot emits `v1.supplier-ledger.updated` for the CEO app.

Supplier bill reports include reduced net payable, pending credit, return/refund/adjustment history, and activity totals filtered by the activity date. `/daily` also groups returns and settlements on those dates even when the original bill falls outside the period. The supplier summary screen displays pending credit across all active bills separately from period activity. Run `npm test` for the accounting and snapshot validation checks.
