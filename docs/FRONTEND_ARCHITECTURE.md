# Frontend Architecture and Security

## Runtime and data flow

```text
React renderer
  -> typed window.bcis preload contract
  -> fixed Electron main-process IPC handlers
  -> authenticated Fastify HTTP API
  -> PostgreSQL and server-owned files
```

The renderer runs with context isolation and sandboxing enabled and Node.js
integration disabled. `apps/desktop/src/renderer/src/App.tsx` owns sign-in,
locked-session handling, the authenticated shell, and role-aware page selection.
Feature workflows live in `MasterDataViews.tsx`, `BillingViews.tsx`,
`PaymentViews.tsx`, `CollectionsView.tsx`, `ReceivablesView.tsx`,
`ReportingViews.tsx`, and `OperationsView.tsx`; shared presentation styles live
in `styles.css`.

`apps/desktop/src/preload/index.ts` exposes the fixed, typed `window.bcis`
surface. Its IPC calls map to handlers in `apps/desktop/src/main/index.ts`.
The Electron main process owns the `DesktopAuthClient` and its opaque session
token, and makes authenticated requests to the configured Fastify API. The
renderer does not access Node.js, PostgreSQL, credentials, attachment paths, or
unrestricted IPC. The API is the only database client; it validates input,
checks permissions on every protected request, and owns attachments and
backups.

## Session and authorization boundaries

On startup, the renderer requests the current session through the preload
contract. Sign-in, lock, unlock, and sign-out also use fixed auth methods. The
main process retains the session token; renderer navigation uses the
permissions returned for that session to show available destinations. These
checks only guide the interface. Fastify remains the authorization boundary and
returns `401` or `403` independently.

## Data and financial workflows

- Renderer features call the typed preload API. They do not make direct API or
  database connections.
- Fastify validates external input with shared Zod contracts and enforces
  authorization at the route/service boundary.
- Money is stored and transferred as integer centavos. Financial posting uses
  database transactions; posted history is corrected through linked
  adjustments or reversals.
- The API owns uploaded proof files, backups, and rotated logs. The renderer
  receives only the data allowed by its API contract and permissions.
- Navigation visibility never grants access or replaces object-level checks,
  response redaction, or database constraints.

## Current product boundaries

The current frontend provides Home, subscriber and plan workspaces, billing,
payments, collections, receivables, services, reports, and backup/recovery
surfaces. User and role administration is not implemented in the desktop or API
workflow yet, so the navigation does not advertise an Administration page.
