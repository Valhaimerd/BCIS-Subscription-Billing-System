# BCIS Data Model

The Drizzle schema and generated PostgreSQL migrations are the source of truth. This note covers the release schema through Task 10.

## Access foundation

- `users`, `roles`, `permissions`, `user_roles`, and `role_permissions` provide server-authoritative RBAC.
- `sessions` stores only SHA-256 token hashes plus expiry, lock, and revocation timestamps.
- `audit_logs` is append-only through normal application access and records safe actor/action/entity values.

## Subscriber and service master data

- `service_types` contains Internet, Cable, and Combo categories.
- `service_plans` stores a unique plan code, integer-centavo price, optional speed, optional channel count, and active state.
- `collection_areas`, `collectors`, and `collector_area_assignments` define collection responsibility.
- `subscribers` stores the unique subscriber account number, name, status, area, collector, billing/due defaults, and notes.
- `subscriber_addresses` and `subscriber_contacts` allow multiple labeled records with a primary marker.
- `subscriber_events` preserves subscriber status history and its reason/actor.
- `service_accounts` links a subscriber to a plan and installation address. Its unique account number, `current_rate_centavos`, billing day, due day, and billing start date are database-backed; the captured rate is not rewritten by future plan-price changes.
- `service_events` preserves service-account status history and its reason/actor.

Money uses PostgreSQL `bigint` centavos. Subscriber statuses are `ACTIVE`, `INACTIVE`, and `ARCHIVED`. Service-account statuses are `PENDING`, `ACTIVE`, `SUSPENDED`, `DISCONNECTED`, and `TERMINATED`. Historical rows are retained through lifecycle changes rather than deletion.

## Billing and ledger

- `billing_cycles` identifies a unique year/month and records DRAFT or FINALIZED state.
- `invoices` snapshots the subscriber/service relationship, service number, plan name, billing period, dates, subtotal, total, and status. A unique service-account/cycle index is the final duplicate-billing guard.
- `invoice_items` freezes each subscription charge or correction line in integer centavos.
- `adjustments` appends reasoned debit or credit corrections with their actor.
- `ledger_entries` stores chronological invoice debits, void credits, and adjustment debits/credits. Application routes do not update or delete posted entries.
- `invoice_number_sequence` supplies collision-free invoice numbers even when billing requests overlap.

Invoice statuses are DRAFT, UNPAID, PARTIALLY_PAID, PAID, OVERDUE, VOID, and CREDITED. Task 4 owns drafting, finalization, overdue state, adjustment, and void behavior; Task 5 owns payment-driven transitions.

## Payments and receipts

- `payments` records subscriber, exact centavo amount, Cash/GCash/Bank Transfer/Cheque/Other method, reference, notes, posting/verification identity, and POSTED, PENDING_VERIFICATION, REJECTED, or REVERSED state.
- `payment_allocations` links each posted payment to its oldest open invoices. Reversed-payment allocations remain for history but no longer reduce invoice balances.
- `payment_proofs` stores safe generated relative paths, MIME/size metadata, and SHA-256 checksums; image bytes stay in the configured attachment directory.
- `receipts` reserves a unique sequence-backed number for every posted payment. Reversal marks the receipt void without freeing its number.
- `payment_reversals` links one reasoned actor action to the original payment.
- `ledger_entries` now adds whole-payment credits and equal reversal debits. Any unallocated portion therefore remains reproducible as subscriber credit rather than a second balance store.

## Collection batches

- `collection_batches` links one assigned collector and area to a route date and enforces the documented forward-only state sequence.
- `batch_accounts` freezes subscriber/service numbers, name, route address, current bill, arrears, and total due when the route sheet is issued.
- `collector_remittances` records one exact Cash remittance for a submitted batch; shortage or overage is derived from linked posted Cash payments.
- `payments.batch_account_id` attributes a real Task 5 payment to a route account. A partial unique index permits only one pending or posted payment per route account while retaining rejected/reversed attempts and allowing a corrected replacement during `IN_PROGRESS`.

Batch totals are derived from frozen route accounts, linked POSTED payments, and the remittance. Cash and non-cash report actual posted amounts; receivable coverage is capped per route account so one overpayment cannot hide another account's unpaid amount. Rejected, pending, or reversed payments do not count as collected.

## Receivables and service control

- Receivables and aging are derived for an explicit date from finalized invoices, adjustments represented by ledger entries, active payment allocations, and unallocated subscriber credit. There is no editable AR balance table.
- `delinquency_settings` is a singleton containing only the grace period, suspension threshold, optional reconnection fee, and update actor.
- `suspension_records` retains the service, effective date, reason, notes, and approving actor.
- `reconnection_records` links to the service and suspension, retains request/completion dates, reason, technician, fee, notes, and actors, and permits only one open request per service.
- `service_accounts` remains the authoritative current service status, while `service_events` preserves every suspension and restoration transition.

Aging uses invoice due dates: Current includes invoices due on the supplied date, followed by inclusive 1-30, 31-60, 61-90, and 90+ day bands. A completed reconnection fee reuses the existing `adjustments` and `ledger_entries` tables.

## Reporting

Task 8 adds no reporting tables or duplicate totals. Dashboard indicators, previews, print views, PDFs, and workbooks are produced from the authoritative billing, payment, allocation, ledger, receivable, collection, and audit records described above. Preview pagination is presentation-only; exports execute the same validated filters against the full authorized result.

## Operations

- `application_settings` is a singleton containing the bounded backup-retention count and its last update actor/time.
- `backup_history` appends final backup, safety-backup, and restore outcomes with the initiating actor, completion time, safe message, source name, and verified manifest. Normal API routes expose no update or delete operation.

Migration `0007_first_wrecker.sql` also adds a composite payment status/date index for the existing report and collection date-range queries. It does not change financial values or posting semantics.
