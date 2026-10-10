# Frontend Test Evidence

Verified on 2026-10-01 on Windows with the local PostgreSQL database, FastAPI at `http://127.0.0.1:8000`, and Vite at `http://127.0.0.1:5173`. No credential, access token, browser-storage value, or database URL is recorded here or in the screenshots.

## Automated verification

| Check                    | Command from `frontend/` | Result                           |
| ------------------------ | ------------------------ | -------------------------------- |
| Unit/component tests     | `npm test`               | PASS — 31 files, 154 tests       |
| TypeScript               | `npm run typecheck`      | PASS                             |
| ESLint                   | `npm run lint`           | PASS                             |
| Prettier                 | `npm run format`         | PASS                             |
| Production build         | `npm run build`          | PASS — 1,139 modules transformed |
| Integrated browser tests | `npm run test:e2e`       | PASS — 12 tests in 31.0 seconds  |

The Playwright project is a single Chromium project, runs serially against the real API, starts Vite automatically, captures screenshots on failure, and retains a trace on the first retry. The verified browser was the installed Google Chrome Chromium channel, version `154.0.8037.92`. Playwright's package is locked by `package-lock.json`; downloading its managed Chromium v1243 was attempted from the default and Microsoft Azure Edge endpoints but both timed out, so the installed Chromium channel was used for this workstation's successful gate.

Backend regression evidence from the same integrated environment:

| Check             | Command from repository root                          | Result                        |
| ----------------- | ----------------------------------------------------- | ----------------------------- |
| API tests         | `.\.venv\Scripts\python.exe -m pytest -q`             | PASS — 289 tests              |
| Backend lint      | `.\.venv\Scripts\python.exe -m ruff check .`          | PASS                          |
| Backend format    | `.\.venv\Scripts\python.exe -m ruff format --check .` | PASS — 94 files               |
| Backend types     | `.\.venv\Scripts\python.exe -m mypy app tests`        | PASS — 70 source files        |
| Apply migrations  | `.\.venv\Scripts\python.exe -m alembic upgrade head`  | PASS                          |
| Current migration | `.\.venv\Scripts\python.exe -m alembic current`       | PASS — `20260911_0003 (head)` |

## Browser workflow coverage

- Invalid and valid login, logout, anonymous route protection, and protected nested-route refresh.
- Administrator Students search, program/year filters, pagination, client validation, create, backend reload, edit, duplicate conflict, and confirmed deactivation.
- Staff navigation without Users/Roles, deliberate frontend denial, and direct backend `403`.
- Instructor assigned offering, roster, and authorized grade update.
- Student profile, published grades, and aggregate Academic Record.
- Enrollment creation, duplicate backend conflict, and browser list verification.
- Program, Course, Academic Term, and Course Offering management entry points.
- 390x844 drawer, Students controls, form layout, and no document-level horizontal overflow.
- Aborted Students request showing `API server is unreachable. Try again.` and a Retry action.

## Accessibility and responsive review

| Check                                                                             | Result                                |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| Keyboard-reachable login controls and visible labels                              | PASS                                  |
| Skip-to-content link and focusable main content                                   | PASS                                  |
| Narrow-screen drawer opens, navigates, and closes                                 | PASS                                  |
| Table actions have specific accessible names                                      | PASS                                  |
| Dialogs have headings, labeled controls, and cancel/confirm actions               | PASS                                  |
| Client/backend form errors are text, associated with controls, and not color-only | PASS                                  |
| Status chips include readable text                                                | PASS                                  |
| 1280px desktop tables, toolbars, and dialogs                                      | PASS                                  |
| 390x844 application shell, Students controls, and form                            | PASS — Playwright regression coverage |
| Network, loading, empty, forbidden, and retry states                              | PASS                                  |

Focus restoration after closing every dialog and assistive-technology-specific announcements should be rechecked by the student on the exact browser/device used for the live assessment.

## Sanitized screenshots

`docs/evidence/frontend/` contains:

- `login-error.png`
- `dashboard.png`
- `students-desktop.png`
- `student-form-validation.png`
- `academic-record.png`
- `forbidden.png`
- `narrow-screen.png`

The images contain demonstration data only. Login-error capture uses invalid placeholder credentials, and no screenshot exposes a password field value, token, storage panel, or environment file.
