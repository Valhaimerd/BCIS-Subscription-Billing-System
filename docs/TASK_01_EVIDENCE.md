# Task 1 Evidence

Verified on Windows with Node.js 24.19.0, npm 11.17.0, Electron 44.5.1, and a disposable PostgreSQL 18 cluster.

## Results

| Check                                          | Result                        |
| ---------------------------------------------- | ----------------------------- |
| Dependency installation                        | Passed                        |
| Formatting                                     | Passed                        |
| ESLint                                         | Passed                        |
| TypeScript strict checking                     | Passed                        |
| Vitest workspace tests                         | Passed                        |
| Production build                               | Passed                        |
| Migration against an empty PostgreSQL database | Passed                        |
| API liveness                                   | `200`, status `ok`            |
| API database readiness                         | `200`, status `ok`            |
| API readiness without PostgreSQL               | `503`, safe degraded response |
| Electron production preview                    | Opened successfully           |
| Renderer console at desktop/mobile widths      | No errors or warnings         |

## Screenshots

- [Desktop shell - 1440 x 900](../../output/playwright/bcis-task-01-desktop.png)
- [Mobile shell - 390 x 844](../../output/playwright/bcis-task-01-mobile.png)
- [Mobile navigation](../../output/playwright/bcis-task-01-mobile-nav.png)

The disposable PostgreSQL cluster was stopped and removed after verification. No project `.env` file was created or modified.
