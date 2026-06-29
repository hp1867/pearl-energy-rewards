# Pearl Energy Rewards — Mobile App Prototype

**Fuel · Shop · Earn · Redeem**

A premium, interactive mobile-app prototype for **Pearl Energy Australia** (171 service stations across NSW / QLD / VIC, in partnership with Mobil). Built as a high-fidelity React + Vite web app styled and sized as a phone, so you can demo every screen in any browser today — and later wrap it into a native iOS/Android shell.

---

## Run it

```bash
cd "fuel app"
npm install      # already done
npm run dev      # opens http://localhost:5173
```

Build a static version to host/share:

```bash
npm run build
npm run preview
```

Open it on your phone: run `npm run dev`, then visit the **Network** URL Vite prints (e.g. `http://192.168.x.x:5173`) from a phone on the same Wi-Fi for the true mobile feel.

---

## What's included (Phase 1 — polished core)

| Flow | Status |
|------|--------|
| Splash screen (animated pearl mark) | ✅ |
| Login / Sign up — Email + Mobile toggle, Google/Apple, Face ID & Fingerprint, OTP, password reset, remember me, T&Cs | ✅ |
| Home dashboard — greeting, points card (3D tilt), quick actions, auto-sliding offer carousel (5s, swipe, dots), hot deals, AI "recommended", nearby stations | ✅ |
| Offers — category filters, premium redeemable cards | ✅ |
| Menu — 12 categories, search, Popular/New/Best Sellers/Imported filters, availability, add-to-order | ✅ |
| Rewards — points hero, tier progress, visual reward journey, redeem with confetti animation | ✅ |
| Membership card — flippable, 4 tiers (Blue/Silver/Gold/Platinum), live **QR code** + **barcode** | ✅ |
| Apple Wallet / Google Wallet buttons | ✅ (mock) |
| Fuel prices — ULP 91/95/98, Diesel, LPG, trends, station compare | ✅ |
| Store locator — interactive map pins, GPS dot, amenity filters, directions | ✅ |
| Digital receipts — view / PDF / share | ✅ |
| Notifications centre | ✅ |
| Profile — identity card, stats, transaction & reward history, settings, logout | ✅ |
| Scan Card floating action button — full-screen animated QR | ✅ |

### Design language
Pearl Energy blue (`#0057B8` / `#4DA3FF`), white & silver (`#F5F7FA`), orange accent pulled from the website. Glassmorphism, soft shadows, premium gradients, rounded cards, framer-motion page transitions, 3D pointer-tilt cards, card-flip and reward-collection animations.

---

## Tech

- **React 18 + Vite** — fast, instant preview
- **framer-motion** — animations & gestures
- **qrcode.react** + **react-barcode** — dynamic membership QR & barcode
- **lucide-react** — icon set

All data is mocked in `src/data/mockData.js`.

---

## Phase 2 — production roadmap (not yet built)

- **Backend:** Node.js + Firebase, **PostgreSQL** database
- **Auth:** Firebase Auth (email, phone OTP, Google, Apple, biometric)
- **Wallet passes:** real Apple PassKit (`.pkpass`) + Google Wallet API generation
- **Maps:** Google Maps API (live GPS, directions)
- **Fuel prices:** live feed integration
- **Notifications:** Firebase Cloud Messaging push
- **Admin panel:** products, offers, users, rewards, fuel prices, broadcast notifications, analytics
- **Native shell:** wrap as React Native (Expo) or Capacitor for App Store / Play Store

## Project structure

```
src/
  App.jsx                 # splash → auth → tab router + overlays
  context/AppContext.jsx  # navigation + member state + redeem logic
  data/mockData.js        # all demo data
  components/             # Brand, Card3D, MembershipCard, OfferCarousel, BottomNav, Toast
  screens/                # Splash, Auth, Home, Offers, Menu, Rewards, Profile, Overlays
```
