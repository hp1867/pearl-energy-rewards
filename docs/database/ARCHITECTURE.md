# Pearl Energy loyalty data architecture

Status: production baseline, schema version `1`

This design treats points as a financial-style liability. The mobile document is
a fast read projection; it is not the source of truth. Every balance change is
made by trusted server code and recorded in an append-only ledger in the same
Firestore transaction.

## Non-negotiable invariants

1. A customer cannot award, redeem, reverse, or adjust points through a client SDK.
2. `loyaltyAccounts.balancePoints` equals the sum of that account's committed
   `loyaltyLedger.deltaPoints` entries.
3. Every POS event and external transaction has a deterministic idempotency key.
4. A retry returns the original result and never awards points twice.
5. Monetary values are integer cents. Fuel volume is integer millilitres. No
   financial calculation uses floating-point numbers.
6. Transactions, ledger entries, redemptions, integration events and audit logs
   are never edited by a client.
7. Documents carry `schemaVersion`; integrations carry a separate contract
   version. Migrations are additive, resumable and recorded.
8. Customer-facing documents contain only the bounded, current projection needed
   by the app. Unbounded history is stored as documents, never arrays.
9. Raw POS payloads and credentials are not stored in queryable Firestore fields.
10. All unknown collections are denied by Security Rules.

## Collection map

| Collection | Purpose | Writer | Retention |
|---|---|---|---|
| `customers/{authUid}` | Mobile profile and current loyalty projection | server; owner may edit allowlisted profile fields | customer lifecycle |
| `customers/{authUid}/activity/{id}` | Bounded-query customer timeline projection | server | policy-defined |
| `customers/{authUid}/coupons/{id}` | Customer coupon/redemption projection | server/POS | policy-defined |
| `customers/{authUid}/devices/{id}` | FCM device registrations | owner | until logout/revocation |
| `authLinks/{authUid}` | Firebase identity to portable domain customer ID | server | customer lifecycle |
| `customerNumbers/{number}` | Unique human customer-number lookup | server | customer lifecycle |
| `membershipCodes/{code}` | Unique POS/card lookup | server | customer lifecycle |
| `loyaltyAccounts/{accountId}` | Authoritative current points balance | server | customer lifecycle + legal retention |
| `loyaltyLedger/{entryId}` | Immutable point credits/debits/reversals | server | long-term/audit retention |
| `transactions/{transactionId}` | Canonical POS transaction header | POS ingestion service | accounting retention |
| `transactions/{transactionId}/items/{lineId}` | Canonical receipt lines | POS ingestion service | accounting retention |
| `redemptions/{redemptionId}` | Reward reservation/issue/use/reversal state machine | server/POS | audit retention |
| `integrationEvents/{id}` | Deduplicated inbound integration event receipt | server | TTL, 90 days default |
| `idempotencyKeys/{id}` | Cross-retry operation result | server | TTL, 400 days default |
| `outbox/{id}` | Reliable notification/export/analytics work | server worker | TTL after completion |
| `auditLogs/{id}` | Append-only privileged action trail | server | long-term/audit retention |
| `loyaltyPrograms/{id}` | Versioned earning/tier/expiry policy | controlled deployment | permanent versions |
| `campaigns/{id}` | Missions, wheel and promotional definitions | admin | versioned/archive |
| `campaignProgress/{id}` | Per-customer campaign state | server | campaign + audit window |
| `offers`, `rewards`, `fuelPrices`, `menu`, `categories`, `stations` | App catalogs | admin | archive instead of destructive edits |
| `schemaMigrations/{id}` | Migration checkpoints and checksums | deployment tooling | permanent |

## Customer identity

`customers/{authUid}` keeps owner reads fast and makes Security Rules simple. It
also contains a random `customerId`, while `authLinks/{authUid}` maps the Firebase
identity to that stable domain ID. POS records and ledgers store both IDs. This
allows Firebase Auth or the whole application layer to be replaced without
changing the loyalty identity.

Customer numbers and membership codes are identifiers, not authentication
secrets. POS redemption must always verify current server state. They are
allocated server-side and reserved by lookup documents inside the same atomic
transaction, preventing collisions.

Personally identifying information is deliberately absent from transaction,
ledger and integration document IDs. Email and phone are not duplicated into
financial history; historical records refer to `customerId`.

## Balances and ledger

`loyaltyAccounts` is the authoritative balance snapshot used for fast validation.
`loyaltyLedger` is the immutable evidence from which the balance can be rebuilt.
A mutation writes both in one Firestore transaction. Each ledger entry contains:

- `deltaPoints`, `balanceBefore`, `balanceAfter`
- `entryType` (`earn`, `redeem`, `refund`, `reversal`, `adjustment`, `expiry`)
- `customerId`, `customerUid`, `loyaltyAccountId`
- `causationId` and `correlationId`
- `programId`, `programVersion`, `schemaVersion`
- server timestamps and actor/source metadata

Refunds create compensating entries. Existing ledger entries are never changed.
If points were spent before a refund, the policy may permit a negative balance;
silently ignoring the refund would allow fraud. Redemptions always reject an
insufficient available balance.

## POS ingestion

The POS calls a server endpoint, never Firestore directly. The endpoint:

1. verifies timestamped HMAC authentication before parsing business data;
2. validates contract version, sizes, types, totals and supported currency;
3. hashes the raw payload for audit without retaining unnecessary card/payment data;
4. resolves the membership code through a server-only lookup;
5. checks both event and transaction idempotency keys;
6. atomically writes the transaction, receipt lines, ledger, balance, customer
   activity and an outbox event;
7. returns the exact stored result on retries.

Cloud Functions and webhook providers may deliver or retry work more than once,
so idempotency is a database invariant rather than an optional API feature.

## Query and performance strategy

- Random/hash document IDs distribute writes and avoid sequential-key hotspots.
- Current customer state is one document for a one-read home screen.
- History uses independently pageable documents and descending timestamp queries.
- Receipt lines are subcollection documents, avoiding Firestore's 1 MiB document limit.
- Only known query shapes receive composite indexes. Large maps, payload hashes and
  TTL timestamps are exempted from unnecessary indexes.
- The per-customer balance document can contend only for simultaneous operations
  on the same member; traffic across members naturally distributes.
- Aggregate reporting should use scheduled exports/BigQuery, not full collection
  scans from the admin browser.

## Security boundaries

- Firebase Authentication establishes the customer identity.
- App Check should be enforced before public launch.
- Custom claims contain access roles only (`staff`, `admin`), never profile data.
- Mobile clients can read their records and update a small profile-field allowlist.
- Admin client writes are limited to non-financial catalog content.
- Financial and POS collections are server-only even for admin client accounts.
- Cloud Functions Admin SDK permissions must be least privilege in production.
- POS secrets live in Secret Manager; they are never committed or stored in Firestore.

## Evolution and migration

The domain contract uses plain JSON primitives, integer units and ISO concepts,
not Firestore-specific references. Each document has `schemaVersion`, and each
loyalty calculation records the program version that produced it.

Changes follow expand/migrate/contract:

1. add new fields/collections while old readers still work;
2. deploy dual-read or dual-write adapters when required;
3. backfill deterministic customer batches with checkpoints in `schemaMigrations`;
4. compare counts, balances and checksums;
5. switch reads gradually;
6. retain a rollback window before removing obsolete paths.

Periodic exports must include customers, identity links, accounts, ledger,
transactions, receipt lines, redemptions, program versions and audit metadata.
The immutable ledger is the portability anchor: another database can rebuild all
balances and customer projections without trusting cached totals.

## Operational requirements before launch

- Enable billing/budget alerts before deploying Cloud Functions and scheduled jobs.
- Configure App Check, Secret Manager and least-privilege service identities.
- Add automated Security Rules tests to CI and run emulator integration tests.
- Load-test POS ingestion using realistic peak station traffic and retries.
- Monitor duplicate rate, unmatched memberships, ledger/balance reconciliation,
  outbox age, function latency/error rate and Firestore contention.
- Schedule exports and perform restore drills; a backup is unproven until restored.
- Define retention, privacy consent, access/deletion and breach-response policies
  with Australian legal/privacy advisers.

## Official platform references

- Firestore best practices: <https://firebase.google.com/docs/firestore/best-practices>
- Firestore transactions: <https://firebase.google.com/docs/firestore/manage-data/transactions>
- Rules field allowlists: <https://firebase.google.com/docs/firestore/security/rules-fields>
- Index definition and TTL: <https://firebase.google.com/docs/reference/firestore/indexes>
- Firestore locations: <https://firebase.google.com/docs/firestore/locations>

