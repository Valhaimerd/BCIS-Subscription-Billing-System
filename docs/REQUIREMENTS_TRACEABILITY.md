# Requirements Traceability

| Laboratory capability                            | Implementation                                 | Verification evidence                  |
| ------------------------------------------------ | ---------------------------------------------- | -------------------------------------- |
| LAN client/server and PostgreSQL                 | Electron -> Fastify -> PostgreSQL              | `ARCHITECTURE.md`, Task 1, Task 9      |
| Authentication, RBAC, audit                      | Auth service, permission middleware, audit log | Task 2, AT-10                          |
| Plans, subscribers, services, collectors, areas  | Master-data service/routes/views               | Task 3, Task 3 Electron flow           |
| Monthly billing, invoices, ledger, SOA           | Billing service/routes/views                   | Task 4, AT-11                          |
| Cash/GCash, allocation, receipts, reversal       | Payment service/routes/views                   | Task 5, AT-01–AT-06                    |
| Collector batches and remittance                 | Collection service/routes/views                | Task 6, AT-07–AT-08                    |
| AR aging, suspension, reconnection               | Receivable service/routes/views                | Task 7 live and Electron checks        |
| Dashboard and PDF/XLSX reports                   | Report service/routes/views                    | Task 8 verifier and retained samples   |
| Three clients, installer, backup/restore         | Operations service/view and NSIS release       | Task 9, AT-09/AT-12                    |
| Dataset, clean setup, final QA, manuals, defense | Repeatable seed, Task 10 harness/docs          | Task 10 evidence and final quality log |

Each task-specific evidence file in `docs/TASK_01_EVIDENCE.md` through `docs/TASK_10_EVIDENCE.md` records the implementation boundary and retained artifacts. Generated OpenAPI at `/docs` is the endpoint source of truth.
