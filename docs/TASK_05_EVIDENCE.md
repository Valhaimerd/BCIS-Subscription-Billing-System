# Task 5 Evidence

Task 5 implements payments, oldest-first allocation, receipts, GCash proof review, subscriber credit, and traceable reversal without adding collector batches or reporting infrastructure.

## Implemented

- Migration `0003_minor_ironclad.sql` adds payments, allocations, proofs, receipts, reversals, payment ledger links, method/status enums, and a PostgreSQL receipt-number sequence.
- Cash, GCash, Bank Transfer, Cheque, and Other use positive safe integer centavos. Each accepted amount is allocated or remains visible as subscriber credit.
- Payment posting, allocation, receipt reservation, invoice-state changes, ledger credit, and audit are transactional.
- GCash stays pending until an authorized approval. MIME/extension, 5 MB size, generated storage path, and SHA-256 proof integrity are enforced; duplicate references are database-protected.
- Reversal retains the payment/allocations/receipt, voids the receipt, appends an inverse ledger debit, restores invoice states, and records actor/reason audit.
- The desktop provides the cashier search/form, allocation preview, modal history/receipt print view, reversal control, and two-pane GCash proof queue.

## Verified results

- `npm run db:migrate` — passed.
- `npm run verify:task5` — passed AT-01 through AT-06 against PostgreSQL, including exact ₱999, partial ₱500, advance ₱3,000, August/September oldest-first ₱1,200, duplicate GCash, and full reversal reconciliation.
- The live check also passed concurrent receipt creation, concurrent same-reference GCash submission, safe missing-proof handling, receipt/reference subscriber search, unique numbers, proof approval/rejection, and payment/reversal ledger equality.
- Automated tests cover exact/partial/advance/oldest-first rules, validation, direct-API authorization, duplicate conflicts, and published route shape.
- Electron journey — passed Cash preview/posting, receipt history/detail, GCash upload/review/approval, and 960px rendering with no renderer errors.
- Repository format, lint, typecheck, tests, and production build — passed.

## Visual evidence

- [Cash allocation preview](../output/playwright/bcis-task-05-payment-preview.png)
- [Payment and reversal history](../output/playwright/bcis-task-05-history.png)
- [Printable receipt detail](../output/playwright/bcis-task-05-receipt.png)
- [GCash proof review](../output/playwright/bcis-task-05-gcash-review.png)
- [Compact payment history](../output/playwright/bcis-task-05-compact.png)
