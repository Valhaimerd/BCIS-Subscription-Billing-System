# BCIS Architecture and Security

```text
Electron renderer -> typed preload IPC -> Electron main -> Fastify /api/v1 -> PostgreSQL
                                                        |-> attachments
                                                        |-> backups
                                                        `-> rotated logs
```

The API owns business rules, authorization, transactions, numbering, file validation, and all PostgreSQL access. Desktop clients never receive database credentials. The Electron renderer uses context isolation and sandboxing with Node integration disabled; its preload exposes only fixed BCIS operations.

## Security controls

- Argon2id password hashes; raw passwords and hashes are never returned.
- Random opaque session tokens; only SHA-256 token hashes are stored.
- Server-side permission checks on every protected route, including backup and user operations.
- Integer centavos, database checks, foreign keys, unique indexes, and transactions protect financial integrity.
- Posted payments are reversed with linked ledger/audit rows; they are not deleted.
- Invoice numbers, receipt numbers, service/cycle invoices, and GCash references have database-backed uniqueness.
- Proof uploads validate type, size, generated path, and checksum; callers cannot choose server paths.
- Unexpected errors use safe response messages. Logs exclude passwords, tokens, and database URLs and rotate by configured size/count.
- `.env` is ignored. `.env.example` contains placeholders only. The development seed refuses production mode.
- Backup and restore require Owner permissions, typed confirmation, verified manifests, checksums, a safety backup, and post-restore integrity checks.

## Deployment boundary

Expose the API port only to the intended office LAN. Keep PostgreSQL host-local and never place `DATABASE_URL` on desktop PCs. TLS termination, centralized secret storage, off-site backup replication, and managed monitoring are production deployment responsibilities, not claims of this laboratory release.
