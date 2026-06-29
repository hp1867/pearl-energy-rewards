# Pearl Energy Rewards — Phase 2: Firebase Auth + Cloud Firestore (live data)

This phase adds a **real per-customer database** with **Firebase Authentication** and **Cloud Firestore** (Google Cloud). Every signed-up user gets a customer record; points, rewards, offers and fuel prices update **live** via Firestore real-time listeners — no app rebuild when data changes.

The app works in **two modes automatically:**

| Mode | When | What it does |
|------|------|--------------|
| **Local demo** | No Firebase keys present (default) | A localStorage database stands in for Firestore so you can demo signup/login, customer numbers, points and redemption right now. |
| **Firebase (live)** | `.env` filled with your Firebase config | Real Firebase Auth + Firestore. Multi-device, real-time, cloud-hosted. |

The Auth screen shows a badge telling you which mode is active.

---

## What was built

- **`src/firebase/config.js`** — initialises Firebase from `.env`; auto-detects whether keys exist.
- **`src/services/ids.js`** — generates the unique **customer number** (8-digit, the lookup key), **membership ID** (`PE-XXXX-XXXX-XXXX` on the card/barcode/QR), QR payload, and derives tier from lifetime points.
- **`src/services/firebaseProvider.js`** — real Auth + Firestore (signup/login/Google/Apple, live customer doc, redeem via transaction, live catalogs).
- **`src/services/localProvider.js`** — localStorage stand-in with the same interface.
- **`src/services/data.js`** — picks the provider.
- **`src/context/AppContext.jsx`** — exposes `member` (live), `offers`, `rewards`, `fuelPrices` (live), and `signup / login / loginProvider / logout / redeem / lookupCustomer`.
- **Customer Lookup** — Profile → Customer Lookup: type a customer number, fetch the full record + QR.

### Customer record (Firestore `customers/{uid}`)
```jsonc
{
  "uid": "<firebase auth uid>",
  "customerNumber": "10042377",          // unique, human-typeable lookup key
  "membershipId": "PE-4827-1903-5560",   // on card / barcode / QR
  "qrData": "PEARL|PE-4827-1903-5560|10042377|1840",
  "firstName": "Hardik", "lastName": "Sharma", "name": "Hardik Sharma",
  "email": "...", "mobile": "...", "dob": "...",
  "points": 1840,                        // current balance
  "lifetimePoints": 9120,                // drives tier
  "tier": "Gold",                        // Blue < Silver < Gold < Platinum
  "rewardsRedeemed": [ ... ],
  "transactions": [ ... ],
  "joined": "2026-06-03T...", "createdAt": 0, "updatedAt": 0
}
```
Live global catalogs live in collections `offers`, `rewards`, `fuelPrices`.

---

## Go live in 6 steps

1. **Create a Firebase project** → <https://console.firebase.google.com>.
2. **Authentication → Get started** → enable **Email/Password**, **Google**, and **Apple** (Apple needs an Apple Developer account). For phone OTP, also enable **Phone**.
3. **Firestore Database → Create database** (production mode).
4. **Project settings → Your apps → Web app** → copy the config.
5. In the project root, `copy .env.example .env` and paste your values. **Restart `npm run dev`.** The badge should read “Connected to Firebase”.
6. **Publish security rules:** copy `firestore.rules` into Firebase console → Firestore → Rules → Publish.

### Seed the live catalogs (so offers/rewards/fuel show real data)
```bash
npm i -D firebase-admin
# Firebase console → Project settings → Service accounts → Generate new private key
# save as scripts/serviceAccount.json   (never commit this)
node scripts/seed.mjs
```
After seeding, edit any doc in the Firebase console → the app updates **instantly**.

> Do **not** commit `.env` or `scripts/serviceAccount.json`.

---

## How "instant updates" works
The app subscribes with Firestore `onSnapshot`:
- the signed-in user's `customers/{uid}` doc → points/tier/rewards update live,
- `offers`, `rewards`, `fuelPrices` collections → change a price or offer in the console (or an admin panel) and every device refreshes with no redeploy.

## Customer lookup
`lookupCustomer(customerNumber)` queries `customers where customerNumber == <typed>`. In production this is a **staff** action — `firestore.rules` only allows it for users with a `staff: true` custom claim. Set claims with the Admin SDK:
```js
await admin.auth().setCustomUserClaims(uid, { staff: true })   // or { admin: true } to edit catalogs
```

---

## Still on the Phase 2 backlog (need your accounts/keys)
- **Phone OTP** end-to-end (Firebase Phone Auth + reCAPTCHA / app-check).
- **Push notifications** (Firebase Cloud Messaging) — needs a service worker + VAPID key.
- **Real wallet passes** — Apple PassKit `.pkpass` (Apple Developer cert) + Google Wallet API + Samsung Wallet.
- **Live Google Maps** in the locator — Google Maps JavaScript API key.
- **Admin panel** — a separate dashboard to manage products/offers/users/rewards/fuel and broadcast notifications (writes to the same Firestore).

Say the word and I'll wire any of these next.
