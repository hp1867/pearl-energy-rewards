# Pearl Energy Rewards

A React + Vite loyalty app and admin dashboard for Pearl Energy, with a Supabase PostgreSQL/Auth backend and a provider-neutral POS interface.

## Current status

The Supabase migration is implemented locally and tested, but has **not yet been applied to the hosted project**. The connected MCP session still reports read-only access. Hosted Auth providers, the publishable key, Vercel environment variables and Edge deployments must be configured before live sign-in/transactions work.

See [setup and handoff status](docs/database/SUPABASE.md), [database architecture](docs/database/ARCHITECTURE.md) and [POS contract](docs/database/POS-CONTRACT.md).

## Run locally

Use Node.js 24 and install the locked dependencies:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the consumer app at `http://localhost:5173/` and admin dashboard at `http://localhost:5173/admin.html`.

Create an ignored `.env.local` using `.env.example`, then fill in the confirmed Supabase project URL and its **publishable** key. Never use a secret/service-role key in the browser. Restart after environment changes.

Supabase is the default mode. For an explicitly isolated preview only, set `VITE_DATA_MODE=local`. Demo data stays in that browser and is not migrated into live accounts. Local-only admin demo passwords are `pearl-admin` and `altona-manager`; they have no effect in Supabase mode. An unavailable live backend never falls back to demo balances.

## Implemented

- Email signup/confirmation, password login/recovery, profile editing and Google/Apple OAuth integration hooks.
- Customer-owned receipts, points, coupons and membership QR/barcode.
- Atomic, append-only points ledger with idempotent redemption, POS transactions and refunds.
- POS-earned missions/spins with server-selected prizes and refund reconciliation.
- Shared live catalogs, manual fuel prices and time-limited offers.
- Tonight Only station deals with stock, manager-selected expiry, safety cutoff and local-midnight limits.
- Main-admin dashboard and station-scoped manager permissions.
- In-app announcements and a separately configurable Web Push delivery worker.
- Receipt JSON save/share; real wallet passes remain a separate issuer integration.

Google/Apple login needs provider setup; button availability does not mean a provider is configured. POS payments, live fuel feeds, wallet issuance, push scheduling, automated draw selection and full historical browsing are not automatically provided by this repository.

## Verify and build

```powershell
npm.cmd test
npm.cmd run test:edge
npm.cmd run build
npm.cmd audit
```

The SQL tests apply migrations to a real in-process PostgreSQL engine with an Auth role shim. They do not replace hosted security, real-browser, multi-connection load or POS-vendor acceptance tests.

Vercel should use `npm run build` and `dist`. Configure the Supabase `VITE_` variables in Vercel and rebuild; committing code alone does not configure cloud credentials or create tables. `vercel.json` supplies security headers.

## Structure

```text
src/
  services/data.js             provider selection; explicit demo isolation
  services/supabaseProvider.js consumer + admin database adapters
  supabase/client.js           public-key-only browser client
  context/AppContext.jsx      auth, profile, catalogs and expiry refresh
  screens/                    consumer UI
  admin/                      admin dashboard
supabase/
  migrations/                 versioned PostgreSQL schema, RLS and RPCs
  functions/pos-api/           signed server-to-server POS boundary
  functions/push-dispatch/     bounded notification worker
tests/                        SQL, POS contract and night-deal tests
docs/database/                architecture, setup and integration contract
```

Firebase code/configuration remains as a historical rollback reference and is not selected by the active provider. Firebase deployment/test scripts are legacy-only; do not run them as part of the Supabase rollout.
