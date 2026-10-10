# Task 6 Evidence

Task 6 implements house-to-house collection batches, frozen route sheets, payment attribution, Cash remittance, and explicit shortage/overage reconciliation without adding receivables or reporting modules.

## Implemented

- Migration `0004_collection_batches.sql` adds collection batches, route-account snapshots, remittances, the state enum, and payment attribution. Migration `0005_futuristic_captain_flint.sql` narrows uniqueness to active pending/posted route payments so rejected or reversed attempts can be corrected without losing history.
- Route generation uses the existing collector/area assignments and snapshots account, address, current bill, arrears, and total due.
- The API enforces `OPEN → IN_PROGRESS → SUBMITTED → REMITTED → RECONCILED → CLOSED` and rejects skipped or repeated transitions.
- Collections reuse Task 5 payment posting, including attributed GCash proof submission and approval. Posted Cash and verified non-cash totals, per-account capped uncollected value, remitted Cash, and shortage/overage are derived from authoritative records.
- Batch and linked-payment writes lock in a consistent order. Submission cannot race a late payment, concurrent GCash decisions cannot both succeed, and submitted/closed batch payments cannot be reversed.
- Reconciliation and closure require `collection.reconcile`, actor confirmation, and the exact currently visible difference.
- The desktop provides generation, a paginated list with modal batch details, Cash/non-cash posting, attributed GCash proof submission, remittance, reconciliation/closure, and navigation-free route-sheet printing.

## Verified results

- `npm run db:migrate` — passed.
- `npm run verify:task6` — passed frozen snapshot, transition rejection, rollback, closed-batch protection, corrected replacement, concurrent double-link/GCash-decision protection, AT-07 balanced ₱20,000/₱20,000, and AT-08 ₱20,000 collected/₱19,500 remitted with a retained ₱500 shortage.
- API and domain tests cover state order, centavo totals, per-account overpayment coverage, validation, authorization, confirmation, and published routes.
- Electron journey — passed generation, start, Cash collection, attributed GCash submission and approval, submit, remittance, reconciliation, closure, pagination, printable route sheet, shortage display, and 960px rendering without renderer errors.
- Repository format, lint, typecheck, tests, production build, and live PostgreSQL verification passed.

## Visual evidence

- [Balanced closed batch](../output/playwright/bcis-task-06-balanced-batch.png)
- [Visible shortage](../output/playwright/bcis-task-06-shortage.png)
- [Printable route sheet](../output/playwright/bcis-task-06-print-route.png)
- [Compact collection workspace](../output/playwright/bcis-task-06-compact.png)
