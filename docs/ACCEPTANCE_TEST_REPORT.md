# Mandatory Acceptance-Test Report

Clean-run evidence: `evidence/task10/clean-acceptance.log`. All amounts are integer centavos internally.

| ID    | Input and expected result                                | Actual result                                                                          | Timestamp (UTC)     | Result / evidence                                                       |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| AT-01 | Invoice ₱999; pay ₱999; expect ₱0, PAID, ledger, receipt | ₱999 allocated; invoice PAID; receipt and ledger credit present                        | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-02 | Invoice ₱999; pay ₱500; expect ₱499 and PARTIALLY_PAID   | ₱500 allocated; ₱499 retained; PARTIALLY_PAID                                          | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-03 | Monthly ₱1,000; pay ₱3,000; retain all value             | Open invoices paid oldest-first; remainder retained as credit                          | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-04 | August/September ₱999 each; pay ₱1,200                   | August ₱0; September ₱798; due-date order verified                                     | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-05 | Reuse verified GCash reference                           | Concurrent and sequential duplicates returned conflict; one winner retained            | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-06 | Reverse posted payment                                   | Original REVERSED; receipt voided; linked reversal, equal debit, reason/audit retained | 2026-10-07 01:04:09 | PASS — Task 5 log                                                       |
| AT-07 | Collect/remit ₱20,000                                    | Difference ₱0; batch reconciled and closed                                             | 2026-10-07 01:04:11 | PASS — Task 6 log                                                       |
| AT-08 | Collect ₱20,000; remit ₱19,500                           | ₱500 shortage displayed and retained; not silently balanced                            | 2026-10-07 01:04:11 | PASS — Task 6 log                                                       |
| AT-09 | Three independent sessions and concurrent reads/writes   | Three sessions completed separate operations; 73 unique invoices for 73 services       | 2026-10-07 01:04:17 | PASS — `evidence/task9/concurrency-result.json`                         |
| AT-10 | Cashier calls admin user and backup APIs                 | Server returned `403` for both direct API attempts                                     | 2026-10-07          | PASS — route tests and `docs/TASK_09_EVIDENCE.md`                       |
| AT-11 | Generate one period concurrently and repeat              | 72 invoices for 72 eligible services; no duplicate service/cycle pair                  | 2026-10-07 01:04:07 | PASS — Task 4 log                                                       |
| AT-12 | Backup, mutate DB/file, restore                          | Test mutation removed; setting/file checksum/schema/row counts restored                | 2026-10-07 01:04:17 | PASS — `evidence/task9/restore-result.json` and `integrity-result.json` |

The final dataset/reconciliation audit reports zero payment-ledger mismatches, overallocations, reversal mismatches, duplicate invoices, duplicate receipts, and duplicate GCash references in `evidence/task10/dataset-and-reconciliation.json`.
