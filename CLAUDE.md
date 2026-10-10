# BCIS Development Rules

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through the Fastify API and enforce authorization on the server.
- Store money as integer centavos and use PostgreSQL transactions for financial posting.
- Never edit or delete posted financial history; use linked reversals or adjustments.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Use synthetic customer and payment information in development and tests.
- Run formatting, linting, type checking, tests, and builds before completing a task.
- Add commands to documentation only after they have run successfully.
