# Task 7 Evidence

Task 7 implements derived accounts receivable, dated aging, delinquency policy, and audited suspension/reconnection without adding a separate balance table or Task 8 report exports.

## Implemented

- Migration `0006_third_mantis.sql` adds the singleton delinquency policy, suspension records, reconnection records, constraints, and the one-open-reconnection guard.
- Receivables are reconstructed for an explicit `asOf` date from finalized non-void invoices, dated adjustments, active allocations, and subscriber credit applied oldest first.
- Current, 1-30, 31-60, 61-90, and 90+ values are calculated per invoice. Summary and detail expose subscriber, service, area, collector, months unpaid, oldest invoice, last payment, arrears, follow-up, and suspension candidacy.
- Server-authoritative suspension/reconnection checks update the service, append service events, retain actors/reasons/dates/technician, and post the optional fee through the existing adjustment and ledger path.
- The desktop provides dated KPIs, clickable aging bands, handout filters, pagination, policy settings, and modal candidate actions/service-control history.

## Verified results

- `npm run verify:task7` passes aggregate/detail/invoice reconciliation, ten overdue seeds across four overdue buckets, historical-date behavior, rejected invalid suspension, and a complete suspend/pay/request/complete flow with a ledger-backed fee.
- Domain and route tests pass all inclusive aging boundaries, oldest-first credit, grace/threshold rules, authorization, validation, and published routes.
- The seed command is repeatable and retains 12 Task 7 accounts, including 10 overdue accounts and two completed suspension/reconnection scenarios.
- The Electron journey passes dashboard aging, 90+ candidate drill-down, service history, 960px rendering, and renderer-error capture.
- Repository format, lint, typecheck, tests, production build, migration, seed, and live PostgreSQL verification pass.

## Visual evidence

- [Aging dashboard](../output/playwright/bcis-task-07-aging.png)
- [Suspension candidate](../output/playwright/bcis-task-07-candidate.png)
- [Compact service history](../output/playwright/bcis-task-07-service-history.png)
