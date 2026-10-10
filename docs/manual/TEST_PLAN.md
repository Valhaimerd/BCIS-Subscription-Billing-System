# Test Plan

## Environments

- Windows development/release host with Node.js 24+, npm 11+, and local PostgreSQL 18.
- Git-ignored `.env` with the dedicated BCIS database account and PostgreSQL tools directory.
- Electron checks at normal desktop size and the 960 px minimum width.

## Test layers

1. Formatting, lint, and TypeScript checks reject source-quality regressions.
2. Vitest covers domain calculations, validation, routes, authorization, IPC security, and renderer states.
3. Task 3–10 live verifiers exercise PostgreSQL constraints, transactions, reports, concurrency, and backup/restore.
4. Electron journeys exercise login and every major workflow, including compact layouts and print views.
5. Package verification starts the installed-form application bundle.
6. The clean acceptance harness backs up the local lab database, rebuilds its schema from ordered migrations, seeds twice, runs AT verifiers, and restores the original state.

## Commands

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:task10:clean
npm run dist --workspace @bcis/desktop
node tests/task9-packaged.mjs
```

With the API running, execute `node tests/task3-electron.mjs` through `node tests/task9-electron.mjs`. A failed command, financial mismatch, unsuccessful restore, authorization bypass, renderer error, horizontal overflow, or missing release artifact blocks release.

After loading the laboratory seed, run `npm run verify:seeded-ui` with the API running. This read-only check confirms that payment history is populated and that invoice, receipt, collection-batch, and receivables details open as modal dialogs.

Retained results are in `evidence/task10`, `output/playwright`, `reports-samples`, `release`, and `docs/ACCEPTANCE_TEST_REPORT.md`.
