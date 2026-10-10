# BCIS Subscription Billing and Collection System

Windows desktop billing, collection, subscriber-ledger, and receivables software for Bukidnon Cable and Internet Services.

## Architecture

```text
Electron desktop clients -> Fastify LAN API -> PostgreSQL
                                      |-----> attachments
                                      |-----> backups
                                      `-----> audit logs
```

The renderer has no direct Node.js or database access. Privileged desktop operations are exposed through a narrow typed preload API.

See the [technical documentation](docs/TECHNICAL_DOCUMENTATION.md), [manuals](docs/manual/README.md), [acceptance-test report](docs/ACCEPTANCE_TEST_REPORT.md), and focused [Task 1](docs/TASK_01_EVIDENCE.md) through [Task 10](docs/TASK_10_EVIDENCE.md) evidence.

## Requirements

- Node.js 24 or later
- npm 11 or later
- PostgreSQL with a dedicated BCIS database and account

## Install

```powershell
npm install
Copy-Item .env.example .env
```

Replace all placeholders in `.env`. Never commit that file.

Apply migrations, then set `SEED_OWNER_PASSWORD` to a lab-only value of at least 8 characters and seed the access-control foundation. Use a stronger unique value for any real deployment:

```powershell
npm run db:migrate
npm run db:seed
```

The development Owner is forced to change its seeded password before production use. The seed command refuses to run with `NODE_ENV=production` or a placeholder password.

## Development

Run the API and desktop application in separate terminals:

```powershell
npm run dev:api
npm run dev:desktop
```

On Windows, after completing the first-time install, migration, and seed steps, double-click `run.bat` to open both commands in separate terminals. Closing those terminals stops their development processes.

The API documentation is available at `http://127.0.0.1:3100/docs` when the API is running.

## Windows package

```powershell
npm run dist --workspace @bcis/desktop
```

The verified NSIS installer is written to `release/`. LAN host, client configuration, update, and recovery steps are in the [deployment guide](docs/manual/DEPLOYMENT.md).

## Verification

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:task3 --workspace @bcis/api
npm run verify:task4
npm run verify:task5
npm run verify:task6
npm run verify:task7
npm run verify:task8
npm run verify:task9
npm run verify:task10
```

The guarded final acceptance command creates an isolated database when permitted; with the least-privilege lab account it first takes a safety dump, rebuilds only the validated local BCIS database, runs all live verifiers, and restores the original state:

```powershell
npm run verify:task10:clean
```

Database readiness and migrations require a valid `DATABASE_URL` in the Git-ignored `.env`.
