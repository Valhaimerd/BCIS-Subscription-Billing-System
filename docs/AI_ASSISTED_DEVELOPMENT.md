# AI-Assisted Development Summary

AI was used as a development assistant throughout Activities II and III for requirements decomposition, implementation planning, FastAPI and SQLAlchemy code, React/TypeScript components, validation and authorization cases, test generation, API integration, debugging, review, and documentation. Work was kept in bounded feature slices and recorded as small commits rather than accepted as one unreviewed application dump.

## Verification workflow

Each meaningful contribution followed the same repository workflow:

1. Compare the requested behavior with the laboratory handout and the existing API/data/security decisions.
2. Inspect the complete request path: schema, router, dependency, service, model, migration, and existing callers.
3. Add focused positive and negative tests with the implementation.
4. Run the relevant tests, then the backend pytest/Ruff/mypy/migration checks and frontend test/type/lint/format/build/browser checks.
5. Review the final diff for accidental scope, debug artifacts, generated files, and exposed secrets.
6. Update OpenAPI-facing descriptions, the Postman collection, README, and focused design notes when behavior changes.

AI suggestions were not treated as proof of correctness. Repository tests exercise authentication, validation, role and object authorization, data integrity, collections, transactions, response redaction, generated OpenAPI, browser navigation, responsive behavior, network failures, and real API mutations. PostgreSQL migrations and the idempotent seeder were also run against the configured local database. The developer remains responsible for reading the implementation and being able to explain, debug, and modify it during assessment.

For Activity III, AI helped translate the backend contract into feature-local query hooks, forms, role-aware routes, component tests, and Playwright journeys. Each generated selector and workflow was checked against actual accessible names and real FastAPI responses. Credentials stayed in ignored environment files; screenshots were captured only after login and never include tokens or browser storage.

## Representative contribution to explain

The enrollment capacity path is a useful demonstration of an AI-assisted contribution because it crosses validation, transactions, database integrity, API behavior, and tests:

- `app/services/enrollments.py` loads the target offering with a row lock before checking an active seat.
- The service verifies that the student is active, the offering is open, the student/offering pair is new, and the number of `ENROLLED` rows is below capacity.
- Reactivation or reassignment repeats the relevant checks; cancelled, dropped, and completed history does not occupy a seat.
- The database unique constraint remains the final protection against duplicate enrollments, and integrity failures become a safe `409` response.
- `tests/test_enrollments_api.py` covers successful enrollment, duplicates, full offerings, invalid references, role restrictions, reassignment, query behavior, nested views, and OpenAPI.

During a demonstration, the developer should be ready to trace that flow, explain why both a row lock and database constraint are used, and make a small requested change without relying on AI output that has not been reviewed.

## Known limits

AI did not replace the need for the student's own final review or live demonstration. Optional production features such as rate limiting, password reset, audit trails, container deployment, CI/CD, offline caching, localization, bulk operations, and dashboard charts were intentionally not added because the laboratory does not require them.
