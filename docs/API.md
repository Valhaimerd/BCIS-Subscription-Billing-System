# API Contract

The Fastify API is the only process permitted to access PostgreSQL. Versioned business endpoints use the `/api/v1` prefix. Interactive OpenAPI documentation is served from `/docs`.

## Health endpoints

| Method | Path                   | Authentication | Success                                | Failure                                                  |
| ------ | ---------------------- | -------------- | -------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/v1/health/live`  | None           | `200` when the API process can respond | `500` safe error envelope for an unexpected server error |
| `GET`  | `/api/v1/health/ready` | None           | `200` when PostgreSQL responds         | `503` when PostgreSQL is unavailable                     |

Successful response:

```json
{
  "success": true,
  "message": "BCIS API is ready.",
  "data": {
    "service": "bcis-api",
    "status": "ok",
    "timestamp": "2026-10-01T00:00:00.000Z"
  }
}
```

Readiness failure:

```json
{
  "success": false,
  "message": "Database is unavailable.",
  "data": {
    "service": "bcis-api",
    "status": "degraded",
    "timestamp": "2026-10-01T00:00:00.000Z"
  }
}
```

Database connection details and internal errors are never included in responses.

## Authentication endpoints

All protected calls use `Authorization: Bearer <opaque-token>`. The database stores only the token's SHA-256 hash. The Electron main process holds the raw token in memory; it is not exposed to the renderer or persistent browser storage.

| Method | Path                                  | Authentication | Purpose                                      |
| ------ | ------------------------------------- | -------------- | -------------------------------------------- |
| `POST` | `/api/v1/auth/login`                  | None           | Validate credentials and create a session    |
| `GET`  | `/api/v1/auth/session`                | Bearer         | Return the safe current-user/session view    |
| `POST` | `/api/v1/auth/logout`                 | Bearer         | Revoke the current session                   |
| `POST` | `/api/v1/auth/lock`                   | Bearer         | Lock the desktop session                     |
| `POST` | `/api/v1/auth/unlock`                 | Bearer         | Revalidate the password and unlock           |
| `GET`  | `/api/v1/administration/access-check` | Bearer         | Prove the server-side `user.manage` boundary |

Passwords and session tokens are never returned by the session endpoint, written to audit values, or included in expected authentication-error logs. Invalid bodies return `422`; invalid/expired sessions return `401`; inactive or unauthorized users return `403`; active login throttling returns `429`.

## Plans and subscriber master data

All endpoints below require a Bearer session. Read operations require `subscriber.view`; subscriber/plan changes require `subscriber.manage`; service-account changes require `service.manage`.

| Method  | Path                                       | Purpose                                                        |
| ------- | ------------------------------------------ | -------------------------------------------------------------- |
| `GET`   | `/api/v1/reference-data`                   | Active service types, plans, areas, and collectors for forms   |
| `GET`   | `/api/v1/plans`                            | List service plans                                             |
| `POST`  | `/api/v1/plans`                            | Create an Internet, Cable, or Combo plan                       |
| `PATCH` | `/api/v1/plans/:id`                        | Change future plan settings; existing account rates stay fixed |
| `GET`   | `/api/v1/subscribers`                      | Paginated current master-data search                           |
| `POST`  | `/api/v1/subscribers`                      | Register subscriber, addresses, and contacts                   |
| `GET`   | `/api/v1/subscribers/:id`                  | Complete profile with services and lifecycle history           |
| `GET`   | `/api/v1/subscribers/:id/activity`         | Paginated read-only activity timeline for the subscriber       |
| `PATCH` | `/api/v1/subscribers/:id/status`           | Inactivate, reactivate, or archive with a reason               |
| `POST`  | `/api/v1/subscribers/:id/service-accounts` | Add a service and capture the current plan rate                |
| `PATCH` | `/api/v1/service-accounts/:id/status`      | Change service status with history                             |

Subscriber search accepts `q`, `page` (default `1`), and `pageSize` (default `20`, maximum `100`). It searches subscriber and service account numbers, subscriber names, contacts, and addresses. Receipt and GCash-reference search joins remain owned by Task 5.

Changing `priceCentavos` requires a trimmed `reason` of 8–500 characters. The API returns `422` if the reason is missing or invalid. Other plan updates may omit it. The reason is recorded with the plan update audit event. A new catalogue price applies when creating a new service account; existing service-account rates and finalized invoices stay fixed.

Subscriber activity accepts `page` and `pageSize` (1–100) and merges status, service, invoice, adjustment, payment, reversal, and collection-route source records into a stable newest-first timeline. Each item contains only `id`, `occurredAt`, `category`, `label`, `reference`, `status`, `amountCentavos`, and `reason`. The API filters timeline categories using the signed-in user's corresponding `service.view`, `billing.view`, `payment.view`, and `collection.view` permissions; `subscriber.view` alone exposes only subscriber lifecycle events. This projects existing records rather than creating a second history store.

## Billing, invoices, and subscriber ledger

All endpoints require a Bearer session. Read operations require `billing.view`; cycle generation, finalization, adjustments, and voids require `billing.generate`.

| Method | Path                                  | Purpose                                                                                                    |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/billing-cycles`              | List monthly runs with invoice counts and exact centavo totals                                             |
| `GET`  | `/api/v1/billing-cycles/eligibility`  | Preview eligible, already invoiced, inactive, and future-start services for `periodYear` and `periodMonth` |
| `POST` | `/api/v1/billing-cycles`              | Idempotently generate eligible draft invoices for a year/month                                             |
| `POST` | `/api/v1/billing-cycles/:id/finalize` | Atomically finalize drafts and post matching ledger debits                                                 |
| `GET`  | `/api/v1/invoices`                    | Search and paginate invoices                                                                               |
| `GET`  | `/api/v1/invoices/:id`                | Return a frozen invoice with lines, adjustments, and payment allocations                                   |
| `POST` | `/api/v1/invoices/:id/adjustments`    | Append an audited debit or credit correction                                                               |
| `POST` | `/api/v1/invoices/:id/void`           | Void a finalized invoice with a reason and ledger credit                                                   |
| `GET`  | `/api/v1/subscribers/:id/ledger`      | Return chronological entries and deterministic running balance                                             |

Invoice search accepts `q`, `page`, `pageSize`, optional `status`, optional `subscriberId`, and optional `billingCycleId`. `q` covers invoice number, subscriber number/name, and service account number. Ledger queries accept optional ISO `from` and `to` dates; a filtered statement retains the correct opening balance in each returned running balance. No general update or delete route exists for posted invoice lines or ledger entries.

Eligibility counts active service accounts whose billing start date is on or before the selected month's last day. `remainingServices` and `estimatedNewCentavos` exclude services already invoiced in that cycle; inactive and future-start services are reported separately. It is a read-only snapshot, and draft generation checks eligibility again inside its transaction. Finalization locks the cycle row, posts matching ledger debits in one transaction, and rejects an empty draft run.

## Payments, receipts, and GCash verification

All endpoints require a Bearer session. History and proof reads require `payment.view` or `payment.verify_gcash`; posting requires `payment.create`; GCash decisions require `payment.verify_gcash`; reversals require `payment.reverse`.

| Method | Path                                  | Purpose                                                         |
| ------ | ------------------------------------- | --------------------------------------------------------------- |
| `GET`  | `/api/v1/payments/preview`            | Preview oldest-first allocation and remaining subscriber credit |
| `GET`  | `/api/v1/payments`                    | Search payment, receipt, and GCash history                      |
| `POST` | `/api/v1/payments`                    | Atomically post/allocate a non-GCash payment and issue receipt  |
| `POST` | `/api/v1/gcash-submissions`           | Store a pending GCash record and validated proof image          |
| `POST` | `/api/v1/payments/:id/gcash-decision` | Approve/post or reject pending GCash evidence                   |
| `POST` | `/api/v1/payments/:id/reverse`        | Append a reversal, void the receipt, and restore balances       |
| `GET`  | `/api/v1/payment-proofs/:id`          | Read checksum-verified proof data for authorized review         |

Payment amounts are positive safe integer centavos. Direct `GCASH` posting is rejected: staff must submit evidence and an authorized user must approve it. Proofs are JPEG, PNG, or WebP, at most 5 MB, stored under a server-generated path, and checksum-verified when read. Posted payments, allocations, receipts, proofs, and reversals have no destructive edit/delete API. Subscriber search also resolves invoice numbers, receipt numbers, and GCash references.

The allocation preview now returns a `fingerprint` for the account's open invoice balances and requested amount. A direct payment may send this as `previewFingerprint`; the server checks it inside the posting transaction and returns `409` if balances changed, so the cashier can review again. A direct payment may also send a UUID `idempotencyKey`. Repeating the same request with that key returns the original receipt; reusing it for another payment returns `409`. Existing clients may omit both fields. The nullable key has a PostgreSQL unique index; deploy migration `0008_dapper_magik.sql` before using the new cashier flow.

## Collection batches and reconciliation

All endpoints require a Bearer session. Reads require `collection.view`; generation, transitions, remittance, reconciliation, and closure require `collection.reconcile`.

| Method | Path                                        | Purpose                                                           |
| ------ | ------------------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/collection-batches`                | Search batches with calculated collection/remittance totals       |
| `POST` | `/api/v1/collection-batches/preview`        | Read eligible assigned accounts and current balances before issue |
| `POST` | `/api/v1/collection-batches`                | Generate a frozen route sheet from current assignments/balances   |
| `GET`  | `/api/v1/collection-batches/:id`            | Read the route snapshot, linked payments, and reconciliation      |
| `POST` | `/api/v1/collection-batches/:id/start`      | Move an OPEN batch to IN_PROGRESS                                 |
| `POST` | `/api/v1/collection-batches/:id/submit`     | Submit an in-progress batch after pending GCash is resolved       |
| `POST` | `/api/v1/collection-batches/:id/remittance` | Record the collector's exact Cash remittance                      |
| `POST` | `/api/v1/collection-batches/:id/reconcile`  | Confirm the currently visible shortage/overage                    |
| `POST` | `/api/v1/collection-batches/:id/close`      | Authoritatively close a reconciled batch                          |

The preview accepts `collectorId`, `collectionAreaId`, and `batchDate` and requires `collection.reconcile`. It returns eligible account cards and totals without creating a batch. Creation accepts optional `selectedServiceAccountIds` (one or more UUIDs); the server rechecks eligibility and rejects stale selections with `409`. Older callers that omit the selection retain the full-route behavior. A Cash remittance that differs from Cash collected requires a nonempty `notes` reason. Batch detail includes `history` events (action, actor name, timestamp) and `remittanceReason` for read-only evidence.

State changes follow `OPEN → IN_PROGRESS → SUBMITTED → REMITTED → RECONCILED → CLOSED`. Collection posting reuses `/payments` and GCash proof submission with a `batchAccountId`; the database permits only one pending or posted payment for a route account while retaining rejected and reversed attempts for audit history. Linked payments can be created, decided, or reversed only while the batch is `IN_PROGRESS`, and batch submission waits for those writes and rejects unresolved GCash proofs. Reconciliation and closure require `actorConfirmed: true` and the caller's exact `expectedDifferenceCentavos`, so a changed or nonzero difference cannot be silently treated as balanced.

## Receivables and service control

All endpoints require a Bearer session. Reads require `receivable.view`; delinquency policy changes require owner `settings.manage`; suspensions and reconnections require `receivable.manage`.

| Method  | Path                                           | Purpose                                                      |
| ------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `GET`   | `/api/v1/receivables/summary`                  | Derive current, overdue, aging, and candidate totals         |
| `GET`   | `/api/v1/receivables`                          | Filter and paginate derived account-level receivables        |
| `GET`   | `/api/v1/receivable-settings`                  | Read grace, suspension-threshold, and reconnection-fee rules |
| `PATCH` | `/api/v1/receivable-settings`                  | Update and audit the delinquency rules                       |
| `GET`   | `/api/v1/service-accounts/:id/service-control` | Read suspension, reconnection, and service history           |
| `POST`  | `/api/v1/service-accounts/:id/suspensions`     | Suspend a threshold-qualified active service                 |
| `POST`  | `/api/v1/service-accounts/:id/reconnections`   | Request reconnection after overdue arrears are cleared       |
| `POST`  | `/api/v1/reconnections/:id/complete`           | Restore service and post the configured fee                  |

Both receivable reads require an explicit ISO `asOf` date. Aging boundaries are inclusive: due today is Current; 1-30, 31-60, and 61-90 use those exact day ranges; more than 90 days is 90+. Both reads accept `q`, `collectorId`, `areaId`, `planId`, `serviceTypeCode`, and `agingBucket`; detail also accepts `page`, `pageSize`, and `queue` (`ACT_TODAY`, `DUE_SOON`, `ALL`). Summary and detail use the same non-queue filters. Summary returns aging amounts and account counts, plus counts for each queue. Act today includes accounts past grace or eligible for suspension and today's settled suspended services. Due soon includes other accounts overdue within grace or due within seven days. All includes every matching case. Ordering is stable: reconnection-ready, follow-up, oldest due date, arrears, then subscriber account. Snapshot balances follow `asOf`; service state and policy are current, so the desktop permits state changes only on today's snapshot.

Receivables are calculated from finalized, non-void invoices and their adjustments, active payment allocations, and remaining subscriber credit as they existed by the requested date. Today's queue also includes suspended services with no outstanding invoice balance so staff can request reconnection. Suspension requires an active service whose oldest overdue invoice meets the configured grace and threshold rules. Reconnection requires a suspended service with no overdue arrears. Completion appends service history and posts any configured fee as an audited invoice adjustment and ledger debit.

## Dashboard and reports

All endpoints require a Bearer session. Dashboard and report previews require `report.view`; file generation requires `report.export`. User-activity and audit outputs additionally require `audit.view`.

| Method | Path                           | Purpose                                                |
| ------ | ------------------------------ | ------------------------------------------------------ |
| `GET`  | `/api/v1/dashboard`            | Load authoritative management KPIs and recent activity |
| `GET`  | `/api/v1/reports/:kind`        | Preview a validated, filtered, paginated report        |
| `GET`  | `/api/v1/reports/:kind/export` | Generate the full filtered report as `pdf` or `xlsx`   |

Dashboard queries require ISO `from`, `to`, and `asOf` dates. Report queries add `granularity` (`DAILY`, `WEEKLY`, `MONTHLY`, or `ANNUAL`), `dimension` (`PLAN`, `SERVICE`, or `AREA`), optional `subscriberId`, optional search text, and preview pagination. The same search text narrows both preview rows and full exports; export ignores only preview pagination. `from` cannot be after `to`.

The dashboard includes `monthlyTrend`, with one `{ period, billedCentavos, collectedCentavos, differenceCentavos }` point for each month containing invoice or payment activity. Billed amounts follow invoice dates; collected amounts follow payment dates. These are distinct transaction cohorts and are not a direct invoice-to-payment reconciliation. All amounts are integer centavos.

Supported report kinds are `COLLECTIONS`, `BILLING_COLLECTION`, `REVENUE`, `AR_AGING`, `SUBSCRIBER_MASTER`, `SUBSCRIBER_SOA`, `COLLECTOR_PERFORMANCE`, `ADJUSTMENTS_REVERSALS_VOIDS`, `USER_ACTIVITY`, and `AUDIT`. A subscriber statement requires `subscriberId`. Exports deliberately ignore preview pagination and contain the complete authorized filtered result. The API returns only report-specific allowlisted columns; it never includes credentials, tokens, proof paths, or raw internal records.

## Backup and operations

These endpoints are Owner-only through server-side permissions. Readiness, backup history, and creation require `backup.create`; restore requires `backup.restore`; retention reads/changes require `settings.manage`. Administrators and Cashiers do not receive these permissions.

| Method  | Path                           | Purpose                                                      |
| ------- | ------------------------------ | ------------------------------------------------------------ |
| `GET`   | `/api/v1/operations/readiness` | Check database, storage, backup tools, and restore state     |
| `GET`   | `/api/v1/application-settings` | Read the bounded backup-retention setting                    |
| `PATCH` | `/api/v1/application-settings` | Change the retained backup-directory count                   |
| `GET`   | `/api/v1/backups`              | Paginate immutable backup/restore outcomes                   |
| `POST`  | `/api/v1/backups`              | Create and verify a database plus attachment backup          |
| `POST`  | `/api/v1/backups/:id/restore`  | Guardedly restore and verify one available successful backup |

Restore input is `{ "confirmation": "RESTORE <backup-name>" }`. An absent backup returns `404`; a mismatched confirmation, incompatible manifest, or concurrent restore returns `409`; safe tool/storage failures return `503`. While recovery is active, non-health requests receive a sanitized `503`. No endpoint accepts a filesystem path, executable path, connection string, or shell fragment from the client.
