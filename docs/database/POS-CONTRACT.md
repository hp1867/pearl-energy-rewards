# Pearl Energy POS contract — Supabase

Version: `1`. This is a provider-neutral server contract; the selected POS vendor still needs an adapter and acceptance testing. It does not process card payments. Register software must durably queue completed sales and reconcile any rejected events.

Base URL: `https://zaooprrcqphzocigtrxg.supabase.co/functions/v1/pos-api`

Routes:

- `POST /v1/pos/member` — minimal membership/coupon lookup at the register.
- `POST /v1/pos/transactions` — record a completed sale, refund or void.

These URLs work only after the function and migrations are deployed and an integration/key is configured. Browser Auth tokens do not authorize these endpoints. `verify_jwt = false` is deliberate: the function independently requires timestamped HMAC authentication on both routes.

## Authentication

| Header | Required value |
|---|---|
| `Content-Type` | `application/json` |
| `x-pearl-contract-version` | `1` |
| `x-pearl-key-id` | Assigned per-integration key identifier |
| `x-pearl-timestamp` | Current Unix seconds |
| `x-pearl-signature` | `sha256=` followed by hex HMAC-SHA256 |

Sign this exact UTF-8 string, using a server-held secret of at least 32 characters:

```text
v1.<key-id>.<timestamp>.<exact raw JSON body>
```

Whitespace changes in the body change the signature. The key ID is authenticated; the server obtains provider and integration ID from its key configuration, not from a caller-controlled provider header. The timestamp must be within five minutes. Retries use a fresh timestamp/signature but the same business payload and operation IDs. Rotations can overlap old/new key IDs mapped to the same integration, then remove the retired key. Do not create a new integration merely to rotate a secret.

Each integration maps to exactly one provider/store/station and must be active. Secrets belong in Edge Function secret configuration and the POS server's secret store, never in the browser, database rows or Git. Configure gateway rate limits and vendor-supported network restrictions before launch.

## Member lookup

```json
{"membershipCode":"10000000"}
```

Also accepts the issued `PE-...` membership identifier or `PEARL|1|PE-...` QR content. Legacy demo QR payloads containing balances are rejected.

Returns `customerNumber`, `membershipId`, `firstName`, `points` and available coupons (`id`, `rewardId`, `title`, `expiresAt`), plus a diagnostic request ID. It does not expose email, mobile, DOB or receipt history. Unknown or inactive memberships reject. Lookup is not a coupon reservation or guarantee of later availability.

## Completed sale example

All example IDs below are illustrative, not live credentials. Use a current timestamp and actual receipt identifiers.

```json
{
  "contractVersion": 1,
  "eventId": "store-a-sale-001-delivery",
  "eventType": "sale",
  "externalTransactionId": "store-a-sale-001",
  "occurredAt": "2026-09-14T05:00:00Z",
  "businessDate": "2026-09-14",
  "storeId": "vendor-store-a",
  "terminalId": "terminal-1",
  "receiptNumber": "001",
  "currency": "AUD",
  "subtotalCents": 1000,
  "taxCents": 91,
  "totalCents": 1000,
  "membershipCode": "10000000",
  "items": [{
    "lineId": "1",
    "sku": "COFFEE",
    "description": "Coffee",
    "category": "drinks",
    "quantityMilli": 2000,
    "unitPriceMicros": 5000000,
    "totalCents": 1000,
    "eligibleForPoints": true
  }],
  "payments": [{"method": "card", "amountCents": 1000}],
  "couponIds": [],
  "nightDealSales": []
}
```

`subtotalCents` is the register's pre-discount, tax-inclusive subtotal; `totalCents` is the final tax-inclusive amount. `taxCents` is its included tax. The adapter must normalize vendor conventions explicitly. Item totals include allocated discounts so they add up to the final receipt total, allowing two cents of rounding variance. Negative discount lines are not accepted: allocate discounts to the affected positive lines. Refund amounts are positive magnitudes; `eventType` determines the reversal.

For fuel, add `fuel: {"gradeCode":"ULP91","litresMilli":42110}` to the line. A price of $1.799/L is `unitPriceMicros: 1799000`. Do not send currency-formatted strings or floating-point money. `quantityMilli: 1000` means one item/unit.

Optional `couponIds` identifies benefits actually applied by the register; the signed sale consumes them atomically. `nightDealSales` contains objects with `dealId` and positive whole-unit `quantity`. The POS vendor must map reward IDs/campaign benefits to permitted SKUs, discount limits and stacking rules; the current API does not calculate or authorize a payment discount merely from a coupon title.

## Validation and refunds

- Maximum body: 256 KiB; 1–200 unique receipt lines; at most 10 payment entries, 20 unique coupon IDs and 50 unique night-deal IDs.
- AUD only. Whole integer cents, millilitres and scaled quantities; bounded field lengths. Included tax cannot exceed the total. Supplied payment entries must sum exactly to the total.
- No PAN, CVV, PIN, magnetic stripe, payment token or raw payment-gateway response is accepted. Only method and amount are stored for payment reconciliation.
- Omit membership for a non-member sale. An explicitly unknown membership rejects rather than silently losing its loyalty credit. Capture that rejection for staff reconciliation.
- Refund/void requires `originalExternalTransactionId`. Use new event/external transaction IDs for the reversal. Refund lines identify the original via `originalLineId` (or matching `lineId`). Original ownership, eligibility and cumulative amounts/quantities are enforced.
- A void must reverse an unrefunded sale in full. Refunds must not include `couponIds` or `nightDealSales`; expired food must not be automatically restocked.
- Coupon and night-deal availability is checked at server processing time. Delayed/offline events that arrive after a cutoff, or a race for the final item, can reject the whole transaction. The vendor integration must define reservation/preflight or explicit exception reconciliation before these benefits are used at live checkout. Never silently discard a completed payment or send a changed payload under the same ID.

## Response and retry contract

```json
{"ok":true,"duplicate":false,"transactionId":"database-uuid","pointsDelta":10,"requestId":"diagnostic-uuid"}
```

`pointsDelta` is the base earning/reversal amount. Additional campaign entries are in the ledger; use a fresh member lookup for the current balance. A duplicate returns the same transaction ID and base points with `duplicate: true`; the diagnostic request ID can change. A new delivery ID for the same unchanged business transaction is also deduplicated.

HTTP `400/413/415` means input validation; `401/403` means authentication/authorization; `409` means IDs reused with conflicting data; `422` means a business/database constraint failed; `503` means retryable backend failure. An unexpected `500` or timeout is an uncertain outcome: retry the same IDs/payload with backoff, and reconcile rather than assuming no write occurred.

## POS launch acceptance gate

Test real vendor events on a separate integration: sale, fuel volume/rounding, mixed/excluded categories, partial/full refund, void, no-member sale, bad member, concurrent duplicates, timeout-after-commit retry, conflicting IDs, two simultaneous coupon uses, final-item races, inactive station/key, secret rotation and offline events spanning an expiry. Verify receipt counts, stock, coupon state and `sum(ledger.delta) = account.balance` afterward. Local SQL tests do not replace these multi-connection and vendor tests.
