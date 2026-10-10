# BCIS LAN Deployment and Recovery

BCIS uses one Windows API/PostgreSQL host and up to three installed Electron clients. Only the API host reads PostgreSQL, attachments, backups, and server logs.

## API and database host

1. Install Node.js 24+, PostgreSQL 18, and the repository dependencies on the designated host.
2. Copy `.env.example` to the Git-ignored `.env`. Set the dedicated PostgreSQL account, `API_HOST=0.0.0.0`, storage directories on a fixed local disk, and the installed PostgreSQL `bin` directory.
3. Run `npm run db:migrate`, `npm run db:seed`, `npm run build`, and `npm start --workspace @bcis/api` from the repository root.
4. In Windows Defender Firewall, allow inbound TCP port `3100` only from the office LAN subnet. Do not expose PostgreSQL port `5432` to client PCs.
5. From each client, confirm the host's `/api/v1/health/ready` endpoint responds before installing the desktop client.

The API writes structured logs to `storage/logs/api.log`. At startup, a log at or above `LOG_MAX_BYTES` rotates to numbered generations and keeps `LOG_RETAINED_FILES` files.

## Desktop clients

Install `release/BCIS Billing and Collection Setup 0.1.0.exe` on each office PC. Set the user's `BCIS_API_BASE_URL` environment variable to `http://<API-host-LAN-address>:3100/api/v1`, then start the client. The packaged application also reads an optional `.env` beside its executable. Never place database credentials on a client.

For an update, create and verify a backup first, stop active desktop work, apply server migrations/builds, replace the client with the new installer, retain `BCIS_API_BASE_URL`, and verify login plus operational readiness before resuming work.

## Backup and restore

An Owner opens **Backup & recovery** and selects **Create verified backup**. The API alone runs `pg_dump`, copies the attachment tree, writes a versioned manifest, hashes every retained file, and records the immutable result.

Restore requires `backup.restore` and typing the displayed `RESTORE <backup-name>` confirmation. The server validates the manifest, checks application/schema compatibility and hashes, creates a pre-restore safety backup, rejects other application requests during recovery, runs `pg_restore`, swaps in the backed-up attachment tree, and verifies schema version, row counts, and attachment hashes. Keep the API host powered and do not terminate it during this operation.

If restore fails, leave the retained source and safety backup directories unchanged, read the server log, correct the reported storage/tool problem, and retry from the Owner workflow. Do not manually copy a database dump into PostgreSQL or delete financial rows.

## Three-PC checklist

- One host owns PostgreSQL, `storage/attachments`, `storage/backups`, and `storage/logs`.
- All three PCs use the same LAN API URL and never use a PostgreSQL connection string.
- Client clocks and the host clock are synchronized.
- Owner, Cashier, and operational roles sign in with separate accounts during actual use.
- A backup and restore test is completed after deployment and after any storage-location change.
- The API port is reachable only from the intended LAN subnet; PostgreSQL remains host-local.
