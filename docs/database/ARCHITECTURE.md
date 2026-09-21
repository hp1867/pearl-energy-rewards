# Pearl Energy database architecture

The active backend is PostgreSQL and Supabase Auth in the owner-confirmed Sydney project `zaooprrcqphzocigtrxg`. Consumer and admin apps share the Supabase provider. Firebase code is retained for reference, not used in live mode. Schema changes use tested migrations: a database should evolve safely, not be frozen forever. This implementation is not a guarantee against all failures.

## Identity and permissions

```text
Email/password or enabled Google sign-in
  -> Supabase authentication
  -> confirmed email (email link or verified Google identity)
  -> automatically provision/activate membership on first app session
  -> active membership + stable customer UUID + loyalty account

Admin sign-in -> live staff access check -> main-admin or assigned-station tools
```

Email-first policy, 21 September 2026: Supabase Auth owns email verification and credential uniqueness. SMS collection/verification is deferred. The normalized verified-phone unique index remains for future use, but unverified metadata cannot reserve a phone or prove ownership. Without SMS, the system cannot promise one human per phone number. Closed/suspended identities cannot reactivate themselves; ordinary sign-in never grants staff privileges.

The authenticated onboarding RPC checks the real Auth email confirmation, provisions a stable customer and loyalty account under a row lock, and activates pending membership automatically. Repeated calls cannot duplicate accounts. Missing published policies do not gate access. No consent is fabricated: when documents are available, the sign-in screen displays them with an agreement notice, and records those versions after successful authentication. Existing sessions do not retroactively agree to unseen documents. Marketing remains separately opt-in. No fake verification, automatic first-user-admin or silent demo fallback exists.

Immutable `policy_versions` stores business-approved text. `consent_events` records exact terms/privacy versions and optional marketing acceptance/withdrawal. Marketing is off by default. Self-service closure requires the current disclosure and typing CLOSE; it disables loyalty access but preserves history. No account merging, point transfers or duplicate-account support workflow is provided. Closure is not immediate erasure; retention/deletion procedures need a separate approved policy.

Main-admin recovery can request a reset email only to the account's existing verified email. It is rate-limited, audited and deduplicated. Admins cannot choose another destination, see reset links, set passwords or mark phones verified. A dedicated recovery page keeps support-initiated links separate from the admin's browser session. Replacing an email with an unverified caller-supplied address is not a recovery shortcut.

## Purchase flow

```text
Payment completed at POS -> vendor's durable receipt queue
  -> HMAC-authenticated gateway + financial validation
  -> COMMIT 1: immutable inbox + delivery deduplication
  -> COMMIT 2: receipt/lines + normal points/ledger/balance + audit/outbox
               + separately guarded promotion/coupon/stock processing
       valid benefit -> consume once, using historical purchase-time rules
       offer exception -> keep receipt and normal points; auto-log exception
       transient benefit failure -> keep core receipt; retry remaining work
  -> app refresh/Realtime -> current balance and purchase history
```

The Edge Function commits intake before calling the processor. Receipt and ordinary points are atomic. Guarded subtransactions prevent optional offer validation errors from discarding a paid receipt. Full ordinary points are based on eligible actual spend; an unverified extra promotional bonus is not granted automatically. A claimed active coupon belonging to the purchaser is closed if validation fails, avoiding reuse without falsely recording a validated redemption. Another person's coupon is untouched.

Invalid financial totals, identity or refund references are not automatically rewarded. Rejected pre-intake messages remain the vendor adapter's responsibility; accepted but invalid financial input stays visible for correction. Automatic offer exceptions and financial errors are different cases.

Delivery IDs and business IDs are independently deduplicated. Identical retries return the original receipt; changed content under the same ID is rejected. Receipt/ledger evidence is append-only. The balance update locks the account and commits with its ledger entry. Money uses integer AUD cents, unit prices millionths, fuel millilitres, quantities thousandths and points integers. No payment credentials are stored.

Refunds use original ownership, eligible lines and historical rate. Cumulative refunds cannot exceed the original amounts/quantities. Refunds may create points debt rather than enable purchase/redeem/refund abuse.

A distinct existing safeguard remains: refunding a qualifying purchase after its promotional coupon was already consumed creates a promotion review and pauses further promotional earning/spins. It never loses the refund or ordinary receipt points. The automatic offer-expiry policy does not silently waive this separate refund case.

## Data ownership

| Area | Tables |
| --- | --- |
| Identity | `customers`: portable UUID separate from Auth, unique membership/mobile, profile and status. |
| Points | `loyalty_accounts`: fast current balance; `loyalty_ledger`: immutable evidence. |
| Receipts | `transactions`, `transaction_items`, `transaction_payments`, `transaction_night_deals`. |
| Historical rules | `loyalty_programs`, `campaign_rule_versions`, `reward_rules`, `reward_rule_products`. |
| Benefits | `coupons`, `coupon_redemptions`, `campaign_awards`, `wheel_credits`, `mission_cycles`, `mission_contributions`. |
| Catalog | `stations`, `catalog_items`, `night_deals`. |
| Consent | `policy_versions`, `consent_events`, `private.account_closures`. |
| Authority | Private staff access/stations and per-store POS integrations. |
| Reliability | Private POS inbox, deliveries, issues, idempotency keys, integration events, refund totals/lines. |
| Operations | Private SKU mappings, deal versions/stock movements, reconciliation manifests, health checks, recovery requests, audit/outbox. |
| Notifications | Private push devices/deliveries with bounded leased delivery. |

## Historical benefits and timed offers

Actual purchase time selects the earning rule and SKU mapping. New earning rates are future-dated. Issued coupons bind immutable product/discount rules with amount caps, minimum spend, quantity, station and stacking restrictions. A paid reward without a valid published rule cannot deduct points. Spin credits and mission cycles retain the campaign version promised when they qualified.

Night deals bind catalog products and retain historical price/cutoff versions. Late valid sales can be recognised after expiry. Promotional claims older than seven days become automatic exceptions; ordinary purchase points remain. Locked stock cannot go negative, and a last-item conflict does not discard either paid receipt. Refunds never automatically restock food. Manual stock changes require a reason and retain movement history.

Station managers only manage assigned branches' Tonight Only offers. Selling ends at the chosen end time or safety cutoff, no later than that branch's local business-day end. Existing safety cutoffs cannot be extended. RLS and app timers hide expired offers without deleting them or depending on cleanup jobs. A screen listing is not a stock reservation.

## Security and performance

Every exposed table has RLS and explicit grants. Anonymous access is limited to published policy text, not customer data or privileged RPCs. Customers read their own records. Main admins use audited, live-role-checked operations; managers cannot grant roles or adjust points. Public RPC wrappers are invokers; privileged implementations live in the private schema with empty search paths. Server keys never go into browsers or Git. Private tables intentionally have no browser policies.

Balance reads use a single indexed account row. Customer, station, rule, receipt, queue and foreign-key lookups are indexed. Account locks serialize one member's changes while other members proceed independently. Multi-connection tests exercise races; production load capacity is not yet benchmarked. Member history is bounded to 50 receipts; complete browsing/export remains future work.

Realtime is an invalidation signal, backed by focus/reconnect and bounded polling. Errors never manufacture demo points. Uncertain browser mutations retain request IDs in session storage where available. Explicit local preview mode is separate from production.

## Operations, migration and recovery

Cron retries due receipts every minute, twenty per batch with bounded attempts/backoff, and records health every fifteen minutes. Health compares ledger/account balances, ordinary receipt points, stock movement totals and missing reconciliation days. A complete daily POS manifest additionally detects missing/unexpected receipts and differing totals. The app's own ledger cannot detect a purchase never delivered by the POS.

Admin Database Operations exposes rules, SKU mappings, queue status/retry, automatic decisions, stock movements and reconciliation. Ordinary offer exceptions require no approval. Genuine financial/identity problems cannot safely be auto-approved.

The isolated native PostgreSQL restore test checks balances, permissions, rules and durable intake. It is NOT a configured/tested hosted backup. Hosted retention, offsite protection, recovery objectives, alert routing and a hosted restore drill remain launch requirements. The generic outbox has no general export dispatcher.

Preserve domain IDs, public/private data, grants and Auth mappings during migration. Provider settings, secrets and storage objects need separate recovery plans. See [setup](SUPABASE.md), [POS contract](POS-CONTRACT.md) and [recovery runbook](RECOVERY.md).
