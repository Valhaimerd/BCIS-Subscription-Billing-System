# Activity III Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete React frontend for the existing Student Information Management REST API, including real authentication, role-aware academic workflows, automated tests, and Activity III submission evidence.

**Architecture:** Add a separate Vite-powered React single-page application in `frontend/`. Feature modules call the existing FastAPI `/api/v1` contract through one typed `fetch` client, use TanStack Query for server state, React Hook Form with Zod for forms, and Material UI for the responsive interface. The backend remains authoritative; its only extensions are explicit CORS configuration, an additive `student_id` field on `/auth/me`, and a safe instructor-options collection needed by the existing offering-management permission model.

**Tech Stack:** React, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Material UI, Vitest, React Testing Library, Mock Service Worker, Playwright, FastAPI, pytest

**Spec:** `docs/superpowers/specs/2026-09-22-activity-3-frontend-design.md`

## Global Constraints

- Keep the frontend in `frontend/` with its own manifest, lockfile, environment example, tests, build, and README.
- Use Node.js 24.19.0 and npm 11.17.0, which are verified in this workspace; commit the npm lockfile.
- Use stable package releases only. The lockfile is the exact dependency record; do not use pre-release or paid UI packages.
- Use the existing `/api/v1` JSON contracts, status codes, pagination, filters, sorting, validation errors, and role rules as the source of truth.
- Do not add SSR, server routes, direct database access, mock core data in production, or a replacement backend.
- Configure `VITE_API_BASE_URL`; do not scatter backend origins through feature code.
- Store the opaque token only for the browser session, never in URLs or logs, and clear authentication plus query state on logout or `401`.
- Use an explicit CORS origin allowlist; never use `*` for an authenticated browser client.
- Treat route guards and hidden controls as usability features only; backend authorization remains mandatory.
- Keep feature-specific components inside their feature. Share primitives, not a universal CRUD screen.
- Run backend commands with `.venv\Scripts\python.exe` and frontend commands from `frontend/` with npm.
- Add setup or verification commands to user documentation only after those exact commands pass in this repository.
- Preserve the user's existing `.gitignore`, `.postman/`, `postman/`, converted laboratory PDF, and converted Markdown changes unless a task explicitly needs a non-overlapping addition.

## Verified Contract Additions

Planning against the generated OpenAPI contract exposed two frontend blockers. Both additions are backward-compatible and receive backend contract tests before frontend use:

1. Add `student_id: int | null` to `GET /api/v1/auth/me`. A student cannot call its own profile, enrollments, grades, or academic-record paths without the linked student identifier.
2. Add `GET /api/v1/instructors` for authenticated administrators and staff. It returns safe active-instructor options (`id`, `name`) with standard search and pagination. Staff can already create and update course offerings but cannot access the administrator-only Users collection.

## Review Focus

- **Concurrent `401` responses:** multiple failed requests must produce one idempotent session clear and must not create redirect or notification loops; Task 4 pins this behavior.
- **Unlinked student account:** `student_id: null` must show a controlled profile message and hide broken academic links; Task 14 pins this behavior.
- **Last-row mutation on a paginated list:** deactivating the only row on page 2+ must move to the preceding valid page; Task 5 pins this behavior.
- **Logout with requests in flight:** late responses must not repopulate data from the previous account after the query cache is cleared; Task 4 pins this behavior.
- **Unavailable reference choices:** offering, enrollment, grade, and user forms must disable submission and show a retryable reference-data error rather than accept guessed identifiers; Tasks 10-13 pin this behavior.

---

### Task 1: Close the Browser Integration Contract Gaps

**Files:**

- Modify: `app/config.py:9-23`
- Modify: `app/main.py:1-20`
- Modify: `.env.example:1-6`
- Modify: `app/schemas/auth.py:34-50`
- Modify: `app/api/v1/auth.py:58-75`
- Create: `app/schemas/instructors.py`
- Create: `app/services/instructors.py`
- Create: `app/api/v1/instructors.py`
- Modify: `app/api/v1/router.py:1-27`
- Modify: `tests/test_auth_api.py`
- Create: `tests/test_frontend_integration_api.py`
- Create: `tests/test_instructors_api.py`
- Modify: `docs/API_CONVENTIONS.md`
- Modify: `docs/AUTHORIZATION_RULES.md`
- Modify: `docs/ARCHITECTURE_SECURITY.md:38`
- Modify: `docs/IMPLEMENTATION_DECISIONS.md:328`
- Modify: `api-client/Student-Information-Management.postman_collection.json`

**Interfaces:**

- Consumes: existing `Settings`, `create_app()`, `User.student_profile`, `require_roles()`, standard success/error envelopes, and pagination metadata.
- Produces: `Settings.cors_allowed_origins: list[str]`; `/auth/me.data.student_id: int | null`; `GET /api/v1/instructors`; `InstructorOptionData`; `list_instructors(session, page, per_page, search)`.

- [ ] **Step 1: Write failing CORS tests**

Create `tests/test_frontend_integration_api.py` with explicit allowed and denied origins:

```python
from collections.abc import AsyncIterator

import pytest
from httpx2 import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture
async def cors_client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        '["http://localhost:5173","http://127.0.0.1:5173"]',
    )
    get_settings.cache_clear()
    test_app = create_app()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    get_settings.cache_clear()


@pytest.mark.anyio
async def test_cors_allows_configured_frontend_origin(cors_client: AsyncClient) -> None:
    response = await cors_client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


@pytest.mark.anyio
async def test_cors_rejects_unconfigured_origin(cors_client: AsyncClient) -> None:
    response = await cors_client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in response.headers
```

- [ ] **Step 2: Run the CORS tests and confirm the red state**

Run: `\.venv\Scripts\python.exe -m pytest tests/test_frontend_integration_api.py -q`

Expected: FAIL because `CORS_ALLOWED_ORIGINS` is ignored and no CORS response headers are present.

- [ ] **Step 3: Implement explicit CORS configuration**

Add the setting and middleware exactly at application creation:

```python
# app/config.py
cors_allowed_origins: list[str] = Field(default_factory=list)
```

```python
# app/main.py
from fastapi.middleware.cors import CORSMiddleware

if settings.cors_allowed_origins:
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Location"],
    )
```

Append this safe example to `.env.example`:

```dotenv
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

- [ ] **Step 4: Run the CORS tests and backend static checks**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_frontend_integration_api.py -q
.\.venv\Scripts\python.exe -m ruff check app/config.py app/main.py tests/test_frontend_integration_api.py
.\.venv\Scripts\python.exe -m mypy app tests
```

Expected: both CORS tests pass; Ruff and mypy exit 0.

- [ ] **Step 5: Add a failing `/auth/me` student-link contract test**

Extend the authentication fixture with a Program and a Student linked to user 2, then assert the additive field for both identities:

```python
@pytest.mark.anyio
async def test_me_returns_linked_student_id(client: AsyncClient) -> None:
    token = await login(client, "student@example.test", "student-password")
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["student_id"] == 1
```

Also change the administrator expectation to assert `"student_id": None`.

- [ ] **Step 6: Run the focused auth test and confirm the red state**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_auth_api.py -q`

Expected: FAIL because `CurrentUserData` does not expose `student_id`.

- [ ] **Step 7: Add `student_id` to the safe current-user response**

Implement the additive field:

```python
# app/schemas/auth.py
class CurrentUserData(BaseModel):
    id: int
    name: str
    email: ContractEmailStr
    status: UserStatus
    role: RoleSummary
    student_id: int | None
```

```python
# app/api/v1/auth.py, inside get_me()
"student_id": (
    current_user.student_profile.id
    if current_user.student_profile is not None
    else None
),
```

Update authentication loading to eager-load `User.student_profile` in `app/services/auth.py` so `/auth/me` does not issue a surprise lazy query after the session closes.

- [ ] **Step 8: Write failing instructor-options API tests**

Create `tests/test_instructors_api.py` with SQLite fixtures matching existing API tests. Seed active and inactive instructors plus a staff user, then cover:

```python
@pytest.mark.anyio
async def test_staff_lists_only_active_instructors(client: AsyncClient) -> None:
    token = await login(client, "staff@example.test", "staff-password")
    response = await client.get(
        "/api/v1/instructors?search=Grace&page=1&per_page=20",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["data"] == [{"id": 3, "name": "Grace Hopper"}]
    assert response.json()["meta"]["pagination"]["total"] == 1


@pytest.mark.anyio
async def test_student_cannot_list_instructor_options(client: AsyncClient) -> None:
    token = await login(client, "student@example.test", "student-password")
    response = await client.get(
        "/api/v1/instructors",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
```

Add tests for missing authentication (`401`), invalid sort or unsupported query parameter (`422`), pagination, and exclusion of inactive users or inactive instructor roles.

- [ ] **Step 9: Run instructor tests and confirm the red state**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_instructors_api.py -q`

Expected: collection fails with `404` because the route does not exist.

- [ ] **Step 10: Implement the safe instructor-options endpoint**

Define these public schemas in `app/schemas/instructors.py`:

```python
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import PaginationMeta


class InstructorOptionData(BaseModel):
    id: int
    name: str


class InstructorOptionListResponse(BaseModel):
    success: Literal[True] = True
    message: str
    data: list[InstructorOptionData]
    meta: PaginationMeta
```

Implement `list_instructors()` using `User JOIN Role`, `Role.code == "INSTRUCTOR"`, active user and role predicates, trimmed name search, allowed sort fields `id` and `name`, deterministic `id` tie-breaking, and standard pagination. Add a `/instructors` router protected by `require_roles("ADMINISTRATOR", "STAFF")`, include it in `app/api/v1/router.py`, and document all standard `401`, `403`, and `422` responses.

- [ ] **Step 11: Run all focused backend tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_frontend_integration_api.py tests/test_auth_api.py tests/test_instructors_api.py -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app tests
```

Expected: all focused tests and static checks pass.

- [ ] **Step 12: Update the backend contract evidence**

Record the browser origin setting, additive current-user link, safe instructor reference route, authorization boundary, and examples in the listed docs and Postman collection. Do not describe the frontend as implemented yet. Verify the Postman JSON parses:

```powershell
.\.venv\Scripts\python.exe -m json.tool api-client\Student-Information-Management.postman_collection.json > $null
```

- [ ] **Step 13: Run the complete backend quality gate**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app tests
```

Expected: every backend test and static check passes.

- [ ] **Step 14: Commit the browser integration contract**

```powershell
git add .env.example app/config.py app/main.py app/schemas/auth.py app/api/v1/auth.py app/services/auth.py app/schemas/instructors.py app/services/instructors.py app/api/v1/instructors.py app/api/v1/router.py tests/test_auth_api.py tests/test_frontend_integration_api.py tests/test_instructors_api.py docs/API_CONVENTIONS.md docs/AUTHORIZATION_RULES.md docs/ARCHITECTURE_SECURITY.md docs/IMPLEMENTATION_DECISIONS.md api-client/Student-Information-Management.postman_collection.json
git commit -m "feat: add browser integration contracts"
```

---

### Task 2: Scaffold the Frontend and Test Harness

**Files:**

- Create: `frontend/package.json`
- Create: `frontend/package-lock.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/.prettierrc.json`
- Create: `frontend/.prettierignore`
- Create: `frontend/.env.example`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/providers.tsx`
- Create: `frontend/src/app/queryClient.ts`
- Create: `frontend/src/app/theme.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/test/server.ts`
- Create: `frontend/src/test/render.tsx`
- Create: `frontend/src/app/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: Node.js 24.19.0, npm 11.17.0, Vite's React TypeScript template.
- Produces: npm scripts `dev`, `build`, `lint`, `format`, `format:write`, `typecheck`, `test`, `test:watch`, `test:e2e`; `createAppQueryClient()`; `AppProviders`; `appTheme`; a jsdom/MSW test environment.

- [ ] **Step 1: Scaffold the React TypeScript application**

Run from the repository root:

```powershell
npm create vite@latest frontend -- --template react-ts
```

Expected: `frontend/package.json`, the Vite entry point, TypeScript configs, and a lockfile-ready project are created without modifying backend files.

- [ ] **Step 2: Install runtime and test dependencies**

Run from `frontend/`:

```powershell
npm install react-router @tanstack/react-query react-hook-form @hookform/resolvers zod @mui/material @mui/icons-material @emotion/react @emotion/styled
npm install --save-dev vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event msw @playwright/test prettier eslint-config-prettier @tanstack/eslint-plugin-query
```

Expected: the manifest and lockfile contain only stable releases and npm reports no unresolved peer dependency.

- [ ] **Step 3: Define reproducible npm scripts and environment input**

Set these scripts in `frontend/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Create `frontend/.env.example`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Add only frontend-generated files to `.gitignore`: `frontend/node_modules/`, `frontend/dist/`, `frontend/coverage/`, `frontend/playwright-report/`, `frontend/test-results/`, and `frontend/.env.local`.

- [ ] **Step 4: Write the failing provider smoke test**

Create `frontend/src/app/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react';

import { renderApp } from '../test/render';
import { App } from './App';

describe('App', () => {
  it('renders the application identity through the shared providers', () => {
    renderApp(<App />);
    expect(
      screen.getByRole('heading', { name: 'Student Information Management' }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the smoke test and confirm the red state**

Run from `frontend/`: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `renderApp`, `AppProviders`, and the application heading do not exist in the scaffold.

- [ ] **Step 6: Implement the theme, query client, providers, and test setup**

Expose these exact interfaces:

```tsx
// src/app/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
```

```tsx
// src/app/providers.tsx
export interface AppProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({
  children,
  queryClient = createAppQueryClient(),
}: AppProvidersProps): React.JSX.Element {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
```

Configure Vitest in `vite.config.ts` with `environment: 'jsdom'`, `setupFiles: './src/test/setup.ts'`, and CSS enabled. `setup.ts` imports `@testing-library/jest-dom/vitest`, starts the MSW server before all tests, resets handlers after each test, and closes the server after all tests. `renderApp()` wraps the supplied element in `MemoryRouter` and `AppProviders` with a fresh query client.

Use a custom Material UI theme with navy primary `#163A5F`, neutral page background `#F5F7FA`, visible keyboard focus, and typography that does not depend on a remote font.

- [ ] **Step 7: Run the frontend foundation checks**

Run from `frontend/`:

```powershell
npm test -- src/app/App.test.tsx
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: smoke test passes and all four static/build commands exit 0.

- [ ] **Step 8: Commit the frontend foundation**

```powershell
git add .gitignore frontend
git commit -m "feat: scaffold activity 3 frontend"
```

---

### Task 3: Build the Typed API Client and Session Storage

**Files:**

- Create: `frontend/src/api/envelopes.ts`
- Create: `frontend/src/api/errors.ts`
- Create: `frontend/src/api/query.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/auth/auth.storage.ts`
- Create: `frontend/src/api/client.test.ts`
- Create: `frontend/src/test/handlers/base.ts`
- Modify: `frontend/src/test/server.ts`

**Interfaces:**

- Consumes: `VITE_API_BASE_URL`, browser `fetch`, backend success/error envelopes, `sessionStorage`.
- Produces: `SuccessEnvelope<T>`, `PaginatedEnvelope<T>`, `Pagination`, `ApiError`, `apiRequest<T>()`, `buildQueryString()`, `StoredSession`, `readSession()`, `writeSession()`, `clearSession()`, `subscribeUnauthorized()`.

- [ ] **Step 1: Define shared contract types**

Create `frontend/src/api/envelopes.ts`:

```ts
export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

export interface PaginatedEnvelope<T> extends SuccessEnvelope<T[]> {
  meta: { pagination: Pagination };
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  errors: Record<string, string[]> | null;
}
```

Create `frontend/src/api/errors.ts` with:

```ts
export type ApiErrorKind = 'http' | 'network' | 'invalid-response';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status: number | null = null,
    public readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Write failing query, response, network, expiry, and unauthorized tests**

Cover the exact public behavior in `frontend/src/api/client.test.ts`:

```ts
it('omits empty query values and preserves supported values', () => {
  expect(
    buildQueryString({
      page: 2,
      per_page: 20,
      search: 'Ada Lovelace',
      status: '',
      program_id: undefined,
    }),
  ).toBe('?page=2&per_page=20&search=Ada+Lovelace');
});

it('returns undefined for 204 without parsing JSON', async () => {
  server.use(
    http.post(
      `${API_BASE}/auth/logout`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  await expect(
    apiRequest<void>('/auth/logout', { method: 'POST' }),
  ).resolves.toBeUndefined();
});

it('normalizes field errors from 422', async () => {
  server.use(
    http.post(`${API_BASE}/students`, () =>
      HttpResponse.json(
        {
          success: false,
          message: 'Validation failed.',
          errors: { email: ['Invalid email.'] },
        },
        { status: 422 },
      ),
    ),
  );
  await expect(
    apiRequest('/students', { method: 'POST', body: {} }),
  ).rejects.toMatchObject({
    kind: 'http',
    status: 422,
    fieldErrors: { email: ['Invalid email.'] },
  });
});
```

Also assert Bearer-header attachment, safe handling of a non-JSON `500`, malformed success envelopes, fetch rejection as `kind: 'network'`, expired session removal, base URL trailing-slash normalization, and an idempotent unauthorized subscriber called for `401` but not `403`.

- [ ] **Step 3: Run API client tests and confirm the red state**

Run: `npm test -- src/api/client.test.ts`

Expected: FAIL because the API client and storage modules do not exist.

- [ ] **Step 4: Implement session storage**

Use one namespaced key and validate stored JSON:

```ts
export interface StoredSession {
  accessToken: string;
  expiresAt: string;
}

const SESSION_KEY = 'student-information.session';

export function writeSession(session: StoredSession): void;
export function readSession(now?: Date): StoredSession | null;
export function clearSession(): void;
```

`readSession()` returns `null` and removes the entry when JSON is malformed, properties are missing, or `expiresAt <= now`. It never logs the stored value.

- [ ] **Step 5: Implement query serialization and the fetch client**

Expose this request contract:

```ts
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T>;

export function subscribeUnauthorized(listener: () => void): () => void;
```

The implementation must add `Content-Type` only for a body, attach the valid session token unless `authenticated === false`, return `undefined as T` for `204`, parse supported JSON envelopes, convert failures to `ApiError`, invoke each unauthorized listener once per `401` response, map every `500+` response to a safe retryable error, and expose no raw body text in thrown messages.

- [ ] **Step 6: Run the client tests and all frontend checks**

Run:

```powershell
npm test -- src/api/client.test.ts
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: API client tests and every check pass.

- [ ] **Step 7: Commit the API foundation**

```powershell
git add frontend/src/api frontend/src/auth/auth.storage.ts frontend/src/test
git commit -m "feat: add typed frontend API client"
```

---

### Task 4: Implement Authentication, Protected Routing, and the Application Shell

**Files:**

- Create: `frontend/src/auth/auth.types.ts`
- Create: `frontend/src/auth/auth.api.ts`
- Create: `frontend/src/auth/AuthProvider.tsx`
- Create: `frontend/src/auth/ProtectedRoute.tsx`
- Create: `frontend/src/auth/permissions.ts`
- Create: `frontend/src/auth/AuthProvider.test.tsx`
- Create: `frontend/src/app/routes.ts`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/navigation/AppNavigation.tsx`
- Create: `frontend/src/components/feedback/FullPageStatus.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/ForbiddenPage.tsx`
- Create: `frontend/src/pages/NotFoundPage.tsx`
- Create: `frontend/src/pages/DashboardPlaceholderPage.tsx`
- Create: `frontend/src/pages/LoginPage.test.tsx`
- Create: `frontend/src/test/factories/auth.ts`
- Modify: `frontend/src/app/providers.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/test/render.tsx`

**Interfaces:**

- Consumes: `apiRequest<T>()`, `StoredSession`, `writeSession()`, `clearSession()`, `subscribeUnauthorized()`, `QueryClient`.
- Produces: `RoleCode`, `CurrentUser`, `AuthStatus`, `AuthContextValue`, `useAuth()`, `AuthProvider`, `ProtectedRoute`, `APP_ROUTES`, `canAccess()`, `AppShell`.

- [ ] **Step 1: Define authentication and permission types**

Create these exact types:

```ts
export type RoleCode = 'ADMINISTRATOR' | 'STAFF' | 'INSTRUCTOR' | 'STUDENT';

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  role: { code: RoleCode; name: string };
  student_id: number | null;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}
```

Define `APP_ROUTES` as route metadata with path, label, allowed roles, and navigation visibility. `canAccess(role, allowedRoles)` returns true only for an explicitly listed role.

- [ ] **Step 2: Write failing auth lifecycle and routing tests**

In `AuthProvider.test.tsx`, cover session recovery, expired storage, logout, concurrent unauthorized callbacks, cache clearing, and a late in-flight query:

```tsx
it('clears the user and query cache once when concurrent requests return 401', async () => {
  writeSession({
    accessToken: 'expired-token',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  server.use(
    http.get(`${API_BASE}/auth/me`, () =>
      HttpResponse.json(
        {
          success: false,
          message: 'Invalid authentication credentials.',
          errors: null,
        },
        { status: 401 },
      ),
    ),
  );
  renderApp(<AuthProbe />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status')).toHaveTextContent('anonymous'),
  );
  expect(readSession()).toBeNull();
  expect(screen.queryByText('Test Administrator')).not.toBeInTheDocument();
});
```

In `LoginPage.test.tsx`, cover invalid credentials, successful login, return-to navigation, disabled submit while pending, and password clearing after a rejected login. Add a protected-route test proving an unauthenticated visitor returns to `/login`, a Student cannot open `/app/users`, and a valid Administrator can.

- [ ] **Step 3: Run auth tests and confirm the red state**

Run: `npm test -- src/auth src/pages/LoginPage.test.tsx`

Expected: FAIL because the provider, routes, and pages do not exist.

- [ ] **Step 4: Implement auth API functions and provider**

Expose these API functions:

```ts
export interface LoginData {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
}

export function loginRequest(
  email: string,
  password: string,
): Promise<SuccessEnvelope<LoginData>>;
export function getCurrentUser(): Promise<SuccessEnvelope<CurrentUser>>;
export function logoutRequest(): Promise<void>;
```

`AuthProvider` recovers `/auth/me` only when `readSession()` succeeds, registers one unauthorized callback, clears both session and `queryClient` on logout/`401`, and performs local cleanup in `finally` if the logout HTTP call fails. Protect state transitions with a monotonically increasing session generation so a request started before logout cannot restore the old user.

Extend `renderApp()` with an optional authenticated-user override used by later feature tests, and define this factory in `src/test/factories/auth.ts`:

```ts
export interface RenderAppOptions {
  route?: string;
  auth?: CurrentUser | null;
}

export function studentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 4,
    name: 'Test Student',
    email: 'student@example.test',
    status: 'ACTIVE',
    role: { code: 'STUDENT', name: 'Student' },
    student_id: 27,
    ...overrides,
  };
}
```

When `auth` is omitted, `renderApp()` uses the real `AuthProvider`. When it is a user or `null`, it uses a test-only context provider with `status` set to `authenticated` or `anonymous`; production code never reads test fixtures.

- [ ] **Step 5: Implement protected routes and role-aware navigation**

Use nested routes under `/app`. `ProtectedRoute` renders a full-page loading state while auth resolves, redirects anonymous users to `/login?returnTo=<encoded path>`, renders `ForbiddenPage` for disallowed roles, and otherwise renders an `Outlet`.

`AppNavigation` derives items from `APP_ROUTES`; do not duplicate role rules in JSX. Build an accessible Material UI shell with a persistent desktop drawer, temporary narrow-screen drawer, skip link, user name, role, profile link, and logout button.

- [ ] **Step 6: Implement the login page and terminal pages**

Use React Hook Form and Zod for non-empty email/password input, `autoComplete="username"` and `autoComplete="current-password"`, an inline alert for `ApiError`, and no password persistence. The not-found and forbidden pages provide safe navigation back to the dashboard.

- [ ] **Step 7: Run authentication, accessibility, and build checks**

Run:

```powershell
npm test -- src/auth src/pages/LoginPage.test.tsx
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: all checks pass, including the concurrent-`401`, in-flight logout, and role-route cases.

- [ ] **Step 8: Commit authentication and the shell**

```powershell
git add frontend/src/app frontend/src/auth frontend/src/components frontend/src/pages frontend/src/main.tsx frontend/src/test/render.tsx
git commit -m "feat: add frontend authentication and protected shell"
```

---

### Task 5: Build Reusable Collection, Form, and Feedback Primitives

**Files:**

- Create: `frontend/src/components/tables/DataTable.tsx`
- Create: `frontend/src/components/tables/CollectionToolbar.tsx`
- Create: `frontend/src/components/tables/PaginationControls.tsx`
- Create: `frontend/src/components/tables/collectionState.ts`
- Create: `frontend/src/components/tables/collectionState.test.ts`
- Create: `frontend/src/components/feedback/AsyncContent.tsx`
- Create: `frontend/src/components/feedback/ConfirmActionDialog.tsx`
- Create: `frontend/src/components/feedback/StatusChip.tsx`
- Create: `frontend/src/components/feedback/ToastProvider.tsx`
- Create: `frontend/src/components/forms/FormErrorSummary.tsx`
- Create: `frontend/src/components/forms/applyApiErrors.ts`
- Create: `frontend/src/components/forms/applyApiErrors.test.ts`
- Create: `frontend/src/hooks/useDebouncedValue.ts`
- Create: `frontend/src/hooks/useCollectionParams.ts`
- Create: `frontend/src/hooks/useCollectionParams.test.tsx`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**

- Consumes: `Pagination`, `ApiError`, React Router search parameters, Material UI.
- Produces: `Column<T>`, `DataTable<T>`, `CollectionToolbar`, `PaginationControls`, `AsyncContent`, `ConfirmActionDialog`, `StatusChip`, `useToast()`, `applyApiErrors()`, `useCollectionParams()`, `previousPageAfterRemoval()`.

- [ ] **Step 1: Define the collection contracts**

```ts
export interface Column<T> {
  id: string;
  header: string;
  sortField?: string;
  align?: 'left' | 'center' | 'right';
  render(row: T): React.ReactNode;
}

export interface CollectionParams {
  page: number;
  per_page: number;
  search?: string;
  sort: string;
  filters: Record<string, string>;
}

export interface UseCollectionParamsOptions {
  filterKeys: readonly string[];
  defaultSort: string;
  defaultPerPage?: number;
}
```

- [ ] **Step 2: Write failing state and error-mapping tests**

Pin URL parsing, invalid numeric fallback, debounced search, filter reset to page 1, and the last-row case:

```ts
describe('previousPageAfterRemoval', () => {
  it('returns the preceding page after removing the only row from a later page', () => {
    expect(previousPageAfterRemoval({ page: 3, rowsOnPage: 1 })).toBe(2);
  });

  it('keeps the current page when rows remain', () => {
    expect(previousPageAfterRemoval({ page: 3, rowsOnPage: 2 })).toBe(3);
  });
});

it('maps matching API fields and retains unmatched errors in the summary', () => {
  const setError = vi.fn();
  const unmatched = applyApiErrors(
    { email: ['Invalid email.'], request: ['Try again.'] },
    new Set(['email']),
    setError,
  );
  expect(setError).toHaveBeenCalledWith('email', {
    type: 'server',
    message: 'Invalid email.',
  });
  expect(unmatched).toEqual(['Try again.']);
});
```

- [ ] **Step 3: Run primitive tests and confirm the red state**

Run: `npm test -- src/components src/hooks`

Expected: FAIL because the state helpers, hook, and form mapping do not exist.

- [ ] **Step 4: Implement URL-owned collection state**

`useCollectionParams()` reads `page`, `per_page`, `search`, `sort`, and allowed filter keys from `useSearchParams()`. It clamps invalid `page`/`per_page` values to defaults, omits empty values, resets `page` to `1` when search/filter/sort changes, and provides named setters instead of exposing raw mutation.

`useDebouncedValue(value, 300)` controls search requests. The text input updates immediately; URL state updates only after the debounce.

- [ ] **Step 5: Implement accessible shared primitives**

`DataTable<T>` renders semantic `TableHead` cells, `aria-sort` for active sorting, a required `getRowId(row)` callback, and caller-supplied row actions. `AsyncContent` chooses exactly one of loading skeleton, retryable error alert, purposeful empty state, or children. `ConfirmActionDialog` names the record and action, traps focus through Material UI, disables confirmation while pending, and restores focus on close.

`ToastProvider` exposes:

```ts
export interface ToastInput {
  severity: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

export function useToast(): { showToast(input: ToastInput): void };
```

- [ ] **Step 6: Run shared primitive checks**

Run:

```powershell
npm test -- src/components src/hooks
npm run typecheck
npm run lint
npm run format
```

Expected: primitive tests and static checks pass.

- [ ] **Step 7: Commit shared UI primitives**

```powershell
git add frontend/src/components frontend/src/hooks frontend/src/app/providers.tsx
git commit -m "feat: add reusable frontend data controls"
```

---

### Task 6: Implement the Students Reference Slice

**Files:**

- Create: `frontend/src/features/students/students.types.ts`
- Create: `frontend/src/features/students/students.api.ts`
- Create: `frontend/src/features/students/students.queries.ts`
- Create: `frontend/src/features/students/student.schema.ts`
- Create: `frontend/src/features/students/StudentsPage.tsx`
- Create: `frontend/src/features/students/StudentFormDialog.tsx`
- Create: `frontend/src/features/students/StudentDetailsPage.tsx`
- Create: `frontend/src/features/students/StudentsPage.test.tsx`
- Create: `frontend/src/features/students/StudentFormDialog.test.tsx`
- Create: `frontend/src/features/programs/programs.types.ts`
- Create: `frontend/src/features/programs/programs.api.ts`
- Create: `frontend/src/features/programs/programs.queries.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/routes.ts`

**Interfaces:**

- Consumes: shared API client, collection primitives, current role, TanStack Query, `GET/POST/PATCH/DELETE /students`, `GET /programs`.
- Produces: `Student`, `StudentInput`, `StudentListParams`, `studentKeys`, `useStudents()`, `useStudent()`, `StudentsPage`, `StudentFormDialog`, `StudentDetailsPage`; reusable `Program` and active-program option query.

- [ ] **Step 1: Define backend-faithful student contracts and schema**

```ts
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'WITHDRAWN';

export interface Student {
  id: number;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  program_id: number;
  year_level: number;
  status: StudentStatus;
  birth_date: string;
  email: string | null;
  contact_number: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentInput {
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string;
  email: string | null;
  contact_number: string | null;
  address: string | null;
  program_id: number;
  year_level: number;
  status: StudentStatus;
}

export type StudentSummary = Pick<
  Student,
  | 'id'
  | 'student_number'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'suffix'
  | 'program_id'
  | 'year_level'
  | 'status'
>;
```

The Zod schema enforces required trimmed number/name/date/program fields, year levels 1-6, optional valid email, and converts blank nullable strings to `null`.

- [ ] **Step 2: Write failing list behavior tests with MSW**

Cover the required backend integration:

```tsx
it('sends search, two filters, sorting, and pagination to the backend', async () => {
  const user = userEvent.setup();
  renderApp(<StudentsPage />, {
    route: '/app/students?page=2&program_id=1&year_level=3&sort=last_name',
  });
  expect(await screen.findByText('2026-00001')).toBeInTheDocument();
  await user.type(
    screen.getByRole('searchbox', { name: 'Search students' }),
    'dela',
  );
  await waitFor(() =>
    expect(lastStudentsRequest.searchParams.get('search')).toBe('dela'),
  );
  expect(lastStudentsRequest.searchParams.get('program_id')).toBe('1');
  expect(lastStudentsRequest.searchParams.get('year_level')).toBe('3');
  expect(lastStudentsRequest.searchParams.get('page')).toBe('1');
});
```

Also test loading, empty, retryable network error, backend pagination metadata, sort changes, narrow row actions, and no unauthorized create button for a read-only role.

- [ ] **Step 3: Write failing form and mutation tests**

Cover create success, edit population, server `422` mapping, duplicate-number `409`, preserved input, confirmation, deactivate `204`, targeted query invalidation, and page recovery after deactivating the last row.

- [ ] **Step 4: Run student tests and confirm the red state**

Run: `npm test -- src/features/students`

Expected: FAIL because the student modules and route do not exist.

- [ ] **Step 5: Implement student API functions and query hooks**

Expose:

```ts
export function listStudents(
  params: StudentListParams,
  signal?: AbortSignal,
): Promise<PaginatedEnvelope<Student>>;
export function getStudent(
  id: number,
  signal?: AbortSignal,
): Promise<SuccessEnvelope<Student>>;
export function createStudent(
  input: StudentInput,
): Promise<SuccessEnvelope<Student>>;
export function updateStudent(
  id: number,
  input: Partial<StudentInput>,
): Promise<SuccessEnvelope<Student>>;
export function deactivateStudent(id: number): Promise<void>;

export const studentKeys = {
  all: ['students'] as const,
  lists: () => ['students', 'list'] as const,
  list: (params: StudentListParams) => ['students', 'list', params] as const,
  detail: (id: number) => ['students', 'detail', id] as const,
};
```

List query parameters are `page`, `per_page`, `search`, `program_id`, `year_level`, `status`, and `sort`. Program options call `/programs?per_page=100&status=ACTIVE&sort=code`.

- [ ] **Step 6: Implement the student collection, form, and detail screen**

Use explicit columns for student number, full name, program, year level, status, and actions. The form contains every writable backend field. Details display private fields only when the backend returns the full representation; instructor summary responses must render without assuming contact, birth-date, address, or timestamps exist.

On successful mutation, show the backend success message, invalidate student lists and the affected detail, close the dialog, and use `previousPageAfterRemoval()` after deactivation.

- [ ] **Step 7: Register student routes and role rules**

Add `/app/students` for Administrator and Staff. Add `/app/students/:studentId` for Administrator, Staff, Instructor, and Student, relying on the backend for object authorization. Do not expose mutation controls to Instructor or Student.

- [ ] **Step 8: Run the student slice checks**

Run:

```powershell
npm test -- src/features/students
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: student tests and all checks pass.

- [ ] **Step 9: Commit the student slice**

```powershell
git add frontend/src/features/students frontend/src/features/programs frontend/src/app/router.tsx frontend/src/app/routes.ts
git commit -m "feat: integrate student management frontend"
```

---

### Task 7: Complete Programs Management

**Files:**

- Modify: `frontend/src/features/programs/programs.types.ts`
- Modify: `frontend/src/features/programs/programs.api.ts`
- Modify: `frontend/src/features/programs/programs.queries.ts`
- Create: `frontend/src/features/programs/program.schema.ts`
- Create: `frontend/src/features/programs/ProgramsPage.tsx`
- Create: `frontend/src/features/programs/ProgramFormDialog.tsx`
- Create: `frontend/src/features/programs/ProgramsPage.test.tsx`
- Create: `frontend/src/features/programs/ProgramFormDialog.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: program option API started by Task 6, collection primitives, `/programs` CRUD contract.
- Produces: complete `Program`, `ProgramInput`, `ProgramListParams`, `programKeys`, management page and form.

- [ ] **Step 1: Complete program types and validation**

```ts
export type LifecycleStatus = 'ACTIVE' | 'INACTIVE';

export interface Program {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: LifecycleStatus;
  created_at: string;
  updated_at: string;
}

export interface ProgramInput {
  code: string;
  name: string;
  description: string | null;
  status: LifecycleStatus;
}
```

The schema trims code/name, requires both, enforces the backend maximums (20 and 150), and maps a blank description to `null`.

- [ ] **Step 2: Write failing program screen and form tests**

Test search, status filter, sorting, pagination, create, edit, duplicate-code `409`, field `422`, deactivate confirmation, loading, empty, and retry. Assert the request uses only `search`, `status`, `sort`, `page`, and `per_page`.

- [ ] **Step 3: Run program tests and confirm the red state**

Run: `npm test -- src/features/programs`

Expected: FAIL because management components and mutations do not exist.

- [ ] **Step 4: Implement program API, queries, page, and form**

Use `POST` for create, `PATCH` for edit, and `DELETE` for deactivate. Invalidate `programKeys.lists()` and refresh `programKeys.detail(id)` after edits. Reuse `StatusChip`, but keep program columns and form fields domain-specific.

- [ ] **Step 5: Run program checks**

Run:

```powershell
npm test -- src/features/programs
npm run typecheck
npm run lint
npm run format
```

Expected: all program tests and static checks pass.

- [ ] **Step 6: Commit programs management**

```powershell
git add frontend/src/features/programs frontend/src/app/router.tsx
git commit -m "feat: add programs frontend"
```

---

### Task 8: Implement Courses Management

**Files:**

- Create: `frontend/src/features/courses/courses.types.ts`
- Create: `frontend/src/features/courses/courses.api.ts`
- Create: `frontend/src/features/courses/courses.queries.ts`
- Create: `frontend/src/features/courses/course.schema.ts`
- Create: `frontend/src/features/courses/CoursesPage.tsx`
- Create: `frontend/src/features/courses/CourseFormDialog.tsx`
- Create: `frontend/src/features/courses/CoursesPage.test.tsx`
- Create: `frontend/src/features/courses/CourseFormDialog.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: collection/form primitives, `LifecycleStatus`, `/courses` CRUD contract.
- Produces: `Course`, `CourseInput`, `CourseListParams`, `courseKeys`, course option query, management page and form.

- [ ] **Step 1: Define course contracts and validation**

```ts
export interface Course {
  id: number;
  course_code: string;
  course_title: string;
  description: string | null;
  units: number;
  status: LifecycleStatus;
  created_at: string;
  updated_at: string;
}

export interface CourseInput {
  course_code: string;
  course_title: string;
  description: string | null;
  units: number;
  status: LifecycleStatus;
}
```

The schema requires code/title, restricts units to a positive number with one decimal place, and maps blank description to `null`.

- [ ] **Step 2: Write failing course tests**

Cover search, status filter, code/title/units sorting, pagination, create/edit, duplicate code `409`, units `422`, deactivate `204`, empty and network states, and active-course option retrieval for later offering forms.

- [ ] **Step 3: Run course tests and confirm the red state**

Run: `npm test -- src/features/courses`

Expected: FAIL because the course module does not exist.

- [ ] **Step 4: Implement the course module and route**

Implement the typed API, query-key factory, page, resource-specific form, mutation feedback, invalidation, and `/app/courses` route for Administrator and Staff.

- [ ] **Step 5: Run course checks**

Run:

```powershell
npm test -- src/features/courses
npm run typecheck
npm run lint
npm run format
```

Expected: all course tests and static checks pass.

- [ ] **Step 6: Commit courses management**

```powershell
git add frontend/src/features/courses frontend/src/app/router.tsx
git commit -m "feat: add courses frontend"
```

---

### Task 9: Implement Academic Terms Management

**Files:**

- Create: `frontend/src/features/academic-terms/academicTerms.types.ts`
- Create: `frontend/src/features/academic-terms/academicTerms.api.ts`
- Create: `frontend/src/features/academic-terms/academicTerms.queries.ts`
- Create: `frontend/src/features/academic-terms/academicTerm.schema.ts`
- Create: `frontend/src/features/academic-terms/AcademicTermsPage.tsx`
- Create: `frontend/src/features/academic-terms/AcademicTermFormDialog.tsx`
- Create: `frontend/src/features/academic-terms/AcademicTermsPage.test.tsx`
- Create: `frontend/src/features/academic-terms/AcademicTermFormDialog.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: collection/form primitives and `/academic-terms` CRUD contract.
- Produces: `AcademicTerm`, `AcademicTermInput`, `AcademicTermListParams`, `academicTermKeys`, active/non-closed term options, management page and form.

- [ ] **Step 1: Define academic-term types and cross-field validation**

```ts
export type AcademicTermName = 'FIRST_SEMESTER' | 'SECOND_SEMESTER' | 'SUMMER';
export type AcademicTermStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';

export interface AcademicTerm {
  id: number;
  academic_year: string;
  term: AcademicTermName;
  start_date: string;
  end_date: string;
  status: AcademicTermStatus;
  created_at: string;
  updated_at: string;
}

export interface AcademicTermInput {
  academic_year: string;
  term: AcademicTermName;
  start_date: string;
  end_date: string;
  status: AcademicTermStatus;
}
```

The Zod schema accepts `YYYY-YYYY`, requires both ISO dates, and adds an `end_date` issue when `start_date >= end_date`.

- [ ] **Step 2: Write failing academic-term tests**

Test academic-year search, term/status filters, date sorting, pagination, create/edit, duplicate year/term `409`, date-order client error, backend `422`, close confirmation, and active/non-closed option queries.

- [ ] **Step 3: Run term tests and confirm the red state**

Run: `npm test -- src/features/academic-terms`

Expected: FAIL because the academic-term module does not exist.

- [ ] **Step 4: Implement the academic-term module and route**

Build `/app/academic-terms` for Administrator and Staff. Label `DELETE` as "Close term," not permanent deletion. Render enum labels as "First semester," "Second semester," and "Summer" while sending exact uppercase values.

- [ ] **Step 5: Run academic-term checks**

Run:

```powershell
npm test -- src/features/academic-terms
npm run typecheck
npm run lint
npm run format
```

Expected: all term tests and static checks pass.

- [ ] **Step 6: Commit academic terms**

```powershell
git add frontend/src/features/academic-terms frontend/src/app/router.tsx
git commit -m "feat: add academic terms frontend"
```

---

### Task 10: Implement Course Offerings and Authorized Rosters

**Files:**

- Create: `frontend/src/features/course-offerings/courseOfferings.types.ts`
- Create: `frontend/src/features/course-offerings/courseOfferings.api.ts`
- Create: `frontend/src/features/course-offerings/courseOfferings.queries.ts`
- Create: `frontend/src/features/course-offerings/courseOffering.schema.ts`
- Create: `frontend/src/features/course-offerings/CourseOfferingsPage.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingFormDialog.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingDetailsPage.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingRosterPage.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingsPage.test.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingFormDialog.test.tsx`
- Create: `frontend/src/features/course-offerings/CourseOfferingRosterPage.test.tsx`
- Create: `frontend/src/features/instructors/instructors.types.ts`
- Create: `frontend/src/features/instructors/instructors.api.ts`
- Create: `frontend/src/features/instructors/instructors.queries.ts`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: active courses, non-closed terms, `/instructors`, scoped `/course-offerings`, nested roster endpoint, role permissions.
- Produces: `CourseOffering`, `CourseOfferingInput`, `CourseOfferingListParams`, `InstructorOption`, `courseOfferingKeys`, offering pages, form, and roster.

- [ ] **Step 1: Define offering and instructor contracts**

```ts
export type CourseOfferingStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface InstructorOption {
  id: number;
  name: string;
}

export interface CourseOffering {
  id: number;
  course_id: number;
  academic_term_id: number;
  instructor_id: number;
  section: string;
  schedule: string;
  room: string | null;
  capacity: number;
  status: CourseOfferingStatus;
  course: {
    id: number;
    course_code: string;
    course_title: string;
    units: number;
  };
  academic_term: {
    id: number;
    academic_year: string;
    term: AcademicTermName;
    start_date: string;
    end_date: string;
  };
  instructor: { id: number; name: string };
  created_at: string;
  updated_at: string;
}
```

The input schema requires positive IDs and capacity, trimmed section/schedule, optional room, and an allowed status.

- [ ] **Step 2: Write failing scoped-list and role tests**

For Administrator/Staff, test search, course/term/instructor/status filters, sorting, pagination, and create controls. For Instructor and Student, test the same list renders backend-scoped results with no mutation controls. Assert the UI never changes pagination totals client-side.

- [ ] **Step 3: Write failing form reference-state tests**

Test that the form loads active courses, non-closed terms, and active instructors; identifies each option by name plus ID; disables submit while any required option query is loading or failed; shows a retry action on failure; and sends exact IDs only after all choices are valid.

```tsx
it('does not allow guessed instructor identifiers when options fail', async () => {
  server.use(http.get(`${API_BASE}/instructors`, () => HttpResponse.error()));
  renderApp(<CourseOfferingFormDialog open onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Instructor options are unavailable',
  );
  expect(
    screen.getByRole('button', { name: 'Create offering' }),
  ).toBeDisabled();
});
```

- [ ] **Step 4: Write failing roster and lifecycle tests**

Cover authorized roster pagination/search, Instructor access to an assigned roster, Student route denial, backend `403`, duplicate section `409`, invalid instructor `422`, and cancel confirmation through `DELETE`.

- [ ] **Step 5: Run offering tests and confirm the red state**

Run: `npm test -- src/features/course-offerings`

Expected: FAIL because the offering and instructor frontend modules do not exist.

- [ ] **Step 6: Implement offering/instructor API and queries**

Use endpoint parameters exactly: `page`, `per_page`, `search`, `course_id`, `academic_term_id`, `instructor_id`, `status`, and `sort`. Implement `/course-offerings/{id}/students` with `page`, `per_page`, `search`, `status`, and `sort`. The instructor option query calls `/instructors?per_page=100&sort=name` and is enabled only for Administrator or Staff.

- [ ] **Step 7: Implement offering pages, form, and roster**

Show embedded course, term, and instructor names from offering responses. The form uses Autocomplete controls backed by verified options. Administrator/Staff receive create/edit/cancel. Instructor receives assigned offering details and roster navigation. Student receives read-only authorized details only. Render safe roster student summaries without expecting contact fields.

- [ ] **Step 8: Register offering and roster routes**

Register `/app/course-offerings`, `/app/course-offerings/:offeringId`, and `/app/course-offerings/:offeringId/roster`. Restrict the roster route to Administrator, Staff, and Instructor; rely on the backend for assigned-instructor object checks.

- [ ] **Step 9: Run offering checks**

Run:

```powershell
npm test -- src/features/course-offerings src/features/instructors
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: offering, reference-state, roster, and role tests pass; all checks exit 0.

- [ ] **Step 10: Commit offerings and rosters**

```powershell
git add frontend/src/features/course-offerings frontend/src/features/instructors frontend/src/app/router.tsx
git commit -m "feat: integrate course offerings and rosters"
```

---

### Task 11: Implement Enrollment Workflows

**Files:**

- Create: `frontend/src/features/enrollments/enrollments.types.ts`
- Create: `frontend/src/features/enrollments/enrollments.api.ts`
- Create: `frontend/src/features/enrollments/enrollments.queries.ts`
- Create: `frontend/src/features/enrollments/enrollment.schema.ts`
- Create: `frontend/src/features/enrollments/EnrollmentsPage.tsx`
- Create: `frontend/src/features/enrollments/EnrollmentFormDialog.tsx`
- Create: `frontend/src/features/enrollments/StudentEnrollmentsPage.tsx`
- Create: `frontend/src/features/enrollments/EnrollmentsPage.test.tsx`
- Create: `frontend/src/features/enrollments/EnrollmentFormDialog.test.tsx`
- Create: `frontend/src/features/enrollments/StudentEnrollmentsPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: student and offering option queries, `/enrollments`, `/students/{studentId}/enrollments`, current user and role.
- Produces: `Enrollment`, `EnrollmentInput`, `EnrollmentListParams`, `enrollmentKeys`, general and student-scoped enrollment pages and form.

- [ ] **Step 1: Define enrollment contracts and validation**

```ts
export type EnrollmentStatus =
  'ENROLLED' | 'DROPPED' | 'COMPLETED' | 'CANCELLED';

export interface Enrollment {
  id: number;
  student_id: number;
  course_offering_id: number;
  enrollment_date: string;
  status: EnrollmentStatus;
  student: StudentSummary;
  course_offering: CourseOffering;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentInput {
  student_id: number;
  course_offering_id: number;
  enrollment_date: string;
  status: EnrollmentStatus;
}
```

The schema requires positive student/offering IDs and an ISO enrollment date.

- [ ] **Step 2: Write failing scoped-list tests**

Cover general list search, student/offering/term/instructor/status filters, sorting, pagination, Instructor backend-scoped results, Student own results, loading, empty, `403`, and network failure.

- [ ] **Step 3: Write failing enrollment mutation tests**

Cover Administrator/Staff create, update, cancel, duplicate `409`, full-capacity `409`, invalid references `422`, and reference-query failure disabling submission. Assert Instructor and Student see no enrollment mutation controls.

- [ ] **Step 4: Write failing student-nested route tests**

Test `/app/students/:studentId/enrollments` for Administrator/Staff, assigned Instructor, and owning Student. Assert a substituted unauthorized ID renders the backend `403` state rather than silently returning an empty list.

- [ ] **Step 5: Run enrollment tests and confirm the red state**

Run: `npm test -- src/features/enrollments`

Expected: FAIL because the enrollment module does not exist.

- [ ] **Step 6: Implement enrollment API and query keys**

Implement general and nested list functions, create, patch, and cancel. Query keys must include scope:

```ts
export const enrollmentKeys = {
  all: ['enrollments'] as const,
  list: (params: EnrollmentListParams) =>
    ['enrollments', 'list', params] as const,
  forStudent: (studentId: number, params: EnrollmentListParams) =>
    ['enrollments', 'student', studentId, params] as const,
  detail: (id: number) => ['enrollments', 'detail', id] as const,
};
```

- [ ] **Step 7: Implement enrollment pages and form**

Use student labels with number and name, and offering labels with course, term, section, and instructor. Only `OPEN` offerings are selectable for create. If option queries fail, disable submit and provide retry. Show backend conflict text for duplicate or capacity failures without inventing client-side seat calculations.

- [ ] **Step 8: Register enrollment routes and run checks**

Register `/app/enrollments` and `/app/students/:studentId/enrollments`, then run:

```powershell
npm test -- src/features/enrollments
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: all enrollment and static/build checks pass.

- [ ] **Step 9: Commit enrollment workflows**

```powershell
git add frontend/src/features/enrollments frontend/src/app/router.tsx
git commit -m "feat: integrate enrollment workflows"
```

---

### Task 12: Implement Grade Workflows

**Files:**

- Create: `frontend/src/features/grades/grades.types.ts`
- Create: `frontend/src/features/grades/grades.api.ts`
- Create: `frontend/src/features/grades/grades.queries.ts`
- Create: `frontend/src/features/grades/grade.schema.ts`
- Create: `frontend/src/features/grades/GradesPage.tsx`
- Create: `frontend/src/features/grades/GradeFormDialog.tsx`
- Create: `frontend/src/features/grades/StudentGradesPage.tsx`
- Create: `frontend/src/features/grades/GradesPage.test.tsx`
- Create: `frontend/src/features/grades/GradeFormDialog.test.tsx`
- Create: `frontend/src/features/grades/StudentGradesPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: enrollment option query, `/grades`, `/students/{studentId}/grades`, role permissions.
- Produces: `Grade`, `GradeInput`, `GradeListParams`, `gradeKeys`, general and student-scoped grade pages and form.

- [ ] **Step 1: Define grade contracts and conditional validation**

```ts
export type GradeStatus = 'DRAFT' | 'PUBLISHED' | 'VOIDED';

export interface Grade {
  id: number;
  enrollment_id: number;
  midterm_grade: number | null;
  final_grade: number | null;
  remarks: string | null;
  status: GradeStatus;
  enrollment: Enrollment;
  created_at: string;
  updated_at: string;
}

export interface GradeInput {
  enrollment_id: number;
  midterm_grade: number | null;
  final_grade: number | null;
  remarks: string | null;
  status: GradeStatus;
}
```

The schema allows null draft scores, restricts numbers to 0-100 with at most two decimal places, and requires both scores when status is `PUBLISHED`. The enrollment ID is immutable during edit.

- [ ] **Step 2: Write failing scoped grade-list tests**

Cover search; enrollment/student/offering/term/instructor/status filters; score sorting; pagination; Instructor assigned results; Student own published-only results; and loading, empty, `403`, and network states.

- [ ] **Step 3: Write failing grade form and authorization tests**

Cover Administrator/Staff create/update/void, assigned Instructor create/update without void, Student no mutation, publish-with-missing-score client error, backend `422`, duplicate grade `409`, unauthorized `403`, and enrollment-option failure disabling submit.

- [ ] **Step 4: Write failing nested student-grade tests**

Test the nested route for allowed roles and verify that Student views do not display `DRAFT` or `VOIDED` rows returned by a deliberately invalid mock; the UI should reject the unexpected payload from its visible list rather than expose non-published grades.

- [ ] **Step 5: Run grade tests and confirm the red state**

Run: `npm test -- src/features/grades`

Expected: FAIL because the grade module does not exist.

- [ ] **Step 6: Implement grade API, queries, pages, and form**

Use `POST` for create and `PATCH` for edits or voiding. Never add a grade `DELETE`. Instructor enrollment choices come only from backend-scoped enrollment queries. Show course, term, section, student, scores, remarks, and status without calculating GPA, average, or pass/fail.

- [ ] **Step 7: Register grade routes and run checks**

Register `/app/grades` and `/app/students/:studentId/grades`, then run:

```powershell
npm test -- src/features/grades
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: all grade and static/build checks pass.

- [ ] **Step 8: Commit grade workflows**

```powershell
git add frontend/src/features/grades frontend/src/app/router.tsx
git commit -m "feat: integrate grade workflows"
```

---

### Task 13: Implement Administrator Users and Roles

**Files:**

- Create: `frontend/src/features/users/users.types.ts`
- Create: `frontend/src/features/users/users.api.ts`
- Create: `frontend/src/features/users/users.queries.ts`
- Create: `frontend/src/features/users/user.schema.ts`
- Create: `frontend/src/features/users/UsersPage.tsx`
- Create: `frontend/src/features/users/UserFormDialog.tsx`
- Create: `frontend/src/features/users/UsersPage.test.tsx`
- Create: `frontend/src/features/users/UserFormDialog.test.tsx`
- Create: `frontend/src/features/roles/roles.types.ts`
- Create: `frontend/src/features/roles/roles.api.ts`
- Create: `frontend/src/features/roles/roles.queries.ts`
- Create: `frontend/src/features/roles/role.schema.ts`
- Create: `frontend/src/features/roles/RolesPage.tsx`
- Create: `frontend/src/features/roles/RoleFormDialog.tsx`
- Create: `frontend/src/features/roles/RolesPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**

- Consumes: `/users`, `/roles`, student options, Administrator role guard.
- Produces: `UserAccount`, `UserInput`, `Role`, `RoleUpdateInput`, account and role query keys, Administrator pages and forms.

- [ ] **Step 1: Define account and role contracts**

```ts
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  role: { code: RoleCode; name: string };
  student_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  role_id: number;
  student_id: number | null;
  status: UserStatus;
}

export interface Role {
  id: number;
  code: RoleCode;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleUpdateInput {
  name?: string;
  description?: string | null;
}
```

The user schema requires password length 8+ on create, makes password optional on edit, requires a Student role for a non-null `student_id`, and clears `student_id` when another role is selected. The role schema permits only name and description.

- [ ] **Step 2: Write failing users tests**

Cover search, role/status filters, sorting, pagination, create, edit without changing password, explicit password change, email conflict `409`, linked-student conflict `409`, invalid role/student `422`, deactivate, last-administrator `409`, option-query failure, and hidden routes for non-Administrators.

- [ ] **Step 3: Write failing roles tests**

Cover search, active filter, sorting, pagination, detail, allowed name/description edit, backend `422`, and read-only display for code and active status. Assert no create or delete role action exists.

- [ ] **Step 4: Run account tests and confirm the red state**

Run: `npm test -- src/features/users src/features/roles`

Expected: FAIL because account and role modules do not exist.

- [ ] **Step 5: Implement Users and Roles modules**

Use role options from `/roles?per_page=100&is_active=true&sort=code`. Load students for the link control only when the selected role code is `STUDENT`. Disable user submission when required option queries fail. Never retain a submitted password in component state after success or failure; reset the password field after the request settles.

Use `PATCH /roles/{id}` for metadata only. Render role code and activation state as immutable values.

- [ ] **Step 6: Register administrator routes and run checks**

Register `/app/users` and `/app/roles` for `ADMINISTRATOR` only, then run:

```powershell
npm test -- src/features/users src/features/roles
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: all account tests and static/build checks pass.

- [ ] **Step 7: Commit account administration**

```powershell
git add frontend/src/features/users frontend/src/features/roles frontend/src/app/router.tsx
git commit -m "feat: add account administration frontend"
```

---

### Task 14: Complete Academic Records, Profile, and Role Dashboards

**Files:**

- Create: `frontend/src/features/academic-records/academicRecords.types.ts`
- Create: `frontend/src/features/academic-records/academicRecords.api.ts`
- Create: `frontend/src/features/academic-records/academicRecords.queries.ts`
- Create: `frontend/src/features/academic-records/AcademicRecordPage.tsx`
- Create: `frontend/src/features/academic-records/AcademicRecordPage.test.tsx`
- Create: `frontend/src/features/profile/ProfilePage.tsx`
- Create: `frontend/src/features/profile/ProfilePage.test.tsx`
- Create: `frontend/src/features/dashboard/DashboardPage.tsx`
- Create: `frontend/src/features/dashboard/DashboardPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/routes.ts`
- Delete: `frontend/src/pages/DashboardPlaceholderPage.tsx`

**Interfaces:**

- Consumes: current user including `student_id`, authorized collection totals, `/students/{studentId}/academic-record`, role metadata.
- Produces: `AcademicRecord`, `AcademicRecordPage`, `ProfilePage`, and a role-aware `DashboardPage`.

- [ ] **Step 1: Define the academic-record read model**

```ts
export interface AcademicRecordCourse {
  grade_id: number;
  enrollment_id: number;
  course_offering_id: number;
  section: string;
  course: {
    id: number;
    course_code: string;
    course_title: string;
    units: number;
  };
  instructor: { id: number; name: string };
  midterm_grade: number | null;
  final_grade: number | null;
  remarks: string | null;
}

export interface AcademicRecordTerm {
  academic_term: {
    id: number;
    academic_year: string;
    term: AcademicTermName;
    start_date: string;
    end_date: string;
    status: AcademicTermStatus;
  };
  courses: AcademicRecordCourse[];
}

export interface AcademicRecord {
  student: StudentSummary;
  program: { id: number; code: string; name: string };
  terms: AcademicRecordTerm[];
}
```

- [ ] **Step 2: Write failing academic-record tests**

Cover term grouping in backend order, course context, stored midterm/final values, no invented GPA/average/pass-fail, empty record, `403` for Instructor, `404`, and network retry.

- [ ] **Step 3: Write failing profile and unlinked-student tests**

```tsx
it('shows a controlled message for a student account without a linked profile', async () => {
  renderApp(<ProfilePage />, {
    auth: studentUser({ student_id: null }),
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This account is not linked to a student profile.',
  );
  expect(
    screen.queryByRole('link', { name: 'Academic record' }),
  ).not.toBeInTheDocument();
});
```

Also assert a linked Student receives own-profile, enrollments, grades, and academic-record links using `currentUser.student_id`; other roles receive identity and role only.

- [ ] **Step 4: Write failing role-dashboard tests**

Assert each role sees only its allowed shortcuts. Administrator/Staff may display authorized totals by requesting `per_page=1`; Instructor uses scoped offerings/grades; Student uses own links and no administrative count queries. A failed summary query shows a compact retryable card without failing the whole dashboard.

- [ ] **Step 5: Run record/profile/dashboard tests and confirm the red state**

Run: `npm test -- src/features/academic-records src/features/profile src/features/dashboard`

Expected: FAIL because the three modules do not exist.

- [ ] **Step 6: Implement academic record, profile, and dashboards**

Render each term as an accessible section with a semantic course table or narrow-screen cards. Preserve backend order. Profile displays name, email, account status, and role. Student links are created only when `student_id` is non-null. Dashboard counts are read from existing authorized pagination metadata; do not add analytics endpoints or calculate private totals client-side.

- [ ] **Step 7: Register final routes and run checks**

Replace the placeholder dashboard; register `/app/profile` for all roles and `/app/students/:studentId/academic-record` for Administrator, Staff, and Student. Run:

```powershell
npm test -- src/features/academic-records src/features/profile src/features/dashboard
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: all record/profile/dashboard and static/build checks pass.

- [ ] **Step 8: Commit final application modules**

```powershell
git add frontend/src/features/academic-records frontend/src/features/profile frontend/src/features/dashboard frontend/src/app frontend/src/pages/DashboardPlaceholderPage.tsx
git commit -m "feat: complete role dashboards and academic records"
```

---

### Task 15: Add Real-Backend Browser Tests, Responsive QA, Documentation, and Submission Evidence

**Files:**

- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/tsconfig.json`
- Create: `frontend/e2e/fixtures/auth.ts`
- Create: `frontend/e2e/auth.spec.ts`
- Create: `frontend/e2e/students.spec.ts`
- Create: `frontend/e2e/authorization.spec.ts`
- Create: `frontend/e2e/academic-workflows.spec.ts`
- Create: `frontend/e2e/responsive-network.spec.ts`
- Create: `frontend/.env.e2e.example`
- Create: `frontend/README.md`
- Create: `docs/FRONTEND_API_INTEGRATION.md`
- Create: `docs/FRONTEND_ARCHITECTURE.md`
- Create: `docs/FRONTEND_TEST_EVIDENCE.md`
- Create: `docs/FRONTEND_DEMONSTRATION.md`
- Create: `docs/evidence/frontend/.gitkeep`
- Modify: `frontend/package.json`
- Modify: `frontend/tsconfig.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/AI_ASSISTED_DEVELOPMENT.md`
- Modify: `docs/SUBMISSION_EVIDENCE.md`
- Modify: `docs/DEVELOPMENT_PLAN.md`
- Modify: `docs/IMPLEMENTATION_DECISIONS.md`
- Modify: `docs/ARCHITECTURE_SECURITY.md`

**Interfaces:**

- Consumes: completed frontend, running seeded FastAPI backend, dedicated test/demonstration database, role credentials supplied only through environment variables.
- Produces: Playwright `test:e2e` suite, desktop and mobile evidence, verified run/test/build documentation, API Integration Map, architecture note, AI log update, and 20-step live demonstration checklist.

- [ ] **Step 1: Install the project-local Chromium browser**

Run from `frontend/`:

```powershell
npx playwright install chromium
```

Expected: the browser matching the locked `@playwright/test` version is installed.

- [ ] **Step 2: Configure Playwright and credential inputs**

Install `dotenv` as a development dependency so Playwright can load a local untracked credential file:

```powershell
npm install --save-dev dotenv
```

Add `frontend/.env.e2e` to `.gitignore`.

Create `frontend/.env.e2e.example` without real secrets:

```dotenv
E2E_BASE_URL=http://127.0.0.1:5173
E2E_ADMIN_EMAIL=admin@example.test
E2E_ADMIN_PASSWORD=replace-me
E2E_STAFF_EMAIL=staff@example.test
E2E_STAFF_PASSWORD=replace-me
E2E_INSTRUCTOR_EMAIL=instructor1@example.test
E2E_INSTRUCTOR_PASSWORD=replace-me
E2E_STUDENT_EMAIL=student@example.test
E2E_STUDENT_PASSWORD=replace-me
```

Configure one Chromium project, `baseURL`, screenshots on failure, trace on first retry, and a Vite `webServer` command. Do not start or reset PostgreSQL from Playwright. Require the real backend and dedicated database to be prepared separately.

Load `.env.e2e` in `playwright.config.ts`, and expose a fail-fast helper from `e2e/fixtures/auth.ts`:

```ts
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: '.env.e2e' });

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in frontend/.env.e2e`);
  }
  return value;
}
```

- [ ] **Step 3: Write the failing authentication browser tests**

```ts
test('rejects invalid credentials and accepts an administrator', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('missing@example.test');
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Invalid email or password',
  );

  await page.getByLabel('Email').fill(requiredEnv('E2E_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(requiredEnv('E2E_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByText('Administrator')).toBeVisible();
});
```

Also test logout, protected navigation without a session, and nested-route refresh after login.

- [ ] **Step 4: Write the failing Students browser flow**

Use a unique student number based on the test run timestamp. Test backend search, program and year filters, pagination control, create, duplicate/validation error, edit, and deactivate with confirmation. Assert the new record is visible after a backend reload, not only local state.

- [ ] **Step 5: Write the failing role and academic workflow tests**

Cover Staff academic navigation without Users/Roles; Instructor assigned offering/roster and grade update; Student own profile/published grades/academic record; a deliberate restricted navigation plus backend `403`; enrollment create and duplicate conflict; and Administrator/Staff management of Programs or Courses, a Term, and an Offering.

- [ ] **Step 6: Write the failing responsive and network tests**

At a 390x844 viewport, verify drawer navigation, Students controls, form usability, and no horizontal page overflow. For network failure, intercept one API request with `route.abort()` and assert an "API server is unreachable" alert plus Retry button; do not stop the shared backend process during the automated suite.

Capture stable evidence after successful waits:

```ts
await page.screenshot({
  path: '../docs/evidence/frontend/students-desktop.png',
  fullPage: true,
});
```

Create corresponding login-error, dashboard, student-form-validation, academic-record, forbidden, and narrow-screen images. Do not capture passwords, tokens, browser storage, or unnecessary sensitive profile data.

- [ ] **Step 7: Run Playwright and resolve failures against the real backend**

Start the configured backend separately, then run from `frontend/`:

```powershell
npm run test:e2e
```

Expected: all Chromium tests pass against real FastAPI responses. Record the command, date, environment description, and pass count in `docs/FRONTEND_TEST_EVIDENCE.md` without recording credentials.

- [ ] **Step 8: Perform the manual accessibility and responsive checklist**

Verify keyboard-only login, skip link, drawer, table actions, dialogs, form errors, focus restoration, non-color-only statuses, 1280px desktop, and 390px narrow layout. Record each check and result in `docs/FRONTEND_TEST_EVIDENCE.md`. Fix any defect and add a component or Playwright regression test before continuing.

- [ ] **Step 9: Write documentation from verified behavior**

Document only commands that have run successfully:

- `frontend/README.md`: prerequisites, install, environment, dev, test, build, backend coordination, and troubleshooting.
- `docs/FRONTEND_API_INTEGRATION.md`: every page/feature to endpoint, method, query/body, and permitted role.
- `docs/FRONTEND_ARCHITECTURE.md`: routes, provider order, auth lifecycle, API client, query keys, forms, component boundaries, errors, CORS, and security.
- `docs/FRONTEND_TEST_EVIDENCE.md`: automated and manual evidence with no secrets.
- `docs/FRONTEND_DEMONSTRATION.md`: all 20 mandatory live tasks in order, including backend disconnect/reconnect.
- Root docs: update project status, both application run instructions, durable decisions, security boundaries, development phase status, AI-assistance log, and submission evidence links.

- [ ] **Step 10: Run the complete frontend quality gate**

Run from `frontend/`:

```powershell
npm test
npm run typecheck
npm run lint
npm run format
npm run build
npm run test:e2e
```

Expected: every unit/component test, type check, lint check, format check, production build, and real-backend browser test passes.

- [ ] **Step 11: Run the complete backend quality gate**

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app tests
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

Expected: all tests/static checks pass, migrations apply, and Alembic reports the current head. Never print the configured `DATABASE_URL`.

- [ ] **Step 12: Audit the Activity III requirements and repository diff**

Check every section of `docs/AI_Assisted_Frontend_Framework_Integration_Laboratory_Activity.md` against implementation or evidence. Verify no token, password, real `.env`, Playwright auth-state file, database credential, raw error, or unrelated user change is staged.

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional Activity III files are selected for the final commit.

- [ ] **Step 13: Commit submission readiness**

```powershell
git add .gitignore frontend README.md docs/FRONTEND_API_INTEGRATION.md docs/FRONTEND_ARCHITECTURE.md docs/FRONTEND_TEST_EVIDENCE.md docs/FRONTEND_DEMONSTRATION.md docs/evidence/frontend docs/AI_ASSISTED_DEVELOPMENT.md docs/SUBMISSION_EVIDENCE.md docs/DEVELOPMENT_PLAN.md docs/IMPLEMENTATION_DECISIONS.md docs/ARCHITECTURE_SECURITY.md
git commit -m "docs: complete activity 3 submission evidence"
```

---

## Implementation Completion Gate

Do not claim Activity III complete until fresh output proves all of the following:

```powershell
# Repository root
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app tests
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current

# frontend/
npm test
npm run typecheck
npm run lint
npm run format
npm run build
npm run test:e2e
```

The handoff must include the exact pass counts, build result, tested browser, current Alembic revision, remaining external demonstration actions, and any intentionally deferred bonus feature.

## Official Tooling References Consulted

- Vite scaffolding and Node requirements: <https://vite.dev/guide/>
- React Router declarative installation: <https://reactrouter.com/start/declarative/installation>
- TanStack Query React installation: <https://tanstack.com/query/latest/docs/framework/react/installation>
- Material UI installation: <https://mui.com/material-ui/getting-started/installation/>
- Vitest setup and requirements: <https://vitest.dev/guide/>
- React Testing Library setup: <https://testing-library.com/docs/react-testing-library/setup/>
- Mock Service Worker: <https://mswjs.io/>
- Playwright browser installation: <https://playwright.dev/docs/browsers>
- Zod installation and TypeScript requirements: <https://zod.dev/>
