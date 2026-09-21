# Pearl Energy POS contract

Version `1`, provider-neutral. This API records completed purchases; it does not process payments or authorise discounts at checkout. The real vendor adapter must durably queue receipts and submit complete daily manifests. Signing keys remain unprovisioned until the POS is selected and tested.

Base: `https://zaooprrcqphzocigtrxg.supabase.co/functions/v1/pos-api`

| POST route | Purpose |
| --- | --- |
| `/v1/pos/member` | Minimal membership/coupon lookup; not a reservation. |
| `/v1/pos/transactions` | Durable sale/refund/void intake and processing. |
| `/v1/pos/receipts/status` | This integration's receipt status by business ID/type. |
| `/v1/pos/reconcile` | Compare a complete daily POS receipt manifest. |

## Authentication

All routes require JSON, `x-pearl-contract-version: 1`, assigned `x-pearl-key-id`, current Unix seconds in `x-pearl-timestamp`, and `x-pearl-signature: sha256=<hex HMAC-SHA256>`. Sign the exact UTF-8 bytes below with a server-held secret of at least 32 characters:

```text
v1.<key-id>.<timestamp>.<exact raw JSON body>
```

The five-minute signature window concerns delivery time, not purchase time. Retry with a fresh signature/timestamp and unchanged business payload. Key configuration binds provider and integration UUID; the database verifies the active store/station. Rotate keys within the same integration so duplicate protection remains intact. Browser JWTs do not authorise these routes. Gateway `verify_jwt=false` is deliberate: the function verifies HMAC. Configure rate limits and vendor-supported network restrictions before activation.

## Sale example

Illustrative IDs only; supply real register, membership and receipt identifiers.

```json
{
  "contractVersion": 1,
  "eventId": "sale-001-delivery",
  "eventType": "sale",
  "externalTransactionId": "sale-001",
  "occurredAt": "2026-09-21T05:00:00Z",
  "businessDate": "2026-09-21",
  "storeId": "vendor-store-a",
  "terminalId": "terminal-1",
  "receiptNumber": "001",
  "currency": "AUD",
  "subtotalCents": 1000,
  "taxCents": 91,
  "totalCents": 1000,
  "membershipCode": "10000000",
  "items": [{"lineId":"1","sku":"COFFEE","description":"Coffee","category":"drinks","quantityMilli":2000,"unitPriceMicros":5000000,"totalCents":1000,"eligibleForPoints":true}],
  "payments": [{"method":"card","amountCents":1000}],
  "couponIds": [],
  "nightDealSales": []
}
```

Subtotal is pre-discount, tax-inclusive; total is final tax-inclusive amount and tax is its included tax. Allocate discounts to positive lines, not negative discount lines. Item totals allow two cents rounding variance; supplied payments must sum exactly. Refund amounts are positive magnitudes, reversed according to event type.

One unit is quantityMilli 1000. Fuel may add `fuel:{"gradeCode":"ULP91","litresMilli":42110}`; $1.799/L is unitPriceMicros 1799000. Bodies are limited to 256 KiB, 1-200 unique lines, 10 payments, 20 coupons and 50 night deals. Fields, quantities and nesting are bounded. No PAN, CVV, PIN, payment tokens, magnetic stripe or raw gateway responses are accepted.

Member lookup accepts only `{"membershipCode":"10000000"}`, also issued PE-... or PEARL|1|PE-... identifiers. It returns membership number/ID, first name, points and available coupon IDs/titles/expiry; no email, phone, DOB or receipt history. Unknown/inactive membership is not silently treated as non-member. Omit membership deliberately for non-member sales.

## Product-linked benefits

Publish SKU mappings and typed reward rules through Database Operations before connecting the vendor. Checkout rules must agree; a coupon title is not discount authorisation.

Include couponIds and one couponRedemptions claim per coupon:

```json
{"couponId":"11111111-1111-4111-8111-111111111111","lineId":"coffee","quantityMilli":1000,"discountCents":500}
```

That line supplies grossTotalCents: gross must equal final amount plus claimed discounts. Checks cover ownership, purchase-time availability, original rule, mapped SKU/product, station, minimum spend, quantity/cap and stacking. Issued coupons keep their original rule.

Night-deal claims include dealId, complete lineId and whole-unit quantity. Mapped SKU, historical station/product/price/cutoffs and line total must match. No coupon/night-deal stacking on the same line. Current stock is locked and cannot become negative.

Late messages use occurredAt and historical rules, not arrival time. Promotional claims older than seven days become automatic exceptions. Malformed/missing/invalid optional benefits do not reject an otherwise valid financial receipt: preserve ordinary points on eligible actual spend, grant no unverified extra benefit, and log a sanitized automatic decision. An owned active coupon claimed as used is closed on validation failure; another person's coupon is untouched. No routine offer approval is required.

## Responses and retries

HTTP 200 indicates processed; 202 indicates durable intake accepted but awaiting processing/correction. Inspect state and transactionId: acceptance is not necessarily points posted.

```json
{"ok":true,"accepted":true,"inboxId":"database-uuid","state":"processed","transactionId":"database-uuid","pointsDelta":10,"duplicate":false,"requestId":"diagnostic-uuid"}
```

pointsDelta is the ordinary award/reversal, not all campaign entries. Identical retries do not award again. Delivery IDs may change, but the business ID/type/content may not. A conflicting payload returns 409; immutable intake is not edited. Corrections need explicit reversal/new-operation semantics agreed with the vendor.

Intake commits before processing. Temporary benefit failures retain core receipt/points and queue remaining work. Cron retries due receipts every minute, twenty per batch, with bounded backoff and at most ten attempts. Refund-before-sale is retryable. Invalid financial/identity input remains for technical correction, not automatic rewards.

400/413/415: invalid/oversized input. 401/403: unauthorised. 409: conflicting IDs. 422: rejected business/database input. 503, unexpected 500 or timeout: uncertain outcome; retry unchanged IDs/payload with backoff and check status.

Status body: `{"externalTransactionId":"sale-001","eventType":"sale"}`. Unknown intake returns 404, accepted:false. All status queries are integration-scoped.

## Refunds and reconciliation

Refund/void has a new business ID and originalExternalTransactionId. Lines identify originalLineId (or matching lineId). Original membership, quantities, amounts, eligibility and earning rule determine reversal. A void reverses an unrefunded sale in full. Refunds cannot consume coupons or automatically replenish surplus food.

A separate consumed-promotional-coupon refund safeguard can pause further promotions pending review; it does not discard a refund or ordinary points. This differs from automatic offer-expiry exceptions.

Reconciliation takes up to 2,000,000 bytes and 10,000 unique receipt operations:

```json
{"businessDate":"2026-09-21","receipts":[{"externalTransactionId":"sale-001","eventType":"sale","totalCents":1000}]}
```

Send the complete day, including separate refund/void operations. Results identify missing/unexpected receipts and amount differences. A match verifies IDs/types/counts/totals, not every line/tax or independent payment settlement. Missing vendor transmissions cannot be detected from the app's ledger alone.

## Real-vendor acceptance gate

Test sale/refund/void/rounding/excluded categories, malformed discounts, concurrent duplicates, response loss after commit, conflicting IDs, coupon/last-stock races, key rotation, inactive stores, offline expiry, seven-day boundaries and complete daily reconciliation. Verify ordinary/campaign points, historical versions, stock and permissions. Local SQL/HMAC tests do not replace the real integration test.
