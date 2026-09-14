# Pearl Energy loyalty architecture — Supabase

The active implementation is PostgreSQL + Supabase Auth, with React consumer and admin apps sharing a provider boundary. SQL migrations are in `supabase/migrations`; operational setup is in [SUPABASE.md](SUPABASE.md). The older Firebase implementation is retained under `legacy/` and in Git for reference, not used by live mode.

This is a tested implementation baseline, not a guarantee against all failures. Hosted authentication, concurrent load, the real POS adapter, restore drills and operational controls must pass before launch. Database designs can evolve safely through versioned migrations; freezing a schema forever would make maintenance harder, not safer.

## Trust boundaries and data flow

```text
Customer app ── Supabase Auth ── RLS-protected reads / narrow customer RPCs
Admin app ───── Supabase Auth ── live staff permissions / audited admin RPCs
POS terminal ── signed server adapter ── pos-api ── service-only database RPC
                                                  │
                             one PostgreSQL transaction
                  receipt + lines + ledger + balance + coupon/stock
                              + campaigns + outbox + audit
                                                  │
                           Realtime invalidation + bounded app refresh
```

No customer browser can write receipts, award points, consume coupons, set its role, or modify balances directly. Even the admin browser uses validated RPCs rather than a service key. POS secrets remain on trusted servers, never in a `VITE_` environment variable.

## Data ownership

| Tables | Responsibility |
|---|---|
| `customers` | Portable UUID, separate Auth identity link, unique membership identifiers and editable profile |
| `loyalty_accounts`, `loyalty_ledger` | Fast balance projection and append-only evidence for every point change |
| `transactions`, `transaction_items`, `transaction_payments`, `transaction_night_deals` | Immutable canonical sales/refunds/voids and stock-sale links; integer AUD units, no card credentials |
| `coupons` | Server-issued reward snapshots and server-confirmed use |
| `stations`, `catalog_items`, `night_deals` | Published products, prices, offers, rewards and station-owned surplus inventory |
| `loyalty_programs` | Versioned earning policy used by each receipt |
| `campaigns`, `campaign_awards`, `wheel_credits`, `mission_cycles`, `mission_contributions` | POS-earned promotion eligibility, one-use spins and auditable prize outcomes |
| `private.staff_access`, `private.staff_stations` | Main-admin versus station-scoped manager access |
| `private.pos_integrations`, `private.integration_events`, `private.idempotency_keys` | Per-store POS authorization and duplicate-operation protection |
| `private.refund_totals`, `private.refund_lines` | Cumulative refund caps against original receipts |
| `private.audit_logs`, `private.outbox`, `private.promotion_reviews` | Privileged-action trail, future downstream work and refund exceptions |
| `private.push_devices`, `private.push_deliveries` | Private subscriptions and lease-based notification delivery |

Every exposed table has RLS enabled and explicit grants. Anonymous roles have no application table or RPC access. Public RPC wrappers run as invokers; privileged implementations live in the unexposed `private` schema with an empty search path and explicit execution grants. Roles are checked in database tables on each privileged call, not trusted from editable user metadata. This follows the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Identity and financial invariants

- Domain customer UUIDs do not depend on Supabase Auth UUIDs. Retiring an Auth identity unlinks it without destroying the loyalty history. This is not itself a complete privacy-deletion workflow.
- A barcode/QR identifies the membership; it is not an authorization secret and never carries a trusted balance. Only a signed, active POS integration can perform checkout operations.
- Money is integer cents; unit prices use millionths of a dollar; fuel uses millilitres. Points are integers. Receipt line totals allow at most two cents of rounding variance; supplied payment totals must match exactly.
- Every points change inserts a ledger entry. A trigger locks the account row and updates the balance in the same transaction. `balance = sum(ledger.delta)` is the reconciliation invariant.
- Existing receipts, receipt lines, ledger entries, integration events and audit records reject updates/deletes. Corrections append new records. A database owner can still override database controls; operational access and backups matter.
- Redemption locks the account, checks the current reward and balance, deducts points and issues one coupon atomically. Retries reuse an actor-scoped request UUID.
- POS delivery IDs and business transaction IDs are independently deduplicated. Reused IDs with changed canonical payloads reject, rather than silently overriding history.
- Refunds refer to an original sale within the same integration. Cumulative receipt and line quantities/amounts cannot exceed the original. Reversals use the original eligibility and rate, with cumulative rounding. Refunds may create points debt; blocking a legitimate reversal would enable purchase/redeem/refund abuse.
- A promotional refund reverses unused or credited benefits once. An already-consumed promotional coupon creates a staff review and pauses further promotion earning/spinning for that member; it does not discard the refund.

## End-of-day offers and admin access

Managers have only `nightDeals.manage` permission for assigned stations. They cannot access the main-admin customer tools, modify points, grant roles or publish other catalogs. Removing access takes effect on the next database request, including existing sessions.

Each deal has a manager-selected selling end time and a separate food-safety cutoff. Selling cannot continue beyond either cutoff or the end of that station's local business day. Existing safety cutoffs cannot be extended and a deal cannot be moved to a different branch. Dates are stored as UTC instants; IANA station timezones handle Sydney daylight saving.

RLS hides expired, paused, out-of-stock and inactive-station deals. The app also schedules local expiry refreshes. No paid timer, database deletion or successful cleanup job is needed to hide an expired offer. The signed POS transaction decrements inventory once. A screen view is not a reservation; register validation is still required. Never use this feature to sell food after its safe selling cutoff.

Catalog saves carry a row version to reject stale overwrites. Publication (`active`) is distinct from menu stock (`in_stock`). Archiving preserves records referenced by coupons and history.

## Performance and failure behavior

Owner/customer, station/time, catalog, membership and foreign-key lookups are indexed. Current balances are read from one account row, not recalculated from all history. Account locks serialize operations for one customer while unrelated customers can proceed independently. Admin lists are paged at 100; customer history is currently capped at the most recent 50 receipts and coupons at 100. Full historical browsing/export is an operational follow-up, not silently claimed as complete.

Realtime is a refresh signal, not the source of truth. The provider also refreshes on focus/reconnect and polls every 60 seconds. Clients display connection errors instead of silently manufacturing demo records or points. An uncertain browser mutation retains its request ID in session storage for retry; normal browser storage is required for cross-refresh retry continuity.

The transaction outbox is durable groundwork for exports/analytics; a general outbox dispatcher is not implemented. Web Push has a separate bounded worker with deduplication, two-minute leases, stale-worker protection and at most five attempts. Delivery is at-least-once, not exactly-once. Push failures cannot roll back purchases. Generic announcements must not contain personal account information.

## Evolution, portability and recovery

New changes use new SQL migrations; never rewrite an applied migration. Expand the schema first, backfill in controlled batches, validate counts and ledger totals, then change readers and retire obsolete fields after a rollback window. POS contract versions and earning-policy versions are separate from schema versions. Awarded prizes preserve snapshots; policy changes must preserve historical interpretation.

PostgreSQL exports must include both `public` and `private`, role/grant definitions, and the separately handled Auth identity mapping. Do not assume a table dump includes Auth provider configuration, Edge secrets, storage objects or signing keys. Customer domain IDs and integer units make another database/provider possible without rewriting historical identities. See [Supabase backups](https://supabase.com/docs/guides/platform/backups) for platform-specific coverage and limitations.

Run restore drills and ledger reconciliation on a separate restored database before trusting backups. Set retention, access/deletion, encryption, monitoring and incident-response policies before collecting live customer data. Monitoring should cover rejected POS events, duplicate conflicts, balance mismatches, promotion reviews, queue backlog, latency and database resource pressure.
