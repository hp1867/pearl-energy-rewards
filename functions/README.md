# Wallet pass backend (Cloud Functions)

Issues Apple / Google / Samsung wallet passes for membership cards. The mobile app
calls these endpoints from `src/services/wallet.js` when `VITE_WALLET_API_URL` is set.

## Deploy
```bash
cd functions
npm install
firebase deploy --only functions      # needs `firebase login` + a Firebase project
```
Then set in the app's `.env`:
```
VITE_WALLET_API_URL=https://<region>-<project>.cloudfunctions.net/api
```

## Endpoints
- `POST /passes/apple`   → `{ url }` to a signed `.pkpass`
- `POST /passes/google`  → `{ url }` "Save to Google Wallet" link
- `POST /passes/samsung` → `{ url }` Samsung Wallet link

Body: `{ customerNumber, membershipId, name, points, tier, qrData }`

## What you must provide (the parts that need your accounts)
- **Apple:** Pass Type ID + signing certificate (Apple Developer Program). Generate/sign the `.pkpass` (e.g. with `passkit-generator`).
- **Google:** Google Wallet API issuer account + service account key; build a loyalty class/object and return a signed JWT save link.
- **Samsung:** Samsung Wallet partner onboarding + card template.

The handlers in `index.js` are stubbed with step-by-step TODOs at each integration point.
