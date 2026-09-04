# Pearl Energy Cloud Functions

The backend has two security domains:

- callable loyalty/admin functions: `ensureCustomerProfile`, `redeemReward`,
  `adminAdjustPoints`, and `setStaffAccess`;
- `posApi`, an authenticated and idempotent POS transaction ingestion endpoint.

The existing `api` wallet-pass routes remain scaffolds until the required
Apple/Google/Samsung credentials are supplied.

Read `../docs/database/ARCHITECTURE.md` and
`../docs/database/POS-CONTRACT.md` before changing data paths or the POS contract.

## Local verification

```powershell
npm install
npm test
```

## Deployment

Cloud Functions deployment requires the Firebase Blaze plan. Configure budget
alerts first, then store the POS secret in Secret Manager:

```powershell
npx firebase-tools functions:secrets:set POS_WEBHOOK_SECRET
npx firebase-tools deploy --only functions
```

Use at least 32 random bytes and never store this secret in `.env`, Firestore or Git.

## Exported functions

- `ensureCustomerProfile` — authenticated customer bootstrap with collision-safe IDs.
- `redeemReward` — atomic balance debit, ledger, redemption and coupon issue.
- `adminAdjustPoints` — admin-claim-only audited balance correction.
- `setStaffAccess` — main-admin-only branch-manager claim assignment, revocation,
  station scoping and audit logging.
- `posApi` — `POST /v1/pos/transactions` and `GET /health`.
- `api` — wallet pass scaffolds under `/passes/apple`, `/passes/google`, and
  `/passes/samsung`.

The wallet handlers must verify Firebase ID tokens before production. Their
current permissive CORS setting is development-only.
