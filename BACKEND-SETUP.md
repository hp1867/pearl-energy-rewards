# Pearl Energy Firebase backend

The repository is configured for Firebase project `pearl-energy-app` and uses a
production-oriented Firestore schema. Read [the architecture](docs/database/ARCHITECTURE.md)
and [the POS contract](docs/database/POS-CONTRACT.md) before changing data paths.

## Core design

- Firebase Authentication identifies app users.
- `customers/{authUid}` is a fast customer-facing projection.
- `loyaltyAccounts` stores authoritative current balances.
- `loyaltyLedger` is immutable and can rebuild every balance.
- POS purchases are accepted only through the authenticated `posApi` function.
- Callable functions create customers, redeem rewards and audit point adjustments.
- Security Rules deny every financial write from browser/mobile SDKs.
- Transactions and coupon history are documents, not arrays inside customers.

## Local validation

```powershell
npm install
npm --prefix functions install
npm test
npm run test:rules
npm run build
```

The current Firebase Emulator Suite requires Java 21 or newer.

## Configuration

The registered web app's public Firebase SDK configuration is stored in the local
ignored `.env`. `.env.example` documents all variables. Do not put POS secrets,
service-account JSON or wallet signing keys in a Vite environment variable.

Server secrets must use Google Secret Manager:

```powershell
npx firebase-tools functions:secrets:set POS_WEBHOOK_SECRET
```

Generate at least 32 random bytes. Configure the same secret in the POS adapter.
Rotate it using an overlap plan before production.

## Provision and deploy

Firestore location is irreversible. Confirm the location before the first init.
For Australian users and Sydney-hosted services, `australia-southeast1` is the
usual low-latency choice; confirm legal, resilience and POS-hosting requirements.

After the location decision:

```powershell
npm run firebase:deploy:firestore
npm run firebase:seed
```

Cloud Functions require the Firebase project to use the Blaze plan. Configure a
budget alert before upgrading, then deploy only after the POS secret is present:

```powershell
npm run firebase:deploy:functions
```

## Roles

Roles are Firebase custom claims set only by privileged Admin SDK tooling:

- `staff: true` permits customer and ledger reads.
- `admin: true` includes staff access and permits catalog management.

Financial writes remain denied to both roles from client SDKs. Staff/admin point
adjustments must call `adminAdjustPoints`, which appends a ledger and audit entry.

The current admin page still has a demonstration-only browser password. It must be
replaced with Firebase Auth and verified role claims before public deployment.

## Seeding credentials

`scripts/seed.mjs` supports the Firestore emulator, Application Default
Credentials, or the ignored legacy path `scripts/serviceAccount.json`. Prefer a
short-lived, least-privilege deployment identity in CI rather than downloading a
long-lived service-account key.

## Required launch gates

- Enable App Check enforcement.
- Replace permissive wallet API CORS and authenticate every wallet request.
- Configure backup/export jobs and complete a restore drill.
- Load-test duplicate and concurrent POS deliveries.
- Add a reconciliation job that compares account balances with ledger sums.
- Enable monitoring for unmatched memberships, duplicate rate, outbox age and
  Firestore contention.
- Complete Australian privacy, retention and consent review.
