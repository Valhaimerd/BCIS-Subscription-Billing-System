# Task 9 Evidence

Task 9 implements Owner-only database/attachment backup and guarded recovery, operational readiness and log rotation, LAN deployment guidance, an installable Electron client, and three-session concurrency evidence. It does not add cloud storage, containers, background queues, or unattended restore.

## Implemented

- Migration `0007_first_wrecker.sql` adds only `application_settings`, immutable `backup_history`, and the evidence-driven payment status/date index.
- The API runs `pg_dump` and `pg_restore` with argument arrays and a password environment variable; desktop clients receive no filesystem, process, database, or credential access.
- Every successful backup includes a custom PostgreSQL dump, attachment snapshot, application/schema versions, row counts, byte sizes, and SHA-256 checksums.
- Restore requires an exact backup-specific confirmation, checksum/version validation, a safety backup, API maintenance mode, PostgreSQL restore, attachment replacement, and post-restore integrity checks.
- Startup logging rotates a bounded set of structured server files. Operational readiness checks the database, storage, and both PostgreSQL tools.
- The Owner desktop screen exposes readiness, retention, immutable history, backup creation, and guarded restore. Cashier access is absent from navigation and rejected by the API.

## Verified results

- `npm run verify:task9` passed real readiness, three independent sessions, three concurrent billing requests without duplicate service invoices, a verified backup, post-backup database and attachment mutations, guarded restore, and post-restore schema/count/hash checks.
- [Backup manifest](../evidence/task9/backup-manifest.json), [concurrency result](../evidence/task9/concurrency-result.json), [restore result](../evidence/task9/restore-result.json), and [integrity result](../evidence/task9/integrity-result.json) retain the machine-readable AT-09 and AT-12 evidence.
- Route tests call the backup endpoint as Cashier and receive `403`, satisfying the backup half of AT-10 at the server boundary; the existing user-administration authorization test covers the user API half.
- The Electron journey created a verified backup, loaded readiness/history, and proved restore remains disabled without typed confirmation at 1440x900 and the 960px minimum width.
- The NSIS installer and unpacked executable were built, hashed, launched without source arguments, and authenticated through the configured API. Details are retained in [installer-result.json](../evidence/task9/installer-result.json).
- The final gate passes formatting, lint, type checking, 99 automated tests, production builds, migration/seed, no-pending-schema-change generation, live Task 9 verification, the Electron journey, and packaged-client startup.

## Visual evidence

- [Owner backup workspace](../output/playwright/bcis-task-09-backup.png)
- [Guarded restore confirmation](../output/playwright/bcis-task-09-restore-confirmation.png)
