# Task 2 Evidence

Verified on Windows on 2026-10-02 against the dedicated PostgreSQL `bcis` database.

## Results

| Check                                                                       | Result                         |
| --------------------------------------------------------------------------- | ------------------------------ |
| Migration and seven required security/session/audit tables                  | Passed                         |
| Seven roles and granular permission seed                                    | Passed                         |
| Development Owner seed with Argon2id password hash                          | Passed                         |
| Login, expiry, inactive account, throttling, lock, unlock, and logout tests | Passed                         |
| Direct API authorization checks for all seven roles                         | Passed                         |
| Owner administration access                                                 | `200`                          |
| Locked-session administration access                                        | `403`                          |
| Cashier administration access                                               | `403`                          |
| Revoked-session access                                                      | `401`                          |
| Raw token absent and SHA-256 token hash present in PostgreSQL               | Passed                         |
| Passwords and tokens absent from audit values and safe responses            | Passed                         |
| Electron login, lock, unlock, and logout at 1440 x 900                      | Passed                         |
| Electron authenticated layout at minimum 960 x 640 window                   | Passed; no horizontal overflow |
| Renderer console/page errors during the verified flow                       | None                           |

The live validation found and corrected two integration defects: JSON headers were being added to bodyless requests, and the sandboxed Electron preload was emitted as ESM instead of CommonJS.

## Screenshots

- [Authenticated Owner dashboard](../output/playwright/bcis-task-02-authenticated.png)
- [Locked session](../output/playwright/bcis-task-02-locked.png)
- [Signed-out login screen](../output/playwright/bcis-task-02-signed-out.png)
- [Minimum supported window](../output/playwright/bcis-task-02-min-window.png)

No credential value is included in this evidence.
