# Shared catalog publication

Requested by the owner on 21 September 2026 for the client presentation, using normal sign-in for everyone. This is database content, not demo-account mode or a fallback to local storage.

Source: the menu, categories, offers and rewards already designed in `src/data/mockData.js`. Imported through `scripts/shared-catalog.mjs` into the existing `public.catalog_items` table, which both the customer app and admin dashboard already use.

Contents: 9 categories, 29 menu items, 5 offers, 5 reward listings. Existing prices, descriptions, artwork and availability flags are retained. Offers end at 23:59:59 Sydney time on 21 October 2026 instead of the prototype's expired June/July dates. The menu and reward listings remain until unpublished in admin.

No users, points, receipts, notification claims, fuel prices, station locations, night-deal stock or POS rules are imported. Reward listings do not create redemption rules or grant points; actual redemption still needs a configured reward rule and a sufficient real balance. Confirm prices, product availability and promotion fulfilment before public launch.

## Admin operation

Open `/admin.html` with an existing main-admin account. Use Menu Categories, Menu Items, Offers and Rewards to edit the shared records. Save changes with their current version. Uncheck **Published to customers** to hide an item for all members; offers also hide automatically at their end time. No account-specific copy exists. This operation does not grant staff permissions to anyone.

## Repeatability and rollback

`node scripts/shared-catalog.mjs 2026-10-21T12:59:59Z` prints the import SQL for review. It does not connect or write automatically. Apply only to the owner-confirmed project `zaooprrcqphzocigtrxg` after review/testing.

The import inserts missing IDs only, never overwrites or republishes admin edits, and logs each inserted row as `catalog.import` with batch `shared-catalog-2026-09-21`. It runs in one transaction with category parents first. It is deliberately separate from schema migrations and never runs on page load/deploy.

To remove the temporary content, unpublish the imported entries through admin rather than deleting records. The import audit identifies the precise records; check for subsequent admin edits before any bulk unpublish. No cleanup runs without an explicit request.
