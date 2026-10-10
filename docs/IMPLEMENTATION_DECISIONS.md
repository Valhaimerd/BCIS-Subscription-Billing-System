# BCIS Implementation Decisions

- **Desktop and server:** Electron clients call one Fastify LAN API; only the API connects to PostgreSQL and server-owned files.
- **Database:** PostgreSQL supplies concurrent transactions, row locks, sequences, constraints, indexes, and recoverable dumps for the three-PC scenario.
- **Money:** All amounts use integer centavos; floating-point currency is not used.
- **Financial history:** Posted invoices, payments, receipts, allocations, and ledger entries are retained. Corrections use reasoned adjustments, voids, or reversals.
- **Balances:** AR, credit, aging, collection differences, and reports are derived from authoritative transaction rows rather than editable balance tables.
- **Authorization:** The server resolves database-backed session/role permissions for every protected request. Desktop visibility is only a usability layer.
- **Desktop boundary:** Context isolation and sandboxing are enabled, Node integration is disabled, and the preload exposes fixed typed operations.
- **Operations:** Backups include a PostgreSQL dump, attachments, manifest, checksums, version/schema metadata, and a guarded tested restore path.
- **Scope:** No cloud services, containers, mobile/PWA client, unattended restore, or multi-tenancy were added because the laboratory does not require them.
- **History limitation:** The supplied BCIS folder is not a Git worktree, so repository history cannot be truthfully supplied after the fact.

The code, migrations, generated OpenAPI, and retained acceptance evidence are authoritative when a prose summary becomes outdated.
