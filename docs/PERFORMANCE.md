# Low-risk performance improvements — 30 September 2026

Scope authorised by the owner: improve speed without changing security, transactions or sensitive business logic.

## Changes

- Removed the fixed 2,400 ms branding delay from App. Authentication, profile loading, recovery and onboarding conditions are unchanged. The splash remains while required account data is unresolved.
- Kept login, Home and the account gate in the initial bundle. Offers, Menu, Rewards, Profile, Tonight Only and the large overlays module load on demand. Navigation focus/pointer intent preloads code only, not data or transactions.
- Added a loading/error boundary so a missing/offline chunk does not leave an unexplained blank screen. Navigation remains available; overlays provide Back and failures provide Reload.
- Extracted the common screen header to prevent Menu/Profile from importing the whole Offers screen.
- Catalog Realtime events now refresh only matching catalog kinds. Old/new kinds both count; missing/key-only delete payloads conservatively refresh all. Polling, initial load, subscription catch-up, focus/reconnect and mutation refreshes are retained. Non-catalog watchers still accept every event by default. This applies to the shared provider used by both the app and admin.
- Added a build-time startup-size budget and local regression tests.

## Explicitly unchanged

No database migrations, remote data writes, Auth configuration, RLS, account provisioning, consent logic, staff permissions, POS integration, receipt processing, points calculations, redemption/refund rules, account locks, or idempotency changes. No persistent cache of member data. No dependency upgrades. The member-loading RPC sequence was deliberately left alone under the owner's narrower approval.

## Measured build evidence

Same local production build/settings, before and after this change. Initial JS means the entry script plus statically preloaded JS from dist/index.html; gzip sizes use Node's gzipSync with default settings, consistently for both builds.

| Metric | Before | After |
| --- | ---: | ---: |
| Initial JavaScript, uncompressed bytes | 721,898 | 566,280 |
| Initial JavaScript, gzip bytes | 204,235 | 172,677 |
| Forced minimum splash timer | 2,400 ms | None |
| Catalog queries invalidated by one known-kind menu Realtime event | 6 | 1 |

This is 21.6% less uncompressed initial JS and 15.5% less gzipped initial JS. It is not a claim of a 15.5% faster app or a guaranteed 2.4-second saving: actual auth/data/network time and chunk requests still matter. On-demand screens incur a first-use download; subsequent imports are reused by the browser. Vercel environment values/compression can produce different hashes and transfer sizes.

## Verification

- `npm test`: existing database, POS, identity and expiry tests plus catalog invalidation, default watcher behaviour, cleanup, unchanged startup gates, deferred component exports and server-rendered loading fallback.
- `npm run test:reliability`: independent local PostgreSQL concurrency, receipt/reward/refund and restore regression suite. On Windows this needs a normal process token; sandbox token initialisation errors are infrastructure failures, not passing tests.
- `npm run test:edge`: type-check existing Edge functions.
- `npm run build`: production build plus a maximum 180,000-byte gzip startup-JS budget and a check that secondary screens are not eagerly preloaded.
- Diff review confirms protected server/Auth files are unchanged. No production database operations are part of this release.

The computer-use inventory returned no connected browser, so a real mobile/browser click-through and Lighthouse/network timing benchmark could not be performed here. Follow-up acceptance: test login/Google return, all tabs, menu/offer detail overlays, My Card/scanner, receipts, account settings, and an offline/reload scenario on the Vercel URL. Do not perform real redemptions merely to benchmark navigation.
