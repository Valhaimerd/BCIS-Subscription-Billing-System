# Authentication Foundation Design

**Status:** Approved for implementation
**Date:** 2026-09-11
**Scope:** Phase 2 authentication foundation for the Student Information Management API

## Objective

Implement secure, database-backed authentication that supports the existing `/api/v1`
contract and supplies reusable identity and role checks for later resource endpoints. This
slice includes login, current-user retrieval, logout, session persistence, password hashing,
and route-level role dependencies. User administration and resource-specific object
authorization remain in the resource slices that own those operations.

## Selected approach

Use opaque Bearer tokens backed by PostgreSQL sessions.

On successful login, the API generates a cryptographically random token and returns it once.
Only a SHA-256 digest of the token is stored. A presented token is hashed before lookup, so a
database disclosure does not directly expose usable session credentials. Logout sets a
revocation timestamp, providing immediate invalidation without a JWT denylist or signing-key
management.

Alternatives considered:

- A JWT with a revocation table adds signing and claim-validation complexity while still
  requiring database state for immediate logout.
- A stateless JWT is smaller but cannot provide immediate server-side invalidation and would
  make current database status and role checks easier to omit accidentally.

## Dependencies and configuration

- Add `pwdlib[argon2]` and use `PasswordHash.recommended()` for password hashing and
  verification.
- Add `email-validator` so Pydantic can validate login email addresses consistently.
- Add `AUTH_TOKEN_TTL_MINUTES` to application settings and `.env.example`, with a default of
  `60` and validation requiring a positive integer.
- No authentication signing secret is required because tokens are random opaque credentials,
  not signed claims.

## Persistence model

Add an `auth_sessions` table through a new Alembic revision and matching SQLAlchemy model.

| Column                     | Rule                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | Database-generated bigint primary key.                                                                                      |
| `user_id`                  | Required foreign key to `users.id`, indexed, with cascading session deletion if an unreferenced user is physically removed. |
| `token_hash`               | Required 64-character lowercase hexadecimal SHA-256 digest with a unique index.                                             |
| `expires_at`               | Required timezone-aware expiration timestamp, indexed for lookup and future cleanup.                                        |
| `revoked_at`               | Nullable timezone-aware timestamp; non-null means the token is invalid.                                                     |
| `created_at`, `updated_at` | Standard timezone-aware audit timestamps.                                                                                   |

Multiple active sessions per user are allowed. Account deactivation or locking immediately
blocks every session because each authenticated request reloads the user and role from the
database. Expired rows may remain until a later maintenance need justifies cleanup; they are
never accepted.

## Public API contract

### `POST /api/v1/auth/login`

Accept an `application/json` body:

```json
{
  "email": "administrator@example.test",
  "password": "correct horse battery staple"
}
```

The email is trimmed and normalized to lowercase. The password is not trimmed or logged.
Unknown emails, incorrect passwords, inactive or locked accounts, inactive roles, and unknown
role codes all return the same `401 Unauthorized` response to avoid account enumeration. A
dummy password hash is verified when no user exists so missing-user and wrong-password paths
have similar computational cost.

Successful login returns `200 OK`:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "access_token": "opaque-token-returned-only-here",
    "token_type": "bearer",
    "expires_at": "2026-09-11T13:00:00Z"
  }
}
```

### `GET /api/v1/auth/me`

Require `Authorization: Bearer <access_token>`. A valid session returns `200 OK` with only:

```json
{
  "success": true,
  "message": "Current user retrieved successfully.",
  "data": {
    "id": 1,
    "name": "System Administrator",
    "email": "administrator@example.test",
    "status": "ACTIVE",
    "role": {
      "code": "ADMINISTRATOR",
      "name": "Administrator"
    }
  }
}
```

Password hashes, session digests, and internal authorization state are never serialized.

### `POST /api/v1/auth/logout`

Require a currently valid Bearer token. Set that session's `revoked_at` and return `204 No
Content` with an empty body. Reusing the token afterward, including a repeated logout, returns
`401 Unauthorized` because the credential is no longer valid.

## Internal components

- `app/security.py`: password hashing and verification, random-token generation, and token
  digesting. These functions have no database or HTTP responsibilities.
- `app/schemas/auth.py`: strict login, token, current-user, role-summary, success, and error
  schemas. Unknown request fields are rejected.
- `app/services/auth.py`: authenticate credentials, create a session, resolve a session and
  current database identity, and revoke a session.
- `app/api/dependencies/auth.py`: extract the Bearer credential, expose `get_current_user`, and
  build `require_roles(...)` dependencies.
- `app/api/v1/auth.py`: the three HTTP endpoints and their OpenAPI descriptions.
- `app/api/errors.py`: shared handled-error construction and request-validation translation
  needed to keep the documented response envelope.

The API uses FastAPI's HTTP Bearer security scheme rather than OAuth password-form input
because this repository's accepted contract requires JSON request bodies. Swagger will still
provide an Authorize control for pasting a Bearer token.

## Request flows

### Login

1. Validate and normalize the JSON input.
2. Query the user and eager-load the role by case-insensitive email.
3. Verify the submitted password, using a dummy hash when no user exists.
4. Confirm that the user is active and the role is active and recognized.
5. Generate 32 random bytes as a URL-safe token, store only its SHA-256 digest and expiration,
   and commit the transaction.
6. Return the raw token once in the success envelope.

### Authenticated request

1. Parse the `Authorization` header as a Bearer credential.
2. Hash the presented token and query the matching session with its user and role.
3. Reject missing, malformed, unknown, revoked, or expired sessions with `401` and
   `WWW-Authenticate: Bearer`.
4. Reject inactive or locked users, inactive roles, and unknown required role codes with
   `401`.
5. Return the current database user to the route or evaluate the route's allowed roles.
6. A valid identity with a disallowed role receives `403 Forbidden`.

## Error behavior

Handled failures follow `docs/API_CONVENTIONS.md`:

```json
{
  "success": false,
  "message": "Invalid email or password.",
  "errors": null
}
```

- Invalid credentials and invalid session credentials return `401` with generic messages.
- Authenticated users with a disallowed role return `403`.
- Invalid request fields return the shared field-keyed `422` validation envelope.
- Malformed JSON returns the shared `400` envelope.
- Unexpected database or server failures are not converted into raw client-visible details.

## Testing strategy

Use test-driven development and exercise real FastAPI routing, SQLAlchemy models, and password
verification. Override only the database dependency where isolation requires it.

Required tests:

- Password hashing does not store plaintext and accepts only the correct password.
- A valid active user with an active required role can log in.
- Wrong passwords and unknown emails return the same `401` shape.
- Inactive and locked users and inactive or unknown roles cannot log in.
- Login creates a session containing the token digest rather than the returned token.
- `/auth/me` returns the safe public user representation.
- Missing, malformed, unknown, expired, and revoked tokens return `401` with the Bearer header.
- Logout returns an empty `204` response and prevents token reuse.
- `require_roles(...)` permits an allowed role and returns `403` for a valid disallowed role.
- Authentication and validation responses are represented accurately in generated OpenAPI.
- The Alembic migration upgrades and downgrades cleanly, and model metadata matches it.

Resource-specific object authorization is tested when students, offerings, enrollments,
grades, and academic-record routes are implemented because those checks require the owning
service queries. The accepted rules in `docs/AUTHORIZATION_RULES.md` remain authoritative.

## Documentation impact

- Record the authentication choice in `docs/IMPLEMENTATION_DECISIONS.md`.
- Add the session table and relationship to `docs/DATA_MODEL.md`.
- Update `docs/DEVELOPMENT_PLAN.md` to distinguish the completed authentication foundation
  from later resource-level authorization enforcement.
- Update `README.md` with verified authentication configuration and usage only after the
  implementation and commands have passed.
- Generated OpenAPI remains the route-level source of truth; an API-client collection will be
  added when stable domain endpoints exist.

## Scope boundary

This design deliberately excludes refresh tokens, password reset, email verification,
rate-limiting, automatic session cleanup, account CRUD, role CRUD, and domain-resource routes.
Those features are either optional or belong to later planned slices. Adding them now would
increase security and testing surface without helping the first required authentication
demonstration.
