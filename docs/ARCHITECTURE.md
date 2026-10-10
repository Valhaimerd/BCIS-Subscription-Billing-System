# Architecture

```text
Electron renderer
    | narrow window.bcis preload contract
Electron main process
    | authenticated HTTP over the office LAN
Fastify API
    | transactions, validation, authorization, audit
    |---- PostgreSQL
    |---- attachments
    |---- verified backups
    `---- rotated logs
```

The API is the only database client. Attachments and backups remain server-owned. The desktop renderer runs with context isolation and sandboxing enabled and Node.js integration disabled.

## Authentication boundary

The renderer can request login, logout, lock, and unlock through fixed IPC channels. Only the Electron main process communicates with the fixed API base URL and holds the opaque session token in memory. The API hashes passwords with Argon2id, stores only SHA-256 session-token hashes, checks expiry/account state/lock state on protected requests, and enforces permissions independently of desktop navigation.

Authentication and authorization events are appended to `audit_logs`. Normal application services expose no audit update or delete operation.

## Operational boundary

Only the API process can run PostgreSQL backup/restore tools or read and replace attachment files. The renderer calls a fixed typed preload contract, the Electron main process sends authenticated HTTP, and the server enforces Owner permissions. During a restore the API rejects other application requests until database and attachment integrity checks finish.
