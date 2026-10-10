# Defense and Live-Demo Guide

## Thirteen-step demo

1. Sign in as Administrator and explain dashboard indicators.
2. Open a synthetic subscriber with an Internet/Cable service.
3. Display a finalized monthly invoice and matching ledger debit.
4. Post exact/partial Cash and preview the receipt.
5. Submit/verify GCash, then show duplicate-reference rejection.
6. Show the subscriber ledger and Statement of Account.
7. Filter AR aging and open an overdue synthetic subscriber.
8. Open a collector batch, show payments, remit Cash, and reconcile the difference.
9. Reverse a payment and show the original, void receipt, reversal, restored balance, and audit record.
10. Preview and export a management report to PDF/XLSX.
11. Sign in as Cashier and demonstrate a server-rejected Owner operation.
12. Create a verified backup and explain the tested restore evidence.
13. Explain/show the three-session concurrency result in `evidence/task9/concurrency-result.json`.

## Defense answers

- **Why PostgreSQL instead of shared SQLite?** PostgreSQL provides a server process, transactions, row locking, sequences, constraints, and concurrent multi-client access; a shared SQLite file is not the intended three-PC architecture.
- **Where do billing/payment rules live?** In Fastify domain services. Every UI/client receives the same validation, authorization, transaction, and allocation behavior.
- **How are duplicates prevented?** PostgreSQL unique indexes protect service/cycle invoices, receipt numbers, and GCash references; sequences generate numbers and services translate conflicts safely.
- **How is partial payment represented?** One payment row plus one or more allocation rows. Invoice balance is charges/adjustments minus active allocations.
- **Why reverse instead of delete?** Reversal preserves the original receipt, actor, reason, allocations, audit history, and equal ledger correction.
- **How is ledger balance proved?** Task 5 and Task 10 compare payment amounts to ledger credits/debits and invoice allocations; reports and AR derive from the same rows.
- **What if the API crashes mid-post?** PostgreSQL rolls back the transaction, so payment, allocations, receipt, ledger, and audit changes either all commit or none do.
- **Server authorization versus hidden buttons?** Hidden controls are presentation. The API reloads session/role permissions and returns `403` to unauthorized direct calls.
- **How are backups validated/restored?** The API hashes dump/attachments, records a manifest, creates a safety backup, runs `pg_restore`, then verifies schema, row counts, settings, and attachment hashes.
- **What changes for a collector mobile/PWA?** Add a separately authenticated HTTPS client, scoped collector APIs, device/session policy, offline synchronization/conflict rules, and mobile proof capture; PostgreSQL and server business rules remain authoritative.

Use only synthetic data and never display `.env`, database URLs, passwords, session tokens, or real subscriber/GCash information.
