# BCIS Technical Documentation

## Scope and modules

BCIS is a Windows Electron client backed by a Fastify LAN API and PostgreSQL. The modules are authentication/RBAC, plans and subscriber master data, billing/ledger, payments/receipts/GCash, field collections, receivables/service control, reports/dashboard, and backup/recovery.

The renderer owns presentation only. The typed preload and Electron main process own the narrow IPC/HTTP bridge. Fastify routes validate requests and permissions; domain services own transactions and financial rules; Drizzle schema and migrations own persistence constraints.

## Authoritative references

- Requirements mapping: [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md)
- Architecture and trust boundaries: [ARCHITECTURE.md](ARCHITECTURE.md) and [ARCHITECTURE_SECURITY.md](ARCHITECTURE_SECURITY.md)
- ERD and data dictionary: [ERD.md](ERD.md) and [DATA_MODEL.md](DATA_MODEL.md)
- HTTP and IPC contracts: [API.md](API.md) and the typed interfaces in `apps/desktop/src/shared/desktop-api.ts`
- Roles and permissions: [AUTHORIZATION_RULES.md](AUTHORIZATION_RULES.md)
- Deployment, updates, backup, and recovery: [DEPLOYMENT.md](manual/DEPLOYMENT.md)
- Verification and known limitations: [TEST_PLAN.md](manual/TEST_PLAN.md), [ACCEPTANCE_TEST_REPORT.md](ACCEPTANCE_TEST_REPORT.md), and [DEFECT_LOG.md](DEFECT_LOG.md)

## Financial rules

Invoices snapshot the account number, plan name, price, period, and due date. A service/cycle unique index prevents duplicate billing. Payments allocate oldest due invoice first; any unallocated amount remains reproducible as subscriber credit. A posted payment creates one unique receipt and one whole-payment ledger credit. Reversal retains the payment and allocations, voids the receipt, adds a linked equal ledger debit, refreshes affected invoice statuses, and appends an audit event.

Collection route sheets freeze what the collector received. Posted payments are attributed to route accounts. Expected Cash, actual remittance, and the difference are derived; a shortage cannot close as balanced. Receivables and aging are derived for an explicit `asOf` date from finalized invoices, adjustments, allocations, payment state, and credit.

## Transaction and failure behavior

Each financial mutation runs in a PostgreSQL transaction. If numbering, allocation, ledger, receipt, or audit work fails, the transaction rolls back. PostgreSQL sequences and unique indexes are the final concurrency guard. API errors expose stable status/messages rather than stack traces or raw database errors.

## Repository limitation

This supplied BCIS folder is not a Git worktree, so meaningful commit history cannot be manufactured or claimed. The release retains ordered migrations, one lockfile, task evidence, generated artifacts, and this explicit history limitation. Future development should initialize Git before further changes and commit feature-sized checkpoints.
