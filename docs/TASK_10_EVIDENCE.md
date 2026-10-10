# Task 10 Evidence

Task 10 closes the laboratory release without adding optional product scope. It completes the demonstration dataset, clean acceptance run, release checks, technical/user/defense documentation, and retained evidence.

## Dataset and financial audit

The clean run contains 6 users across 6 roles, 7 required plans (3 Internet, 2 Cable, 2 Combo), 63 subscribers, 73 services, 2 collectors, 3 areas, 8 finalized billing months, Cash and GCash payments, all four required payment cases, 11 overdue accounts, 2 reversals, 3 suspensions, and 3 completed reconnections.

`evidence/task10/dataset-and-reconciliation.json` passes all 18 dataset requirements and reports zero posted-payment ledger mismatches, payment overallocations, reversal ledger mismatches, duplicate service/cycle invoices, duplicate receipts, and duplicate GCash references.

## Acceptance and database setup

- `npm run verify:task10:clean` passed 11 commands after rebuilding schemas from all 8 ordered migrations, seeding twice, and running the Task 3–10 live verifiers.
- The least-privilege application role cannot create databases, so the guarded fallback made `task10-safety-20261007010359795.dump`, reset only the validated local non-production `bcis` database, and restored the original state in `finally`.
- `evidence/task10/clean-acceptance.json` records `passed: true` and `originalStateRestored: true`; the complete command output is retained in `clean-acceptance.log`.
- [Acceptance-test report](ACCEPTANCE_TEST_REPORT.md) records inputs, expected/actual results, timestamps, status, and evidence for AT-01 through AT-12.

## Automated and UI verification

- 99 tests passed: 2 database, 89 API/domain/route, and 8 desktop tests; the contracts workspace intentionally has no test files.
- Format, ESLint, TypeScript, production builds, NSIS packaging, and packaged-client startup pass in the final quality gate.
- Task 3–9 Electron journeys pass without renderer errors. They cover authenticated/locked/signed-out states; master data; billing/invoice/SOA; Cash/GCash/receipt; collections/remittance; aging/service control; dashboard/reports/print; backup/restore confirmation; and 960 px compact layouts.
- Validation, empty, server-error, permission-denied, loading, keyboard/focus, labels/status, and print behavior are covered by the Vitest renderer/route tests and retained Electron journeys.
- Screenshots are retained under `output/playwright`. Eight structurally verified PDF/XLSX report files are retained under `reports-samples`.

## Security and release review

The renderer has no PostgreSQL client or `DATABASE_URL`, Electron enables context isolation/sandboxing and disables Node integration, IPC channels are fixed, and no normal application path deletes posted payments, receipts, invoices, allocations, or ledger entries. Passwords use Argon2id, sessions store token hashes, API permissions protect direct calls, proof paths/checksums are validated, logs/errors are sanitized, and backup/restore is Owner-only.

The rebuilt installer is `release/BCIS Billing and Collection Setup 0.1.0.exe`. The package has one root `package-lock.json`, a safe `.env.example`, ordered migrations, repeatable seed, deployment/recovery instructions, report samples, and final documentation. The folder is not a Git worktree; that history limitation is explicitly recorded in `TECHNICAL_DOCUMENTATION.md` rather than inventing history.

## Release documents

- [Technical documentation](TECHNICAL_DOCUMENTATION.md), [ERD](ERD.md), [data dictionary](DATA_MODEL.md), [API](API.md), and [authorization rules](AUTHORIZATION_RULES.md)
- [User manual](manual/USER_MANUAL.md) and [deployment/recovery guide](manual/DEPLOYMENT.md)
- [Test plan](manual/TEST_PLAN.md), [acceptance report](ACCEPTANCE_TEST_REPORT.md), and [defect log](DEFECT_LOG.md)
- [Defense and 13-step live-demo guide](manual/DEFENSE_GUIDE.md)

The known non-critical dependency limitation remains two moderate `npm audit --omit=dev` findings inherited through ExcelJS's pinned `uuid@8.3.2`; npm proposes only a forced breaking downgrade. No critical or high finding is reported.
