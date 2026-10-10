# BCIS Setup, Demo Accounts, and Run Guide

This is the primary **start here** document for preparing and running the BCIS laboratory project. Run commands from the repository root:

```powershell
cd "C:\Users\Valhaimerd\Desktop\BCIS-Subscription-Billing-System"
```

## 1. Required software

Install these before preparing the project:

- Windows 10 or later
- Node.js 24 or later
- npm 11 or later
- PostgreSQL 18
- Git is optional for running this supplied folder

Confirm Node.js and npm:

```powershell
node --version
npm --version
```

PostgreSQL must be running and the dedicated `bcis` database/account must already exist.

## 2. Configure the private environment

If `.env` does not exist, create it from the safe example:

```powershell
Copy-Item .env.example .env
```

Open `.env` and configure at least:

```env
NODE_ENV=development
API_HOST=0.0.0.0
API_PORT=3100
DATABASE_URL=postgresql://bcis_app:<password>@127.0.0.1:5432/bcis
BCIS_API_BASE_URL=http://127.0.0.1:3100/api/v1
POSTGRES_BIN_DIRECTORY=C:\Program Files\PostgreSQL\18\bin
SEED_OWNER_PASSWORD=<lab-password-with-at-least-8-characters>
```

Rules:

- Replace placeholders before running database commands.
- Keep `.env` Git-ignored and private.
- `API_HOST=0.0.0.0` lets the API listen locally and on the office LAN.
- Local desktop use should keep `BCIS_API_BASE_URL` on `127.0.0.1`.
- A remote desktop client uses the server computer's LAN address, never `0.0.0.0`.
- Never place `DATABASE_URL` on a client PC.

## 3. Install project dependencies

Run once after receiving the project or whenever `package-lock.json` changes:

```powershell
npm install
```

## 4. Prepare the database

Apply all ordered migrations:

```powershell
npm run db:migrate
```

Load the fictional but realistic laboratory dataset and demonstration accounts:

```powershell
npm run db:seed
```

The seed is repeatable, but running it again resets the seeded demo-account passwords to the current `SEED_OWNER_PASSWORD`. Do not seed a real production database.

The resulting dataset resembles a system that has already been operating for several months. It includes finalized August, September, and October 2026 billing; office, GCash, and route-collection payments; issued receipts; approved, pending, and rejected GCash submissions; collection batches at different workflow stages; and unpaid balances for receivables work. All records are fictional.

To discard the current local lab records and rebuild a clean realistic dataset, stop the API and desktop client, then run:

```powershell
npm run db:reset:lab
```

This command refuses production and non-local databases, saves a PostgreSQL safety dump in `BACKUP_DIRECTORY`, resets only the configured local `bcis` schemas, reapplies migrations, and runs the seed. It permanently replaces the active lab database; retain the reported safety dump until the reset has been reviewed.

## 5. Demo accounts

All seeded accounts initially use the value of `SEED_OWNER_PASSWORD` from `.env` at the time `npm run db:seed` was last executed.

| Username                | Display name         | Role                  | Use during the demonstration                                            |
| ----------------------- | -------------------- | --------------------- | ----------------------------------------------------------------------- |
| `owner`                 | Miguel Antonio Reyes | Owner / Super Admin   | Full demonstration, settings, backup, and recovery                      |
| `administrator`         | Patricia Mae Lim     | Administrator         | Subscribers, billing, operations, users, and reports; no backup/restore |
| `cashier`               | Angela Marie Cruz    | Cashier               | Subscriber lookup, Cash/GCash payments, and authorization-denial demo   |
| `collection.supervisor` | Roberto Garcia       | Collection Supervisor | Batches, remittance, reversal, receivables, and reports                 |
| `auditor`               | Teresa Villanueva    | Accounting / Auditor  | Read-only financial reports, exports, and audit history                 |
| `technician`            | Daniel Bautista      | Technician            | Subscriber lookup, suspension, and reconnection work                    |

All personal names, addresses, contact details, and financial records produced by the seed are fictional and intended only for this laboratory.

Recommended presentation use:

1. Use `owner` for the complete workflow and backup demonstration.
2. Use `cashier` for AT-10, showing that user administration and backup operations are rejected by the server.
3. Use `collection.supervisor` when demonstrating batches, shortages, reconciliation, and reversals.
4. Use `auditor` for a read-only report/audit demonstration if time permits.

The yellow password notice means the account is a seeded development account. Do not reuse the shared laboratory password in a real deployment.

## 6. Build the project

Create the API and desktop production bundles:

```powershell
npm run build
```

You can skip this command for ordinary development startup, but run it before packaging or final submission.

## 7. Start the system

### Recommended Windows method

Double-click `run.bat` in the repository root. It opens:

- **BCIS API** terminal running `npm run dev:api`
- **BCIS Desktop** terminal running `npm run dev:desktop`

Keep both terminals open while using the application.

### Manual method

Open two PowerShell terminals in the repository root.

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev:desktop
```

The API documentation is available while the API runs:

```text
http://127.0.0.1:3100/docs
```

The readiness endpoint is:

```text
http://127.0.0.1:3100/api/v1/health/ready
```

## 8. First login and recommended walkthrough

1. Sign in as `owner` using the configured seed password.
2. Review the dashboard.
3. Open a seeded subscriber and service account.
4. Review or generate/finalize a monthly billing cycle.
5. Post a Cash payment and preview the receipt.
6. Submit and verify a synthetic GCash payment with a unique reference.
7. Review the ledger and Statement of Account.
8. Open receivables and inspect AR aging.
9. Process a collection batch and reconcile its remittance.
10. Reverse a test payment and inspect its retained history.
11. Preview and export a PDF/XLSX report.
12. Sign in as `cashier` and demonstrate denied Owner operations.
13. Sign back in as `owner` and create a verified backup.

Detailed screen instructions are in the [User manual](USER_MANUAL.md). The presentation sequence and defense answers are in the [Defense guide](DEFENSE_GUIDE.md).

## 9. Stop the system

Close the **BCIS Desktop** and **BCIS API** terminals opened by `run.bat`, or press `Ctrl+C` in each manually opened development terminal.

Do not stop the API during a backup or restore.

## 10. Routine test commands

Run these before demonstrating or submitting changes:

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:task10
```

What they check:

| Command                 | Check                                                   |
| ----------------------- | ------------------------------------------------------- |
| `npm run format`        | Repository formatting                                   |
| `npm run lint`          | JavaScript/TypeScript static rules                      |
| `npm run typecheck`     | TypeScript contracts across all workspaces              |
| `npm test`              | Database, API/domain/route, and desktop component tests |
| `npm run build`         | Production API and Electron bundles                     |
| `npm run verify:task10` | Dataset minimums and financial reconciliation           |

## 11. Full clean-database acceptance

Use this only for final acceptance—not ordinary startup:

```powershell
npm run verify:task10:clean
```

The command takes a safety backup, rebuilds the validated local BCIS database from migrations, seeds twice to prove repeatability, runs all live Task 3–10 verifiers, and restores the original database in `finally`. Do not run it against production or interrupt it.

## 12. Desktop end-to-end checks

Start the API first, then run the Electron journeys from another terminal:

```powershell
node tests/task3-electron.mjs
node tests/task4-electron.mjs
node tests/task5-electron.mjs
node tests/task6-electron.mjs
node tests/task7-electron.mjs
node tests/task8-electron.mjs
node tests/task9-electron.mjs
```

These tests open and close the desktop application automatically and retain screenshots under `output/playwright`.

## 13. Create the Windows installer

Build the NSIS installer:

```powershell
npm run dist --workspace @bcis/desktop
```

The installer is written to:

```text
release/BCIS Billing and Collection Setup 0.1.0.exe
```

The API/PostgreSQL server must still be installed and started separately. Client installation and LAN configuration are documented in [Deployment and recovery](DEPLOYMENT.md).

## 14. When to rerun each step

| Situation                                   | Commands                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| First setup                                 | `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run build` |
| Normal daily use                            | Double-click `run.bat`                                                  |
| After pulling source changes                | `npm install`, `npm run db:migrate`, then start the system              |
| Before a demonstration                      | Routine test commands, then `run.bat`                                   |
| Before final submission                     | Full clean acceptance, routine checks, installer build                  |
| Reset seeded demo passwords/data foundation | `npm run db:seed`                                                       |

## 15. Common startup problems

| Problem                          | Resolution                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| `npm was not found`              | Install Node.js 24+ and reopen the terminal                     |
| `Missing .env`                   | Copy `.env.example` and configure the real local values         |
| Dependencies are not installed   | Run `npm install`                                               |
| Database connection fails        | Start PostgreSQL and privately verify `DATABASE_URL`            |
| API port is already in use       | Close the existing API process using port `3100`                |
| Desktop shows server unavailable | Start the API and check `BCIS_API_BASE_URL`                     |
| Login is rejected                | Confirm the username and the password used during the last seed |
| Permission denied                | Use an account whose role permits the requested operation       |
| GCash reference conflict         | Open the existing payment; do not bypass duplicate protection   |
| Backup tools unavailable         | Correct `POSTGRES_BIN_DIRECTORY` and restart the API            |

## Safety reminders

- Use only synthetic subscriber, contact, GCash, and payment information.
- Never display or commit `.env`, database credentials, passwords, or session tokens.
- Do not delete posted financial records or manually modify ledger balances.
- Create a verified backup before an update or restore test.
- Do not expose PostgreSQL port `5432` to desktop client PCs.
