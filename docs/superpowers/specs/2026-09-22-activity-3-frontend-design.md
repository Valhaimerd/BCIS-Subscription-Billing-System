# Activity III Frontend Design

**Status:** Approved design
**Date:** 2026-09-22
**Source requirements:** `docs/AI_Assisted_Frontend_Framework_Integration_Laboratory_Activity.md`

## Intent

Build Laboratory Activity III as a separate browser frontend that consumes the completed Laboratory Activity II Student Information Management REST API. The application must demonstrate authenticated, role-aware, responsive academic workflows using real backend data while preserving the backend as the authority for validation, authorization, persistence, and business rules.

The result is intended for laboratory submission, live demonstration, and technical defense. It must be understandable and modifiable by the student, not merely visually complete.

## Success Criteria

- A reviewer can start the existing FastAPI backend and the new frontend as separate applications.
- The frontend authenticates against the real `/api/v1` API and never substitutes hardcoded core data.
- Administrator, staff, instructor, and student accounts receive role-appropriate navigation and workflows.
- Every required academic module is represented through the existing API.
- The Students module demonstrates backend search, filtering, sorting, pagination, create, edit, deactivate, and validation/conflict handling.
- The application handles loading, empty, success, validation, conflict, unauthorized, forbidden, not-found, server-error, and network-error states.
- Core component, integration, and browser tests cover the laboratory's required positive and negative paths.
- The repository contains reproducible environment configuration, setup instructions, integration mapping, architecture notes, test evidence, and demonstration guidance.
- The student can explain the application boundaries, API client, authentication lifecycle, role handling, state management, validation, and testing strategy.

## Scope Boundaries

### In Scope

- A React single-page application in a new top-level `frontend/` directory.
- Login, logout, current-user recovery, protected routes, and role-aware navigation.
- Dashboard, Students, Programs, Courses, Academic Terms, Course Offerings, Enrollments, Grades, Academic Record, Profile, Users, and Roles experiences as permitted by the backend.
- Centralized API access, typed response models, normalized errors, and query caching.
- Responsive and accessible shared layouts, forms, dialogs, tables, status indicators, and feedback.
- Frontend unit, component/integration, and end-to-end tests.
- A minimal backend change that enables an explicit environment-configured CORS origin allowlist.
- Documentation and evidence required by Activity III.

### Out of Scope

- Replacing, duplicating, or bypassing the FastAPI backend.
- Direct browser access to PostgreSQL or any other database.
- Server-side rendering, frontend server routes, server actions, or a second backend.
- Changing existing REST request or response contracts unless a verified integration defect requires separate review.
- Inventing dashboard analytics or academic calculations not exposed by the API.
- Treating hidden navigation or protected React routes as authorization boundaries.
- Offline mutation, real-time collaboration, bulk import/export, password reset, or other optional product features.
- Implementing bonus features until every required acceptance criterion passes.

## Technical Baseline

- **Runtime verified in the workspace:** Node.js 24.19.0 and npm 11.17.0.
- **Application framework:** React with TypeScript and Vite.
- **Routing:** React Router.
- **Server state:** TanStack Query.
- **Forms:** React Hook Form.
- **Client validation:** Zod schemas integrated with React Hook Form.
- **Component system:** Material UI using only freely available packages.
- **HTTP transport:** A focused wrapper around the browser `fetch` API.
- **Unit and component testing:** Vitest, React Testing Library, and `@testing-library/user-event`.
- **HTTP mocking in frontend tests:** Mock Service Worker.
- **Browser testing:** Playwright.
- **Formatting and linting:** the Vite TypeScript baseline plus ESLint and Prettier.

Dependency versions will be recorded by `frontend/package.json` and its npm lockfile when the project is scaffolded. Pre-release packages and paid UI packages are excluded unless separately approved.

## Repository and Runtime Boundaries

The existing backend remains at the repository root. The frontend is a logically separate application:

```text
repository/
|-- app/                       # existing FastAPI backend
|-- migrations/                # existing backend migrations
|-- tests/                     # existing backend tests
|-- frontend/
|   |-- src/                   # React application
|   |-- tests/                 # shared frontend test support
|   |-- e2e/                   # Playwright specifications
|   |-- public/
|   |-- .env.example
|   |-- package.json
|   `-- README.md
`-- docs/
```

The browser sends HTTP requests only through the configured API base URL. The normal local topology is:

```text
React development server: http://localhost:5173
FastAPI server:           http://127.0.0.1:8000
API base URL:             http://127.0.0.1:8000/api/v1
```

No real credential or environment-specific secret may be committed. `frontend/.env.example` contains only a safe API URL placeholder. Runtime builds read `VITE_API_BASE_URL`; source modules do not scatter or hardcode backend origins.

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## Backend Integration Change

The backend currently has no CORS middleware because Activity II was backend-only. Activity III requires explicit browser origins.

The backend settings model will gain an environment-configured list of allowed origins. The default remains an empty list so an origin is never authorized implicitly. When the list is non-empty, FastAPI will install CORS middleware with:

- Exact origins from configuration; no wildcard origin.
- Methods `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`.
- Request headers `Authorization` and `Content-Type`.
- Exposed response header `Location`.
- Credentials disabled because authentication uses an explicit Bearer header rather than cookies.

The safe root environment example will use Pydantic's JSON list format:

```dotenv
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

The safe root environment example will document local Vite origins. Backend tests will verify that a configured origin receives CORS headers and an unconfigured origin does not.

This is an integration setting, not an authorization control. All existing backend authentication, role, object, property, and transaction checks remain unchanged.

## Frontend Architecture

### Application Layers

```text
Routes and layouts
    -> Feature screens and components
        -> Feature query/mutation hooks
            -> Typed API resource modules
                -> Shared fetch client
                    -> Existing /api/v1 backend
```

Each layer has one responsibility:

- **Routes and layouts** decide which screen to render and provide the application shell.
- **Feature screens** compose tables, forms, and detail views for a domain resource.
- **Query and mutation hooks** define cache keys, request parameters, mutations, and targeted invalidation.
- **API resource modules** contain endpoint paths and typed request/response contracts for one backend resource.
- **Shared fetch client** applies base URL, Bearer authentication, JSON handling, abort signals, and error normalization.

Feature files live together by domain rather than placing every component, hook, and type in large global folders.

### Proposed Source Structure

```text
frontend/src/
|-- app/
|   |-- App.tsx
|   |-- providers.tsx
|   |-- router.tsx
|   |-- routes.ts
|   `-- theme.ts
|-- api/
|   |-- client.ts
|   |-- errors.ts
|   |-- envelopes.ts
|   `-- pagination.ts
|-- auth/
|   |-- AuthProvider.tsx
|   |-- auth.api.ts
|   |-- auth.storage.ts
|   |-- permissions.ts
|   `-- ProtectedRoute.tsx
|-- components/
|   |-- feedback/
|   |-- forms/
|   |-- layout/
|   |-- navigation/
|   `-- tables/
|-- features/
|   |-- dashboard/
|   |-- students/
|   |-- programs/
|   |-- courses/
|   |-- academic-terms/
|   |-- course-offerings/
|   |-- enrollments/
|   |-- grades/
|   |-- academic-records/
|   |-- users/
|   |-- roles/
|   `-- profile/
|-- pages/
|   |-- LoginPage.tsx
|   |-- ForbiddenPage.tsx
|   |-- NotFoundPage.tsx
|   `-- ServerUnavailablePage.tsx
|-- test/
|   |-- handlers/
|   |-- factories/
|   |-- server.ts
|   `-- render.tsx
|-- main.tsx
`-- vite-env.d.ts
```

Shared components remain focused. Domain-specific forms and tables stay inside their feature. The design explicitly avoids a single configurable CRUD component that would obscure resource rules and become difficult to test or explain.

## Authentication Design

The backend returns an opaque Bearer token, token type, and expiry. It does not provide a cookie-based flow or refresh-token endpoint.

### Session Lifecycle

1. The login form sends email and password to `POST /api/v1/auth/login`.
2. A successful response stores `access_token` and `expires_at` in `sessionStorage`.
3. The application requests `GET /api/v1/auth/me` and stores the safe current-user representation in the authentication provider.
4. Protected routes wait until session recovery resolves, avoiding a flash of protected content or premature redirect.
5. The API client attaches `Authorization: Bearer <token>` to protected requests.
6. A `401` from a protected request clears the token, current user, and query cache, then redirects to `/login` with a non-sensitive expiry message.
7. A `403` preserves the valid session and displays an access-denied state.
8. Logout calls `POST /api/v1/auth/logout` when a token exists, then clears frontend session data even if the network request fails.
9. The stored `expires_at` is checked before requests and during session recovery; an expired local session is removed without sending stale credentials.

`sessionStorage` preserves the session through a page refresh but ends it when the browser tab session ends. Because browser storage is accessible to JavaScript, the frontend will not render untrusted HTML, use `dangerouslySetInnerHTML`, log tokens, or include tokens in URLs. The token is never treated as a source of authorization claims; the current role comes from `/auth/me`.

## API Client and Contract Design

The API client will use manually maintained TypeScript interfaces that mirror the stable backend schemas. This keeps the code readable during technical defense and avoids introducing generated-client behavior before the core requirements are complete.

Shared types cover:

- `SuccessEnvelope<T>` with `success`, `message`, and `data`.
- `PaginatedEnvelope<T>` with `data` and `meta.pagination`.
- `ApiErrorEnvelope` with `success: false`, `message`, and field-keyed `errors`.
- `Pagination` with `page`, `per_page`, `total`, and `last_page`.
- `ApiError` with HTTP status, safe message, field errors, and a network-error discriminator.

The request helper will:

- Resolve paths against `VITE_API_BASE_URL`.
- Serialize query parameters while omitting empty values.
- Add JSON content headers only when a body exists.
- Add the Bearer header when a session token exists.
- accept an `AbortSignal` from TanStack Query.
- Return `undefined` for `204 No Content` without parsing JSON.
- Validate that a response intended as JSON has a supported envelope.
- Normalize handled backend errors without exposing raw response bodies.
- Convert fetch failures into a network error distinct from HTTP failures.

The client will not parse the backend's human-readable message to decide control flow. HTTP status codes and structured fields determine behavior.

## State Management

State is divided by ownership:

- **Authentication state:** token metadata and current user in `AuthProvider`.
- **Server state:** TanStack Query caches for collections, details, reference options, and academic read models.
- **URL state:** page, page size, search, filters, and sorting for collection screens.
- **Temporary UI state:** open dialogs, confirmation targets, and unsaved local interactions in components.
- **Form state:** React Hook Form instances scoped to each form.

Collection state in the URL makes lists refresh-safe and allows the back button to restore the previous view. Search input is debounced before updating the URL and backend query. Mutations invalidate the narrowest affected query families; the frontend does not manually maintain duplicate authoritative copies of server records.

Query keys use stable domain factories, such as a `students` root with separate list and detail keys. Logging out clears the entire query client so one user's cached data cannot appear in a later session.

## Routing and Navigation

### Public Routes

| Route    | Purpose                                 |
| -------- | --------------------------------------- |
| `/login` | Authenticate with the existing backend. |

### Protected Routes

| Route                                      | Primary audience                                            | Purpose                                       |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| `/app/dashboard`                           | All roles                                                   | Role-relevant summary and module shortcuts.   |
| `/app/profile`                             | All roles                                                   | Current authenticated user identity and role. |
| `/app/students`                            | Administrator, Staff                                        | Student collection and management.            |
| `/app/students/:studentId`                 | Administrator, Staff, authorized Instructor, owning Student | Role-shaped student details.                  |
| `/app/students/:studentId/enrollments`     | Administrator, Staff, authorized Instructor, owning Student | Scoped enrollment history.                    |
| `/app/students/:studentId/grades`          | Administrator, Staff, authorized Instructor, owning Student | Scoped grade history.                         |
| `/app/students/:studentId/academic-record` | Administrator, Staff, owning Student                        | Aggregated published academic record.         |
| `/app/programs`                            | Administrator, Staff                                        | Program collection and management.            |
| `/app/courses`                             | Administrator, Staff                                        | Course collection and management.             |
| `/app/academic-terms`                      | Administrator, Staff                                        | Academic-term collection and management.      |
| `/app/course-offerings`                    | Administrator, Staff, Instructor, Student                   | Backend-scoped offering collection.           |
| `/app/course-offerings/:offeringId`        | Authorized roles                                            | Offering details.                             |
| `/app/course-offerings/:offeringId/roster` | Administrator, Staff, assigned Instructor                   | Authorized offering roster.                   |
| `/app/enrollments`                         | Administrator, Staff, Instructor, Student                   | Backend-scoped enrollment collection.         |
| `/app/grades`                              | Administrator, Staff, Instructor, Student                   | Backend-scoped grade collection.              |
| `/app/users`                               | Administrator                                               | User collection and account management.       |
| `/app/roles`                               | Administrator                                               | Role metadata maintenance.                    |

The router prevents accidental navigation to screens with no valid experience for the current role. The route guard uses the current user's role code, and the navigation menu is derived from the same route metadata. Object-level permissions remain subject to the backend response; the frontend does not infer that knowing an ID grants access.

Unknown routes show a not-found page. Valid sessions that lack a route's required role see a forbidden page. An unauthenticated user attempting a protected URL returns to that URL after successful login when the role permits it.

## Role Experiences

### Administrator

- Access to Users and Roles administration.
- Full academic-resource navigation and management.
- Access to all student profiles, offerings, enrollments, grades, and academic records.

### Staff

- Academic management without Users or Roles navigation.
- Full student, reference-data, offering, enrollment, grade, and academic-record workflows.

### Instructor

- Assigned offerings only, as scoped by the backend.
- Authorized roster views for assigned offerings.
- Grade entry and updates for enrollments in assigned offerings.
- No account administration, reference-data management, enrollment mutation, or academic-record access.

### Student

- Own profile, enrollments, published grades, and academic record.
- Offering information reachable through the student's authorized backend scope.
- No collection enumeration or mutation controls for administrative resources.

Navigation visibility and disabled actions follow these rules for usability. A backend `403` is still handled safely because frontend checks are not security enforcement.

## Screen and Component Design

### Application Shell

- Persistent sidebar on desktop and dismissible drawer on narrow screens.
- Top bar with current page, user name, role, profile entry, and logout.
- Main content landmark with a single page heading.
- Skip link and visible keyboard focus.
- Calm academic-administration theme using a dark navy primary color, neutral surfaces, restrained semantic status colors, and high-readability typography.

### Collection Screen Pattern

Each collection screen composes domain-specific configuration with shared primitives:

- Page title and role-permitted primary action.
- Debounced backend search.
- Resource-specific filters.
- Backend-supported sorting.
- Page and page-size controls driven by response metadata.
- Loading skeleton, meaningful empty state, retryable error state, and populated table.
- Row actions that reflect role and lifecycle status.
- Narrow-screen presentation that keeps actions usable without forcing a full desktop table width.

The Students screen is the reference implementation and must include program and year-level filters, status filtering, sorting, backend pagination, create, edit, deactivate, conflict handling, and field validation.

### Forms

- Every input has a visible label.
- Required and optional fields are distinguishable.
- Client validation catches empty required fields, basic formats, numeric ranges, and internally inconsistent dates where applicable.
- Backend `422` field arrays are applied to matching controls.
- A request-level error area handles fields or errors without a direct control match.
- Submitted values preserve user input after rejected requests.
- Submit controls show progress and prevent accidental duplicate submission.
- Create and edit forms use resource-specific schemas rather than one generic CRUD form.

Client schemas improve usability only. The backend remains authoritative for uniqueness, relationships, authorization, lifecycle transitions, capacity, and concurrent changes.

### Destructive and Lifecycle Actions

Program, student, course, user, offering, and enrollment deletion endpoints perform backend-defined deactivation, cancellation, or equivalent lifecycle changes. The interface will use the actual action language instead of claiming permanent deletion.

Every destructive or lifecycle-changing action requires confirmation that names the affected record and expected outcome. Grade history is preserved by changing status to `VOIDED` where authorized; no frontend grade-delete action exists.

### Dashboard

The dashboard uses only data already available to the role. It displays concise counts or recent-item summaries only when they can be derived from an authorized collection response. It always provides role-relevant navigation shortcuts. No new analytics endpoint is required.

## Required Feature Coverage

| Feature          | Required frontend behavior                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Authentication   | Login, logout, current-user recovery, invalid credentials, expiry, and protected navigation.             |
| Users            | Administrator list, search, filters, pagination, details, create, edit, password update, and deactivate. |
| Roles            | Administrator list, search, filters, pagination, details, and allowed metadata update.                   |
| Students         | Full required collection behavior, authorized details, create, edit, deactivate, and related views.      |
| Programs         | List, search, filter, sort, paginate, create, edit, and deactivate.                                      |
| Courses          | List, search, filter, sort, paginate, create, edit, and deactivate.                                      |
| Academic Terms   | List, search, filter, sort, paginate, create, edit, and close.                                           |
| Course Offerings | Scoped list, filters, details, administrator/staff management, cancel, and authorized roster.            |
| Enrollments      | Scoped list, filters, administrator/staff create and update, cancel, and duplicate/capacity errors.      |
| Grades           | Scoped list, authorized create/update, publish validation, and administrator/staff void workflow.        |
| Academic Record  | Readable term-grouped display for administrator, staff, or owning student.                               |
| Profile          | Current user name, email, status, and role.                                                              |

## Error and Feedback Design

| Condition                   | Frontend behavior                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `400 Bad Request`           | Request-level error with preserved user input.                                                      |
| `401 Unauthorized`          | Clear session and cache, redirect to login, and explain that authentication is required or expired. |
| `403 Forbidden`             | Preserve session and show a dedicated access-denied state.                                          |
| `404 Not Found`             | Show a resource not-found state with a safe route back to the collection.                           |
| `409 Conflict`              | Show the backend conflict message near the action or form.                                          |
| `422 Unprocessable Content` | Map field errors to controls and retain unmatched errors at form level.                             |
| `500+`                      | Show a safe general server-error state with retry when the operation is safe to repeat.             |
| Network failure             | Show backend-unreachable feedback and never leave an infinite loading indicator.                    |

Successful create, update, and lifecycle actions use non-blocking notifications and refresh affected queries. A notification complements rather than replaces the updated screen state.

## Accessibility and Responsive Requirements

- Meet practical WCAG 2.1 AA expectations for contrast, keyboard access, labels, headings, landmarks, focus, and error association.
- Never communicate status through color alone.
- Dialog focus is trapped while open and restored to the triggering control when closed.
- Tables expose real headers; icon-only controls have accessible names.
- Loading announcements avoid repeatedly interrupting screen readers.
- Desktop behavior is verified at 1280 pixels wide.
- Narrow behavior is verified at 390 pixels wide.
- Navigation, forms, dialogs, tables or card alternatives, and primary actions remain usable without horizontal page scrolling at the narrow viewport.

## Security Requirements

- Never store or expose passwords after form submission.
- Never log Bearer tokens, passwords, full error bodies, or sensitive student fields.
- Never put credentials or tokens in URLs.
- Never use browser storage as an authoritative database.
- Clear authentication and query state at logout and on `401`.
- Avoid arbitrary HTML rendering and unsafe DOM injection.
- Render only fields supplied by documented safe response models.
- Use explicit CORS origins; never configure wildcard production access.
- Continue relying on the backend for role, object, property, validation, and integrity enforcement.
- Treat every mutation as potentially rejected because the caller's authorization or the record state may have changed since the screen loaded.

## Testing Strategy

### Unit Tests

Vitest covers focused behavior without rendering full screens:

- Environment and API URL resolution.
- Query-parameter serialization.
- Success, paginated, error, `204`, malformed-response, and network-error handling.
- Authentication storage and expiry.
- Role permission helpers and route metadata.
- Zod validation schemas and backend-field-error mapping.

### Component and Integration Tests

React Testing Library and MSW cover user-visible behavior:

- Valid and invalid login.
- Session recovery, logout, `401` redirect, and `403` rendering.
- Protected and role-restricted routes.
- Student list loading, empty, error, search, filtering, sorting, and pagination.
- Create and edit forms with success, `409`, `422`, and unmatched request errors.
- Confirmation and lifecycle mutation behavior.
- Instructor assigned-offering and grading flows.
- Student own-profile, enrollment, published-grade, and academic-record screens.
- Backend-unreachable and retry states.
- Keyboard interaction and accessible names for critical shared controls.

MSW handlers return the same envelopes and status codes documented by the backend. Shared factories avoid fragile duplicated test payloads.

### End-to-End Tests

Playwright exercises the frontend against a running instance of the real FastAPI backend and a dedicated test or demonstration database. Tests use known role accounts and unique record values to avoid collisions.

Critical flows include:

- Invalid login and valid login.
- Protected route without a session.
- Administrator Students search, filters, pagination, create, edit, validation failure, and deactivate.
- Restricted-role navigation plus a backend `403` scenario.
- Enrollment success and duplicate/conflict handling.
- Authorized grade entry/update and unauthorized grade attempt.
- Student published grades and academic record.
- Nested-route refresh and unknown route.
- Desktop and 390-pixel viewport checks.
- Controlled network failure when the backend is unavailable.

Fast frontend tests remain independent of PostgreSQL. Real-backend browser tests are a separate explicit command because they require configured services and may create or deactivate test records.

### Backend Regression Tests

The existing pytest suite remains required. New backend tests cover only the CORS configuration boundary. All existing authentication, authorization, validation, and resource tests must continue to pass.

## Documentation and Evidence

The completed work will provide:

- Root README instructions for running backend and frontend together, added only after commands are verified.
- `frontend/README.md` for frontend prerequisites, environment, development, test, and build procedures.
- `frontend/.env.example` with a safe API base URL and no secrets.
- API Integration Map from frontend feature to endpoint, method, and role.
- Frontend architecture note covering routes, API client, auth state, queries, components, and error handling.
- AI Development Log entries that record tasks, tools, summarized prompts, results, human review, and evidence without private reasoning.
- Test evidence for automated suites and required negative paths.
- Screenshot or equivalent evidence for major screens and important states.
- A live demonstration checklist aligned with all 20 mandatory Activity III tasks.
- Updates to existing implementation decisions and architecture/security notes for the accepted frontend and CORS choices.

Commands will be documented as working commands only after they have executed successfully in this repository.

## Delivery Sequence

The implementation plan will organize work into independently testable vertical slices:

1. Frontend foundation, theme, providers, test harness, and explicit backend CORS integration.
2. Shared API client, envelopes, errors, authentication storage, and login/session lifecycle.
3. Application shell, route metadata, protected navigation, role handling, and shared feedback components.
4. Students reference slice with collection controls, forms, mutations, and related views.
5. Programs, Courses, and Academic Terms using the established resource patterns.
6. Course Offerings and authorized rosters.
7. Enrollments and conflict/capacity handling.
8. Grades and role-scoped grading workflows.
9. Academic Record, Profile, Users, Roles, and role-relevant dashboard completion.
10. End-to-end integration, responsive/accessibility hardening, documentation, evidence, and final verification.

Each slice includes its own failing tests, minimal implementation, passing checks, documentation impact, and focused commit. Shared abstractions are introduced only when a completed slice demonstrates reuse.

## Acceptance Gate

The implementation is ready for Activity III submission only when all of the following are true:

- The frontend starts and builds without critical errors.
- The backend and frontend remain separate applications.
- The configured application uses the real Activity II API for core data.
- Authentication, logout, session expiry, protected routes, and role-aware navigation work.
- Student CRUD and required collection features use backend data and metadata.
- Programs, Courses, Academic Terms, Course Offerings, Enrollments, Grades, and Academic Record are represented.
- Administrator, staff, instructor, and student flows match backend permissions.
- Backend validation and conflict messages are presented safely and meaningfully.
- Loading, empty, unauthorized, forbidden, not-found, server-error, and network-error states are controlled.
- Desktop and narrow viewport experiences are usable and keyboard accessible.
- No direct database access, replacement backend, embedded secret, token leak, or simulated authentication exists.
- Frontend automated checks, backend regression checks, production build, and real-backend browser checks pass using documented commands.
- Required documentation, evidence, AI log, and demonstration material are complete and current.
