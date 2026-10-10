# BCIS Subscription Billing and Collection System Implementation Plan

**Source:** `docs/BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md`

**Goal:** Build and demonstrate the complete BCIS Windows desktop system for three simultaneous office PCs, including billing, subscriber ledgers, payments, GCash verification, collector reconciliation, receivables, reports, audit trails, and tested backup/restore.

**Project boundary:** BCIS is a separate system from the existing Student Information Management application. Implement it in a new top-level `BCIS-Subscription-Billing-System/` workspace so the completed Activity II/III source remains unchanged.

**Architecture:** Hardened Electron desktop clients communicate with one Fastify API over the LAN. Only the API accesses PostgreSQL, attachments, backups, and audit logs. Shared Zod contracts keep the desktop and API types aligned. Financial mutations run in PostgreSQL transactions and use integer centavos; posted records are corrected with reversals or adjustments, never destructive edits.

**Stack policy:** Keep the handout's Electron, React, TypeScript, Fastify, PostgreSQL, Drizzle, and Zod architecture. The other tools listed in Section 2.2 are recommended choices, not a requirement to install or abstract around them before their owning task needs them. Reuse the platform, standard library, existing code, and installed dependencies first.

## Drift Guard

Apply this guard before and after every numbered task.

1. **Source of truth:** The laboratory handout controls scope. In order of priority, follow its mandatory functional requirements, architectural/security rules, mandatory acceptance tests, minimum dataset, required deliverables, and final demonstration sequence.
2. **Requirement test:** Every implementation item must point to a handout section, acceptance test, deliverable, or current task completion gate. If it cannot, do not build it.
3. **One-task boundary:** Implement only the current task's coherent vertical slice. Do not create future tables, screens, services, generic frameworks, or extension points unless the current task cannot pass without the smallest prerequisite.
4. **Minimum working design:** Use the simplest implementation that satisfies the stated rule and its failure cases. Add a shared abstraction only when at least two real consumers already need it.
5. **Recommended is not mandatory:** Add shadcn/ui, TanStack tools, React Hook Form, ExcelJS, pdfmake, or similar packages only in the task that uses them and only when existing/native capabilities are insufficient.
6. **Evidence over extras:** A task is complete when its required behavior, focused tests, quality checks, and checkpoint evidence pass. Extra dashboards, animations, configuration systems, reports, or documentation do not substitute for that evidence.
7. **No premature final deliverables:** Create installer, full manuals, report packs, presentation material, and large demo data only in their owning tasks. Earlier tasks retain only the concise documentation and evidence needed to reproduce what already works.
8. **No security or financial shortcuts:** Minimalism must never remove server-side authorization, validation, database constraints, transaction boundaries, exact money handling, immutable posted history, auditability, accessibility basics, or backup verification.
9. **Stop rule:** When the task's mapped handout requirements and completion gate pass, stop. Record unrelated ideas as optional future work instead of implementing them.

### Explicitly Out of Scope Unless Separately Requested

- Section 15 optional enhancements: mobile/PWA, SMS/email reminders, customer portal, online payment gateway, QR receipts, GIS, technician inventory, forecasting, and route optimization.
- Facebook/GCash API automation; the required workflow is staff review of submitted proof, not automatic payment confirmation.
- Cloud hosting, microservices, Redis, message queues, Kubernetes, Docker, object storage, multi-tenant architecture, event sourcing, CQRS, plugin systems, or generalized workflow engines.
- AI service integrations. AI-assisted development is permitted, but the finished BCIS system does not require an AI API.
- Features, entities, reports, filters, settings, or roles beyond those named by the handout or required by a mandatory workflow.

### Task-to-Handout Traceability

| Task | Handout ownership                  | Mandatory acceptance ownership          |
| ---- | ---------------------------------- | --------------------------------------- |
| 1    | Sections 2 and 6, Phase 1          | Foundation evidence only                |
| 2    | Sections 3.1 and 4.4, Phase 2      | AT-10 authorization foundation          |
| 3    | Sections 3.2-3.3 and 5, Phase 3    | Required sample master data             |
| 4    | Sections 3.4-3.5 and 5, Phase 4    | AT-11 duplicate billing                 |
| 5    | Sections 3.6-3.7 and 3.11, Phase 5 | AT-01 through AT-06                     |
| 6    | Section 3.8, Phase 6               | AT-07 and AT-08                         |
| 7    | Sections 3.9-3.10, Phase 7         | AR reconciliation evidence              |
| 8    | Sections 3.11 and 4.1-4.3, Phase 8 | Required PDF/XLSX/report evidence       |
| 9    | Sections 2.1 and 4.5, Phase 9      | AT-09, AT-10, and AT-12                 |
| 10   | Sections 7-14, Phase 10            | Full AT-01 through AT-12 and final demo |

The minimum data model in Section 5 is distributed across the owning tasks. “As needed” entities are added only when a required workflow uses them.

## Working Rules

- Complete one numbered task per implementation session.
- A task is complete only when its focused tests, lint, type checking, build, and listed evidence pass.
- Keep the implementation small: introduce shared abstractions only after two real consumers need them.
- Do not implement Section 15 optional enhancements before every mandatory completion gate passes.
- Do not reuse or modify the current repository's `app/`, `frontend/`, migrations, or Student Information System database.
- The renderer must never access PostgreSQL, Node.js, the filesystem, credentials, or arbitrary IPC directly.
- Use `contextIsolation: true`, `nodeIntegration: false`, sandboxing, a strict Content Security Policy, and a narrow typed preload API.
- Keep authentication and authorization authoritative on the API. Hidden desktop controls are only a usability feature.
- Store all money as integer centavos and format it only at presentation boundaries.
- Use database constraints for uniqueness and transactions for every multi-record financial operation.
- Finalized invoices, payments, receipts, ledger entries, remittances, and audit records are append-only except for explicit status transitions, adjustments, voids, or linked reversals.
- Validate every API input and response boundary with Zod.
- Keep environment secrets out of Git. Use synthetic subscriber and payment data only.
- Add commands to README files only after those commands run successfully.
- Commit each task as a focused checkpoint after its completion gate passes.

## Planned Workspace

```text
BCIS-Subscription-Billing-System/
|-- apps/
|   |-- api/                 # Fastify routes, services, authorization, reports
|   `-- desktop/             # Electron main/preload and React renderer
|-- packages/
|   |-- contracts/           # Shared Zod request/response schemas and types
|   `-- database/            # Drizzle schema, migrations, repositories, seeds
|-- database/
|   |-- migrations/
|   `-- seeds/
|-- docs/
|-- tests/
|   `-- acceptance/
|-- reports-samples/
|-- release/
|-- storage/                 # Git-ignored local attachments and generated files
|-- .env.example
|-- CLAUDE.md
|-- package.json
|-- package-lock.json
`-- README.md
```

Use npm workspaces and one lockfile. Task 1 must define and verify the shared `dev`, `lint`, `format`, `typecheck`, `test`, and `build` scripts before later tasks rely on them.

## Core Data Decisions

| Concern            | Implementation rule                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Money              | PostgreSQL `bigint` centavos; TypeScript `bigint` or validated decimal-string conversion; never floating-point arithmetic      |
| Dates              | PostgreSQL date/timestamptz; API emits ISO 8601; billing periods use explicit year/month fields                                |
| Numbering          | Database-backed counters or locked sequence rows for invoices and receipts; numbers are never reused                           |
| Ledger             | Immutable `ledger_entries` linked to the originating invoice, payment, adjustment, or reversal                                 |
| Payment allocation | Oldest unpaid invoice first by default; allocation and balance updates occur in one transaction                                |
| Advance payment    | Unallocated payment value remains as subscriber credit and is never discarded                                                  |
| GCash              | Proof begins as pending; only authorized verification posts the payment; verified reference uniqueness is database-backed      |
| Attachments        | Files live outside the database under generated names; metadata, checksum, MIME type, size, and owner are stored in PostgreSQL |
| Audit              | Append-only audit rows record actor, action, reason, timestamp, entity, and safe old/new values                                |
| Deactivation       | Subscribers and service accounts use lifecycle statuses rather than historical deletion                                        |
| Backup             | `pg_dump` plus attachment archive and manifest; restore uses `pg_restore`, checksum verification, and an integrity check       |

## Task 1: Foundation and Hardened Desktop/API Shell

**Status:** Completed on 2026-10-01.

**Build**

- [x] Create the isolated npm workspace and the planned folder structure.
- [x] Configure TypeScript strict mode, linting, formatting, Vitest, environment validation, and workspace scripts.
- [x] Create the Fastify server with structured Pino logging, safe error responses, request IDs, and `/health/live` plus `/health/ready` endpoints.
- [x] Configure PostgreSQL and Drizzle without embedding credentials; create the migration runner.
- [x] Create the Electron main, preload, and React renderer processes with secure web preferences and a typed minimal IPC surface.
- [x] Add the basic application shell, required navigation groups, route placeholders, and the specified design tokens.
- [x] Add `.env.example`, `.gitignore`, minimal `README.md`, and project-level `CLAUDE.md` rules.

**Tests and evidence**

- [x] Unit-test environment parsing and API health behavior.
- [x] Prove the renderer has no Node.js or database access.
- [x] Run the newly defined workspace lint, format, typecheck, test, and build scripts.
- [x] Save the architecture diagram, successful database readiness check, Electron shell screenshot, and verified setup commands.

**Completion gate:** A clean checkout can install dependencies, configure an environment, migrate an empty database, start the API, and open the hardened Electron shell.

## Task 2: Authentication, Sessions, RBAC, and Audit Foundation

**Status:** Completed on 2026-10-02.

**Build**

- [x] Add migrations for `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, and `audit_logs`.
- [x] Seed the seven required roles, granular permissions, and one development Owner/Super Admin account with a non-production password.
- [x] Implement secure password hashing, login, logout, session expiry, failed-login throttling, active/inactive accounts, and session lock/unlock.
- [x] Keep the opaque session token out of logs and persist only its hash on the server.
- [x] Add server-side permission middleware and permission-aware desktop routing/navigation.
- [x] Make audit records append-only through normal application access.

**Tests and evidence**

- [x] Test successful and failed login, inactive users, expiry, logout, and failed-login handling.
- [x] Test each role boundary at the API, including direct calls that bypass hidden UI controls.
- [x] Test that sensitive values are excluded from API responses, audit payloads, and logs.
- [x] Demonstrate login, logout/session lock, seeded admin access, and one rejected lower-role operation.

**Completion gate:** Authentication works end to end, all protected endpoints require a valid session, and authorization is enforced by the API.

## Task 3: Plans, Subscribers, Service Accounts, and Search

**Status:** Completed on 2026-10-02.

**Build**

- [x] Add migrations for `service_types`, `service_plans`, `subscribers`, subscriber addresses/contacts, `service_accounts`, `service_events`, `collection_areas`, collectors, and assignments.
- [x] Enforce unique subscriber and service account numbers with database constraints.
- [x] Implement Internet, Cable, and Combo plan management, including speed/channel attributes and future-only plan-price changes.
- [x] Implement subscriber registration, multiple addresses/service accounts, status history, area/collector assignment, and archive/inactivate behavior.
- [x] Add paginated server-side search for Task 3 master data: subscriber/service account number, name, contact, and address. Receipt, invoice, and GCash-reference joins remain in Tasks 4 and 5 with their owning records.
- [x] Build the subscriber list, profile tabs, plan screens, service-account screens, and validated forms.

**Tests and evidence**

- [x] Test validation, uniqueness, pagination, filters, lifecycle changes, and historical-rate preservation.
- [x] Seed at least 50 subscribers, 60 service accounts, 3 Internet plans, 2 Cable plans, 2 Combo plans, 2 collectors, and 3 collection areas.
- [x] Demonstrate subscriber creation, multiple services, plan assignment, search, and archive behavior.

**Completion gate:** The required subscriber and service data can be created, searched, updated safely, and viewed from a complete subscriber profile.

## Unfinished-Task Execution Guard

Tasks 1-3 are the implemented baseline: the secure Electron/API boundary, authentication/RBAC/audit foundation, and subscriber/service master data must be extended rather than replaced. For each remaining task:

1. Start from the existing Drizzle schema, shared Zod contracts, Fastify authorization, narrow preload API, native React screens, seed process, and evidence format.
2. Use additive migrations and preserve existing seeded/demo rows. Do not rename or rebuild working Task 1-3 tables merely for preference.
3. Keep one authoritative financial mutation in an API service and one PostgreSQL transaction. Renderer calculations are previews only.
4. Add only the tables, packages, IPC methods, screens, and documentation required by the current task. Future-task placeholders do not count as completion.
5. Extend global search only when the owning entity exists: invoice number in Task 4; receipt number and GCash reference in Task 5.
6. Finish with focused domain/API/database tests, one retained Electron journey, repository-wide format/lint/typecheck/test/build, a concise task-evidence file, and checked plan items.
7. Stop after the task completion gate passes. Installer, full manuals, presentation material, and the complete dataset remain in Tasks 9-10.

## Task 4: Billing, Invoices, and Subscriber Ledger

**Status:** Completed on 2026-10-06.

**Uses and closes the existing baseline**

- [x] Reuse service-account `current_rate_centavos`; never calculate a historical invoice from the plan's latest price.
- [x] Add the handout-required subscriber billing/due defaults plus service-account `billing_start_date` and `due_day` through an additive migration. Keep the service-account values authoritative for billing, expose them in the existing forms/profile, and seed safe defaults for existing rows.

**Build**

- [x] Add only `billing_cycles`, `invoices`, `invoice_items`, `adjustments`, `ledger_entries`, and the smallest database-backed number counter needed for collision-free invoice numbers.
- [x] Make billing period identity explicit (`year` and `month` or equivalent), unique per cycle, and enforce a database unique constraint on service account plus billing period.
- [x] Generate invoices only for eligible active services whose billing start is on or before the period. Snapshot service, plan, description, unit amount, due date, and every fee/discount/penalty line in integer centavos.
- [x] Define DRAFT, UNPAID, PARTIALLY_PAID, PAID, OVERDUE, VOID, and CREDITED in the schema. Task 4 owns DRAFT/finalize/overdue/void-credit adjustment rules; Task 5 owns payment-driven transitions.
- [x] Finalize an invoice and its immutable ledger debit atomically. Posted invoice lines and ledger entries have no general update/delete API; corrections create linked adjustments or void entries with actor/reason audit.
- [x] Extend subscriber search by invoice number and build billing-cycle generation/review, invoice list/detail, subscriber billing/ledger tabs, and a printable date-range Statement of Account.

**Tests and evidence**

- [x] Unit-test centavo totals, line-sign rules, billing-start eligibility, due dates, allowed transitions, and deterministic chronological running balances.
- [x] Integration-test rollback, invoice-number uniqueness, immutable posted rows, repeated generation, and two concurrent generation requests.
- [x] Pass AT-11 with the database constraint still protecting the result if service checks are bypassed.
- [x] Demonstrate one cycle, a finalized invoice, its matching ledger debit, invoice-number search, and an SOA preview.

**Boundary:** Do not create payments, allocations, receipts, proof uploads, collection batches, aging dashboards, or report packs in this task.

**Completion gate:** Billing is idempotent under repeat/concurrent execution, finalized values are reproducible from snapshots, and each posted charge has exactly one matching ledger debit.

## Task 5: Payments, Allocation, Receipts, and GCash Verification

**Status:** Completed on 2026-10-06.

**Uses the existing baseline**

- [x] Treat Task 4 invoices and ledger entries as authoritative; do not introduce a second balance store or edit posted invoice debits.

**Build**

- [x] Add `payments`, `payment_allocations`, `payment_proofs`, `payment_reversals`, `receipts`, and the smallest database-backed receipt counter. Keep receipt and verified GCash references uniquely protected in PostgreSQL.
- [x] Implement Cash, GCash, Bank Transfer, Cheque, and Other methods with exact integer-centavo input validation.
- [x] In one transaction, post an approved payment, allocate oldest unpaid invoices first (or validate an authorized manual allocation), write ledger credits, update invoice states, reserve a never-reused receipt number, and retain any unallocated amount as subscriber credit.
- [x] Store GCash submissions as pending evidence first. Validate proof MIME type, extension, size, generated storage path, and checksum; only authorized approval posts the payment. Retain rejection/verification actor and timestamp.
- [x] Reverse rather than edit/delete a posted payment: require reason and permission, link the reversal, restore allocations/invoice states/credit, write inverse ledger entries, and preserve the original receipt/history.
- [x] Extend global search by receipt number and GCash reference. Build the cashier payment/allocation preview, history/receipt view, proof preview, and two-pane pending GCash queue.

**Tests and evidence**

- [x] Pass AT-01, AT-02, AT-03, and AT-04 with invoice balances, allocations, subscriber credit, ledger, and receipt all reconciling.
- [x] Pass AT-05 and AT-06, including direct-API authorization failures and database-backed duplicate protection.
- [x] Test transaction rollback, concurrent receipt/GCash submissions, over-allocation, invalid proof type/size/path, and proof files missing from storage.
- [x] Demonstrate Cash posting, partial/advance allocation, GCash approval/rejection, duplicate protection, printable receipt, search, and reversal history.

**Boundary:** Do not build collector batches, receivables dashboards, report packs, or payment-gateway/Facebook/GCash API automation.

**Completion gate:** Each accepted centavo is allocated or retained as credit, invoice and ledger balances reconcile, and correction is possible only through traceable reversal.

## Task 6: Collection Batches, Remittance, and Reconciliation

**Status:** Completed on 2026-10-06.

**Uses the existing baseline**

- [x] Reuse Task 3 areas/collectors/assignments and Task 5 payment posting. A collection record must link to one real payment rather than duplicate its financial effect.

**Build**

- [x] Add only `collection_batches`, `batch_accounts`, and `collector_remittances`, plus the minimal payment/batch link required for attribution.
- [x] Snapshot assigned subscriber/service, route address, current bill, arrears, and total due when generating a route sheet so later master-data edits do not rewrite the issued batch.
- [x] Enforce OPEN → IN_PROGRESS → SUBMITTED → REMITTED → RECONCILED → CLOSED transitions server-side; define the few allowed correction paths explicitly.
- [x] Calculate expected receivable, Cash collected, verified non-cash collected, uncollected value, remitted Cash, and shortage/overage from authoritative rows without manual balancing fields.
- [x] Require `collection.reconcile`, actor confirmation, and an explicit visible difference before reconciliation/closure. A shortage cannot be silently converted to zero.
- [x] Build route/batch list and detail, collection posting, remittance, reconciliation/exception, and navigation-free printable route-sheet screens.

**Tests and evidence**

- [x] Test transition rejection, batch/payment double-link prevention, snapshot stability, centavo totals, authorization, rollback, and concurrent posting.
- [x] Pass AT-07 and AT-08 with exact expected/remitted/difference evidence.
- [x] Demonstrate a full balanced batch and a separate visible shortage/overage case.

**Boundary:** Do not build aging, suspension, management dashboards, generalized routing optimization, or a collector mobile app.

**Completion gate:** Every batch total traces to its frozen assignment rows, linked payments, and remittance, and only an authorized reconciled batch can close.

## Task 7: Receivables, Aging, Suspension, and Reconnection

**Status:** Completed on 2026-10-06.

**Uses the existing baseline**

- [x] Derive receivables from posted invoice totals minus active allocations/credits as of a supplied date; do not maintain a manually editable AR balance table.

**Build**

- [x] Add `suspension_records`, `reconnection_records`, and only the delinquency settings required for grace period, suspension threshold, and optional reconnection fee.
- [x] Implement Current, 1-30, 31-60, 61-90, and 90+ buckets from invoice due date and an explicit `asOf` date, with documented inclusive boundaries.
- [x] Return current/overdue totals and overdue detail containing subscriber, service, area, collector, months unpaid, oldest unpaid invoice, last payment, and total arrears; support the handout filters.
- [x] Approve suspension/reconnection server-side, update the existing service account, append existing service history, retain actor/reason/dates/technician, and post any reconnection fee through Task 4's charge/ledger rules.
- [x] Build receivable summary/detail, aging, follow-up/suspension candidates, and subscriber service-control history screens.

**Tests and evidence**

- [x] Test every aging boundary, historical `asOf` behavior, aggregate/detail reconciliation, grace/threshold rules, authorization, and service transition rejection.
- [x] Seed at least 10 overdue accounts across several buckets and two complete suspension/reconnection scenarios without reducing the existing Task 3 dataset.
- [x] Demonstrate that AR detail sums to dashboard totals and to outstanding invoice balances for the same `asOf` date.

**Boundary:** Do not add predictive scoring, automated messaging, technician inventory, or report-export infrastructure.

**Completion gate:** AR is reproducible for any tested date, aggregates reconcile to detail, and every suspension/reconnection remains linked to service history and financial effects.

## Task 8: Dashboard, Reports, PDF/XLSX, and Printing

**Uses the existing baseline**

- [x] Build every KPI/report from the authoritative Task 4-7 queries and transactions; no hard-coded dashboard values or separate reporting totals.

**Build**

- [x] Implement the compact handout dashboard: current/overdue AR, overdue subscribers, billing versus collection, payment-method mix, collector performance, alerts, and recent payments.
- [x] Implement daily/weekly/monthly/annual collections; billing versus collection; revenue by plan/service/area; AR aging; subscriber master; ledger/SOA; collector assignment/remittance/performance; reversal/void; user activity; and audit reports.
- [x] Use one validated server-side filter/result model per report for the screen, print view, PDF, and XLSX. Interactive tables remain paginated; exports use the full authorized filtered result.
- [x] Add PDF/XLSX libraries only here and generate navigation-free print layouts with title, filters/date range, generated timestamp, rows, totals, and page-friendly formatting.
- [x] Enforce report permissions and field allowlists so exports cannot reveal hashes, tokens, proof paths, or unnecessary personal/security data.

**Tests and evidence**

- [x] Reconcile report fixtures against direct authoritative totals, including date/time-zone boundaries, empty results, and pagination-independent exports.
- [x] Programmatically open/inspect generated PDF and XLSX outputs, then visually review dashboard, print layouts, and representative PDFs.
- [x] Retain at least six report samples, including monthly collection, AR aging, subscriber SOA, and collector remittance/performance.

**Boundary:** Do not package the installer, add cloud analytics, or build optional forecasts/charts unrelated to named handout outputs.

**Completion gate:** Every displayed/exported total is reproducible from authoritative data, required files open correctly, and the retained report set satisfies the handout.

## Task 9: Backup, Restore, Deployment, and Three-PC Hardening

**Uses the existing baseline**

- [x] Preserve the API-only database/storage boundary. Desktop clients request privileged operations; they never execute PostgreSQL or filesystem backup commands directly.

**Build**

- [x] Add only `application_settings` and `backup_history` for operational settings and immutable backup attempts/results.
- [x] Implement Owner-only backup orchestration using `pg_dump`, the attachment tree, and a manifest containing application/schema version, file sizes, and SHA-256 checksums. Paths and subprocess arguments are generated/validated, never shell-concatenated from user input.
- [x] Implement guarded restore using checksum/version validation, explicit confirmation, a pre-restore safety backup, controlled client downtime, `pg_restore`, and post-restore database/attachment integrity checks.
- [x] Add storage/readiness checks, safe failure messages, backup-history visibility, and the smallest verified log-rotation policy required for operation.
- [x] Package the Electron client and document one API/PostgreSQL LAN host, scoped firewall access, per-client `BCIS_API_BASE_URL`, install/update steps, and recovery. Docker and cloud deployment remain out of scope.
- [x] Add missing evidence-driven indexes and verify server-side pagination at the handout target scale without changing financial semantics.

**Tests and evidence**

- [x] Pass AT-09 with two or three independent sessions/clients performing different valid operations; verify database constraints prevent duplicate numbers under contention.
- [x] Re-run AT-10 as Cashier against user/backup APIs, not only hidden UI controls.
- [x] Pass AT-12 by backing up, changing known database and attachment data, restoring, and verifying expected rows, counts, schema version, and checksums.
- [x] Retain installer output, deployment/checklist evidence, backup manifest, restore log, integrity result, and concurrency result.

**Boundary:** Do not add cloud storage, background queues, containers, multi-tenancy, or automatic unattended restore.

**Completion gate:** The packaged client connects through the documented LAN setup, three sessions operate safely, and a real backup has restored both database and attachments with verified integrity.

## Task 10: Final QA, Documentation, Dataset, and Defense Release

**Release rule:** This task closes evidence and defects; it does not add optional features or redesign completed modules. Any release-blocking fix receives the smallest regression test and updated evidence.

**Build and verify**

- [x] Complete and audit the cumulative synthetic dataset: at least 5 role-varied users, 7 required plans, 50 subscribers, 60+ services, 2 collectors, 3 areas, 3 billing months, mixed payment cases, 10+ overdue accounts, 1 reversal/void, and 2 suspension/reconnection cases.
- [x] Run AT-01 through AT-12 from clean documented fixtures and record inputs, expected result, actual result, PASS/FAIL, timestamp, and evidence path. No checklist-only claims.
- [x] Run format, lint, typecheck, all unit/integration/Electron E2E tests, production build, installer, clean-database migrate/seed, and startup from release artifacts.
- [x] Reconcile invoices, allocations, credits, ledger, AR, collection batches, remittances, and reports; review transactions, centavo handling, immutable history, idempotency, uniqueness, and audit coverage.
- [x] Review RBAC/direct API rejection, Electron isolation/IPC, upload/path validation, secrets, logs/errors, LAN exposure, and backup permissions.
- [x] Validate required screens at normal and minimum window sizes plus keyboard/focus, labels, status text, loading, empty, validation, server-error, permission-denied, and print states.
- [x] Record every discovered release defect with root cause, fix, and regression evidence; unresolved critical failures block completion.

**Required deliverables**

- [x] Complete source, one lockfile, safe environment example, ordered migrations, repeatable seeds, and meaningful Git history or an explicitly documented repository-history limitation.
- [x] Release-ready Windows installer plus verified API/PostgreSQL deployment, client configuration, update, and recovery instructions.
- [x] Concise technical documentation covering requirements traceability, architecture/modules, ERD/data dictionary, API/IPC, security, deployment, and tested backup/restore.
- [x] User manual covering login, subscriber/service setup, billing, payments, GCash, collections, receivables, reports, backup, and troubleshooting.
- [x] Test plan, automated outputs, AT-01 through AT-12 report, defect/fix log, required screenshots, and six or more verified PDF/XLSX samples.
- [x] Defense material answering the handout questions and rehearsing all 13 live-demo steps with synthetic data and no exposed credentials.

**Completion gate:** Every handout checklist item and critical-failure safeguard is evidenced, release artifacts run without source edits, all financial totals reconcile, backup/restore has actually passed, and the team can explain the implementation during defense.

## Acceptance-Test Ownership

| Acceptance test                     | Owning task   |
| ----------------------------------- | ------------- |
| AT-01 Exact payment                 | Task 5        |
| AT-02 Partial payment               | Task 5        |
| AT-03 Advance payment               | Task 5        |
| AT-04 Oldest-first arrears          | Task 5        |
| AT-05 Duplicate GCash reference     | Task 5        |
| AT-06 Payment reversal              | Task 5        |
| AT-07 Balanced collector remittance | Task 6        |
| AT-08 Collector shortage            | Task 6        |
| AT-09 Concurrent users              | Task 9        |
| AT-10 Authorization                 | Tasks 2 and 9 |
| AT-11 Duplicate billing             | Task 4        |
| AT-12 Backup/restore                | Task 9        |

## Final Release Gate

- [x] All ten task completion gates pass.
- [x] All twelve mandatory acceptance tests pass with retained evidence.
- [x] Financial totals reconcile across invoices, allocations, ledger, receivables, collections, and reports.
- [x] No renderer database access, plaintext passwords, embedded secrets, unrestricted IPC, unaudited financial mutation, or destructive posted-record deletion exists.
- [x] Database migrations work from a clean database and the seed process is repeatable.
- [x] Backup and restore have been executed successfully, not merely documented.
- [x] Three-client LAN use has been exercised without duplicate numbers or data corruption.
- [x] Required source, release, documentation, tests, report samples, UI evidence, and presentation artifacts are present.
