# Pearl Energy POS ingestion contract

Endpoint: `POST /v1/pos/transactions`

Contract version: `1`

The checked-in endpoint is provider-neutral. A concrete POS adapter should map
the vendor payload to this canonical contract. Never make the loyalty domain
depend directly on a vendor's field names.

## Authentication headers

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-pearl-contract-version` | `1` |
| `x-pearl-pos-provider` | stable provider key, such as `generic` |
| `x-pearl-timestamp` | Unix timestamp in seconds |
| `x-pearl-signature` | `sha256=<lowercase hex HMAC>` |

The signed bytes are:

```text
<x-pearl-timestamp>.<exact raw HTTP body bytes>
```

The server rejects timestamps outside five minutes and compares signatures in
constant time. Production should use an API gateway or mTLS in addition to HMAC
when the selected POS supports it. Rotate secrets with an overlap window.

## Request

```json
{
  "eventId": "evt_01J...",
  "eventType": "sale",
  "occurredAt": "2026-09-01T04:25:31.000Z",
  "externalTransactionId": "STORE12-20260901-009871",
  "originalExternalTransactionId": null,
  "businessDate": "2026-09-01",
  "storeId": "store_12",
  "terminalId": "pos_03",
  "receiptNumber": "009871",
  "currency": "AUD",
  "subtotalCents": 7564,
  "taxCents": 687,
  "totalCents": 7564,
  "membershipCode": "PE-ABCD-EFGH-JKLM",
  "items": [
    {
      "lineId": "1",
      "sku": "FUEL-ULP91",
      "description": "Unleaded 91",
      "category": "fuel",
      "quantityMilli": 42110,
      "unitPriceMicros": 1799000,
      "totalCents": 7576,
      "eligibleForPoints": true,
      "fuel": {
        "gradeCode": "ULP91",
        "litresMilli": 42110
      }
    }
  ],
  "payments": [
    {
      "method": "card",
      "amountCents": 7564
    }
  ]
}
```

No PAN, CVV, magnetic-stripe data, payment token, PIN or full payment gateway
response is accepted or stored. `payments` contains only a coarse method and
amount required for reconciliation.

## Validation limits

- Request body: 256 KiB maximum.
- `items`: 200 maximum; each `lineId` must be unique.
- All monetary and quantity values are integers.
- `currency` is currently `AUD`.
- Supported `eventType`: `sale`, `refund`, `void`.
- A refund/void requires `originalExternalTransactionId`.
- Sum and tax tolerances must be agreed with the actual POS before production.

## Responses

Successful first processing:

```json
{
  "ok": true,
  "duplicate": false,
  "transactionId": "hash...",
  "customerMatched": true,
  "pointsDelta": 75,
  "balanceAfter": 1915
}
```

An exact retry returns HTTP `200` with `duplicate: true` and the originally
stored result. Unmatched membership codes still store the canonical transaction
for later reconciliation and return `customerMatched: false`.

## Required POS acceptance tests

1. Same event delivered 100 times awards points once.
2. Same external transaction under different event IDs awards once.
3. Concurrent duplicate requests award once.
4. Invalid/expired signature writes nothing.
5. Unknown member stores an unmatched transaction and no ledger entry.
6. Refund creates a compensating ledger entry and links to the original sale.
7. Partial refund reverses only the correct eligible value.
8. POS timeout followed by retry returns the first result.
9. More than 200 lines and oversized bodies are rejected.
10. Payment-card data fields are rejected rather than silently persisted.

