# 🚀 Pearl Energy Rewards — Launch Checklist

Everything that can be built without your accounts is **done**. This is the short list of
what only *you* can provide (keys + product data) to flip the app from demo mode to
production. Each item is independent — add it and that feature turns on, no code changes.

Check live status anytime in the **Admin → Dashboard → Launch readiness** panel.

---

## ✅ Already built (no action needed)
- Mobile app — all screens, Stitch design, tier‑coloured membership card, QR + barcode
- Auth flow (email / mobile / Google / Apple / biometric UI) — real via Firebase
- Per‑customer database (unique customer number, membership ID, points, tier, transactions)
- Live data — points, offers, rewards, fuel prices, products, notifications update instantly
- **Admin panel** (`/admin.html`) — manage products, offers, rewards, fuel, customers, broadcasts
- Customer lookup by number
- Wallet buttons (Apple / Google / Samsung) + pass backend scaffold (`functions/`)
- Push (FCM) service worker + Google Maps locator — wired, waiting on keys

---

## 1) Firebase — Auth + Database (required) ⏳
1. Create a project at <https://console.firebase.google.com>
2. **Authentication → Get started** → enable Email/Password, Google, Apple (and Phone for OTP)
3. **Firestore Database → Create database** (production mode)
4. **Project settings → Your apps → Web app** → copy the config
5. `copy .env.example .env` → paste the 6 `VITE_FIREBASE_*` values → restart `npm run dev`
6. **Firestore → Rules** → paste `firestore.rules` → Publish
7. Mark yourself admin: `setCustomUserClaims(uid, { admin: true, staff: true })` (Admin SDK)

## 2) Product database (you supply the content) ⏳
Two ways to load your real products/offers/rewards/fuel prices:
- **Easiest:** open `/admin.html` (password `pearl-admin`) and add them in the UI, **or**
- **Bulk:** `npm i -D firebase-admin`, add `scripts/serviceAccount.json`, edit the arrays in
  `scripts/seed.mjs`, then `node scripts/seed.mjs`.

## 3) Push notifications — FCM (optional) ⏳
Firebase console → Project settings → Cloud Messaging → **Web Push certificates** → generate a
key pair → put it in `.env` as `VITE_FIREBASE_VAPID_KEY`. Members tap **Enable push** in the app.

## 4) Google Maps — live locator (optional) ⏳
Google Cloud console → enable **Maps JavaScript API** → create an API key →
`.env` → `VITE_GOOGLE_MAPS_API_KEY`. The locator swaps the illustrated map for a real one.

## 5) Wallet passes — Apple / Google / Samsung (optional) ⏳
- `cd functions && npm install && firebase deploy --only functions`
- Put the deployed URL in `.env` → `VITE_WALLET_API_URL`
- Provide the signing assets (Apple Pass Type cert, Google Wallet issuer, Samsung partner) —
  see `functions/README.md` for the exact TODO at each endpoint.

## 6) Ship it 📦
```bash
npm run build      # outputs dist/  (app = index.html, admin = admin.html)
```
Host `dist/` on Firebase Hosting / Vercel / Netlify. For real iOS/Android store apps, wrap the
build with Capacitor or rebuild the UI in React Native (Phase 3).

---

### Where each key lives
| Feature | Key(s) in `.env` | Turns on |
|---|---|---|
| Auth + Database | `VITE_FIREBASE_*` (6) | real accounts, live data, customer lookup |
| Push | `VITE_FIREBASE_VAPID_KEY` | FCM notifications |
| Maps | `VITE_GOOGLE_MAPS_API_KEY` | live locator map |
| Wallet | `VITE_WALLET_API_URL` | real passes |

Until a key is present, that feature runs in a safe demo mode — the app never breaks.
