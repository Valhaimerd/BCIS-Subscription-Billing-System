# Task 4 Evidence

Task 4 implements monthly billing, frozen invoices, corrections, invoice search, and the subscriber ledger/Statement of Account without adding payment or collection workflows.

## Implemented

- Migration `0002_tough_madame_hydra.sql` adds billing/due defaults, billing start dates, billing cycles, invoices, invoice items, adjustments, ledger entries, and a PostgreSQL invoice-number sequence.
- PostgreSQL uniquely protects billing period identity, invoice numbers, one invoice per service/period, one invoice debit per invoice, and one ledger entry per adjustment.
- Generation uses only eligible active services and snapshots each service account's captured rate, plan, service number, billing period, due date, and line amount in integer centavos.
- Finalization posts invoice state and its matching ledger debit in one transaction. Posted history has no general update/delete API; adjustment and void routes require an actor and reason.
- The desktop provides monthly generation/review, invoice search, modal detail/print controls, subscriber Billing and Ledger tabs, and a printable SOA.

## Verified results

- `npm run db:migrate` and repeatable `npm run db:seed` — passed.
- `npm run verify:task4` — passed AT-11 against PostgreSQL: two concurrent generators and a repeated request produced 70 invoices for 70 eligible services; a direct duplicate was rejected by the database.
- The same live check proved transaction rollback, reconciled 70 finalized invoices to exactly 70 ledger debits and matching centavo totals, then verified invoice-number subscriber search and SOA visibility.
- Automated tests cover totals, billing-start eligibility, due dates, finalization states, deterministic running balances, validation, authorization, conflict responses, and the absence of invoice mutation routes.
- Electron journey — passed billing list, invoice detail, subscriber billing, SOA, and compact-width rendering with no renderer errors.
- Repository format, lint, typecheck, tests, and production build — passed.

## Visual evidence

- [Billing cycle and invoice register](../output/playwright/bcis-task-04-billing.png)
- [Frozen invoice detail](../output/playwright/bcis-task-04-invoice-detail.png)
- [Subscriber billing tab](../output/playwright/bcis-task-04-subscriber-billing.png)
- [Subscriber Statement of Account](../output/playwright/bcis-task-04-soa.png)
- [Compact desktop layout](../output/playwright/bcis-task-04-compact.png)
