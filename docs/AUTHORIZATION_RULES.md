# BCIS Authorization Rules

The Fastify API is the authorization boundary. Hidden desktop controls improve usability but never grant or remove permission.

| Role                  | Intended access                                                               |
| --------------------- | ----------------------------------------------------------------------------- |
| Owner                 | All permissions, including settings, backup, restore, and user administration |
| Administrator         | Operational administration except settings, backup, and restore               |
| Cashier               | Subscriber/billing lookup, payment creation, and GCash verification           |
| Collection Supervisor | Collections, payment reversal, receivables, reports, and exports              |
| Accounting / Auditor  | Read-only financial, collection, report, export, and audit access             |
| Technician            | Subscriber lookup and service-status work                                     |
| Read-only Viewer      | Non-mutating operational and financial views                                  |

Every protected route resolves the opaque Bearer session from PostgreSQL, confirms the user and session are active, then checks the required permission. A `401` means the session is absent or invalid; a `403` means the authenticated account lacks permission. Database constraints and transactions still apply to privileged users.

The complete permission codes and role assignments are seeded in `apps/api/src/seed.ts`. Route requirements are published by the generated OpenAPI document at `/docs`; direct authorization regression tests are in the API route test files. AT-10 specifically proves that a Cashier receives `403` from user-administration and backup endpoints.
