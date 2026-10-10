# BCIS Project Overview

## What this project is

The **BCIS Subscription Billing and Collection System** is a Windows desktop application for Bukidnon Cable and Internet Services. It manages recurring Internet and cable subscriptions from subscriber registration through billing, payment, field collection, receivables monitoring, reporting, and backup.

The project is version `0.1.0` and was built as a complete laboratory system using fictional but realistic subscriber and financial data. It is designed for one office server and up to three desktop clients on the same local network.

## What the system is for

The system replaces disconnected spreadsheets or manual records with one authoritative subscriber and financial database. It helps BCIS staff:

- Maintain subscribers, service accounts, plans, collection areas, and collectors.
- Generate monthly invoices without billing the same service twice.
- Record exact, partial, advance, Cash, and GCash payments.
- Allocate payments to the oldest unpaid invoices and preserve subscriber credit.
- Issue unique receipts and correct mistakes through traceable reversal instead of deletion.
- Prepare collector route sheets, record field collections, and expose shortages or overages.
- Monitor accounts receivable and aging as of a selected date.
- Track suspension and reconnection activity.
- Produce management reports in PDF and XLSX formats.
- Protect operations with user roles, audit history, and verified backup/restore.

## Intended users

| Role                  | Main responsibility                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| Owner                 | Full system administration, settings, backup, and recovery              |
| Administrator         | Subscriber, billing, operational, user, and report administration       |
| Cashier               | Subscriber lookup, Cash/GCash payments, and receipt processing          |
| Collection Supervisor | Collection batches, reconciliation, reversals, receivables, and reports |
| Accounting / Auditor  | Read-only financial review, reports, exports, and audit history         |
| Technician            | Subscriber lookup and service-status work                               |
| Read-only Viewer      | Non-mutating operational and financial views                            |

The API checks permissions independently of the desktop interface. A hidden button does not replace server authorization.

## How the system is arranged

```text
Windows Electron clients
        |
        | authenticated HTTP over the office LAN
        v
Fastify API server
        |-- PostgreSQL database
        |-- GCash proof attachments
        |-- verified backups
        `-- rotated application logs
```

Only the API server connects to PostgreSQL or accesses server storage. The Electron renderer communicates through a fixed typed preload interface; it never receives database credentials or direct filesystem access.

## Technology stack

| Area              | Technology                                                   | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Language          | TypeScript 6 on Node.js 24                                   | Shared typed application development                                      |
| Desktop shell     | Electron 44 and electron-vite 5                              | Windows desktop packaging and isolated renderer/main processes            |
| User interface    | React 19, Vite 7, Tailwind CSS 4, Lucide                     | Forms, tables, navigation, responsive layouts, and icons                  |
| Client data/forms | TanStack Query 5, TanStack Table 9, React Hook Form 7, Zod 4 | Server-state caching, data tables, forms, and validation                  |
| API               | Fastify 5                                                    | Versioned REST endpoints, validation, authentication, and authorization   |
| Database access   | Drizzle ORM 0.45 and `pg` 8                                  | Typed PostgreSQL queries, transactions, schema, and migrations            |
| Database          | PostgreSQL 18                                                | Concurrent relational storage, constraints, indexes, locks, and sequences |
| Authentication    | Argon2 and SHA-256 token hashes                              | Password hashing and protected session storage                            |
| Reports           | pdfmake 0.3 and ExcelJS 4                                    | PDF and XLSX generation                                                   |
| Logging           | Pino 10                                                      | Structured server logs with rotation                                      |
| Testing           | Vitest 5, Testing Library, Playwright 1.63                   | Domain, API, desktop component, Electron, and packaged-client checks      |
| Build/release     | esbuild and electron-builder                                 | API bundles and the Windows NSIS installer                                |
| Code quality      | ESLint 10 and Prettier 3                                     | Static checks and consistent formatting                                   |

## Major features

### Authentication and security

- Login, logout, session locking, expiry, revocation, and failed-login lockout.
- Argon2id password hashes and opaque session tokens whose SHA-256 hashes are stored.
- Role-based server permissions and append-only operational audit records.
- Electron context isolation and sandboxing with Node integration disabled.

### Subscriber and service management

- Internet, Cable, and Combo service plans.
- Subscriber profiles with addresses, contacts, area, and assigned collector.
- Multiple service accounts per subscriber with frozen account rates.
- Subscriber and service lifecycle history instead of destructive deletion.

### Billing and ledger

- Monthly draft generation and finalization.
- Unique invoice numbers and one invoice per service/billing cycle.
- Frozen invoice descriptions, rates, dates, and line items.
- Reasoned adjustments, invoice voiding, subscriber ledger, and Statement of Account.

### Payments and GCash

- Cash, GCash, bank transfer, cheque, and other payment methods.
- Oldest-first allocation, partial payments, exact payments, and advance credit.
- Unique receipt numbering and printable receipt view.
- GCash proof upload, checksum validation, approval/rejection, and duplicate-reference blocking.
- Payment reversal that preserves the original payment, void receipt, reason, actor, and ledger correction.

### Collections and receivables

- Collector/area/date batches with frozen route accounts and printable route sheets.
- Payment attribution, Cash remittance, reconciliation, shortage/overage display, and controlled closing.
- Derived AR totals and Current, 1–30, 31–60, 61–90, and 90+ aging buckets.
- Audited suspension and reconnection workflows with optional reconnection fees.

### Dashboard, reports, and operations

- Dashboard indicators for billing, collection, AR, overdue accounts, GCash, and collector activity.
- Collections, billing-versus-collection, revenue, AR aging, subscriber, SOA, collector, correction, user-activity, and audit reports.
- Paginated previews plus complete PDF/XLSX exports.
- Owner-only settings, readiness information, verified backup history, and guarded restore.
- Server-owned attachment, backup, and rotated-log directories.

## Typical business workflow

```text
Configure plans, collectors, and areas
                 |
Register subscriber and service account
                 |
Generate and finalize monthly invoices
                 |
Post Cash/GCash payment and issue receipt
                 |
Update ledger, credit, and invoice balances
                 |
Reconcile field collection batches
                 |
Monitor receivables and service status
                 |
Export reports and create verified backup
```

## Financial and data-integrity rules

- Money is stored as integer centavos, not floating-point values.
- PostgreSQL transactions make financial postings all-or-nothing.
- Database sequences and unique indexes protect invoice and receipt numbering under concurrent use.
- Database uniqueness prevents duplicate service/cycle invoices and duplicate GCash references.
- Posted financial history is corrected with adjustments, voids, or reversals and is not destructively deleted.
- Invoice balances, subscriber credit, AR, aging, remittance differences, and reports are derived from authoritative source rows.
- Unexpected API errors do not expose stack traces, credentials, or raw database errors.

## Main project folders

| Path                  | Contents                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| `apps/api`            | Fastify server, business services, routes, seed, and live verification scripts |
| `apps/desktop`        | Electron main/preload processes and React renderer                             |
| `packages/contracts`  | Shared API and desktop TypeScript contracts                                    |
| `packages/database`   | Drizzle connection, schema, and migration runner                               |
| `database/migrations` | Ordered PostgreSQL schema migrations                                           |
| `docs`                | Technical documentation, evidence, laboratory handout, and plans               |
| `docs/manual`         | Project overview, setup/use, deployment, testing, and defense guides           |
| `tests`               | Electron and packaged-application journeys                                     |
| `reports-samples`     | Verified PDF and XLSX report samples                                           |
| `release`             | Windows installer and unpacked release output                                  |
| `storage`             | Server attachments, backups, and logs                                          |
| `evidence`            | Machine-readable acceptance and release evidence                               |

## Current project scope

This release supports the laboratory's local Windows/LAN scenario. It does not claim cloud hosting, public internet exposure, multi-tenancy, unattended restore, offline collector synchronization, or a mobile/PWA client. A real business deployment would additionally require organization-managed credentials, TLS, off-site backups, monitoring, signed releases, and an approved retention/privacy policy.

## Where to continue

- To set up and start the project, read [Local laboratory instructions](LAB_INSTRUCTIONS.md).
- To perform business workflows, read the [User manual](USER_MANUAL.md).
- To install it across office computers, read [Deployment and recovery](DEPLOYMENT.md).
- To verify the release, read the [Test plan](TEST_PLAN.md).
- To prepare the presentation, read the [Defense guide](DEFENSE_GUIDE.md).
- For the detailed schema and API, see [Technical documentation](../TECHNICAL_DOCUMENTATION.md).
