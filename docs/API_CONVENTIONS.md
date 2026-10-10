# API Conventions

**Status:** Accepted contract. Health, authentication, account administration, all Phase 3 reference resources, Course Offerings, Enrollments, Grades, and Academic Records implement the applicable shared envelopes, validation, authorization, pagination, search, filtering, and sorting rules.

This document defines behavior shared by the Student Information Management API. It complements the laboratory requirements without duplicating every endpoint. Generated OpenAPI at `/openapi.json` is the source of truth for implemented route-specific schemas, parameters, and responses; differences from these shared rules are defects unless explicitly recorded as a new decision.

## General conventions

- All managed endpoints are versioned under `/api/v1`.
- Resource paths use plural nouns and `kebab-case`, such as `/academic-terms` and `/course-offerings`. RPC-style names such as `/getStudents` are not used.
- JSON property names and query parameters use `snake_case`.
- Request and response bodies use `application/json` encoded as UTF-8. A successful `204 No Content` response has no body.
- Resource identifiers are positive integers. Clients cannot assign primary keys, timestamps, password hashes, or other server-managed fields.
- Dates use `YYYY-MM-DD`. Timestamps use ISO 8601 in UTC. Grade and unit values are JSON numbers.
- Enum values use documented uppercase strings such as `ACTIVE` and `FIRST_SEMESTER`.
- Unknown request-body fields and unsupported filter or sort fields are rejected with `422 Unprocessable Content`.

## Resource operations

| Method                   | Meaning                                                           | Successful response                                                    |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /resources`         | Retrieve a bounded collection.                                    | `200 OK` with an array and pagination metadata.                        |
| `GET /resources/{id}`    | Retrieve one resource.                                            | `200 OK`; `404 Not Found` when it does not exist.                      |
| `POST /resources`        | Create a resource.                                                | `201 Created` with the created representation and a `Location` header. |
| `PUT /resources/{id}`    | Replace all client-writable fields where supported.               | `200 OK` with the updated representation.                              |
| `PATCH /resources/{id}`  | Update only supplied fields. At least one field is required.      | `200 OK` with the updated representation.                              |
| `DELETE /resources/{id}` | Deactivate or remove a resource according to its lifecycle rules. | `204 No Content`.                                                      |

`DELETE` is idempotent for an existing but already inactive resource. An identifier that has never existed returns `404`. Academic history is deactivated rather than physically deleted when another record depends on it.

For `PATCH`, an omitted field remains unchanged. Explicit `null` clears a field only when that field is documented as nullable. For `PUT`, every client-writable required field must be present.

## Success responses

Every successful response with content uses this envelope:

```json
{
  "success": true,
  "message": "Student retrieved successfully.",
  "data": {
    "id": 1,
    "student_number": "2026-00001"
  }
}
```

Rules:

- `success` is always `true`.
- `message` is a concise human-readable summary. Clients should use the HTTP status and response fields, not parse this text for control flow.
- `data` contains one object, an array, or another documented result.
- `meta` appears only when supplementary information such as pagination is required.
- Successful responses do not include an `errors` property.

## Collection responses

Collections use page-based pagination and this envelope:

```json
{
  "success": true,
  "message": "Students retrieved successfully.",
  "data": [
    {
      "id": 1,
      "student_number": "2026-00001",
      "first_name": "Ada",
      "last_name": "Lovelace"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 100,
      "last_page": 5
    }
  }
}
```

### Pagination

| Parameter  | Rule                                      |
| ---------- | ----------------------------------------- |
| `page`     | Default `1`; minimum `1`.                 |
| `per_page` | Default `20`; minimum `1`; maximum `100`. |

An empty collection returns `data: []`, `total: 0`, and `last_page: 1`. A valid page beyond the last page returns an empty array rather than an error. Every query uses deterministic ordering with `id` as the final tie-breaker.

### Search, filtering, and sorting

- `search` performs a trimmed, case-insensitive search across the documented fields for that resource. An empty value behaves as no search term.
- Filters use named query parameters and exact matches unless a route documents otherwise. Combined filters use logical `AND`.
- `sort` accepts a comma-separated allowlist. Prefix a field with `-` for descending order, for example `sort=last_name,-created_at`.
- An unsupported sort field, filter field, enum value, or malformed parameter returns `422`.
- Each collection documents its searchable, filterable, and sortable fields in OpenAPI.

The initial student collection supports:

| Capability    | Fields                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| Search        | `student_number`, `first_name`, `middle_name`, `last_name`, `email`           |
| Filter        | `program_id`, `year_level`, `status`                                          |
| Sort          | `id`, `student_number`, `first_name`, `last_name`, `year_level`, `created_at` |
| Default order | `last_name`, `first_name`, `id` ascending                                     |

The Programs collection supports:

| Capability    | Fields                                           |
| ------------- | ------------------------------------------------ |
| Search        | `code`, `name`, `description`                    |
| Filter        | `status`                                         |
| Sort          | `id`, `code`, `name`, `created_at`, `updated_at` |
| Default order | `code`, `id` ascending                           |

The Courses collection supports:

| Capability    | Fields                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| Search        | `course_code`, `course_title`, `description`                             |
| Filter        | `status`                                                                 |
| Sort          | `id`, `course_code`, `course_title`, `units`, `created_at`, `updated_at` |
| Default order | `course_code`, `id` ascending                                            |

The Academic Terms collection supports:

| Capability    | Fields                                                                |
| ------------- | --------------------------------------------------------------------- |
| Search        | `academic_year`                                                       |
| Filter        | `term`, `status`                                                      |
| Sort          | `id`, `academic_year`, `term`, `start_date`, `end_date`, `created_at` |
| Default order | `start_date` descending, then `term` and `id` ascending               |

The Users collection supports:

| Capability    | Fields                                            |
| ------------- | ------------------------------------------------- |
| Search        | `name`, `email`                                   |
| Filter        | `role_id`, `status`                               |
| Sort          | `id`, `name`, `email`, `created_at`, `updated_at` |
| Default order | `name`, `id` ascending                            |

The Roles collection supports:

| Capability    | Fields                                           |
| ------------- | ------------------------------------------------ |
| Search        | `code`, `name`, `description`                    |
| Filter        | `is_active`                                      |
| Sort          | `id`, `code`, `name`, `created_at`, `updated_at` |
| Default order | `code`, `id` ascending                           |

The read-only Instructor Options collection at `GET /api/v1/instructors` supports name
search, `id` or `name` sorting, and standard pagination. It returns only active users
with the active `INSTRUCTOR` role, shaped as `id` and `name` for assignment controls.

User `PUT` replaces all ordinary account fields but preserves the current password when the optional `password` field is omitted. User `DELETE` changes status to `INACTIVE`. Role maintenance intentionally supports only `GET` and `PATCH`: required role codes and activation state are read-only, while names and descriptions may be updated.

The Course Offerings collection supports:

| Capability    | Fields                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Search        | course code/title, academic year, section, schedule, room, instructor name                                |
| Filter        | `course_id`, `academic_term_id`, `instructor_id`, `status`                                                |
| Sort          | `id`, `course_id`, `academic_term_id`, `instructor_id`, `section`, `capacity`, `created_at`, `updated_at` |
| Default order | `course_id`, `academic_term_id`, `section`, `id` ascending                                                |

Course Offering collection scope is applied before filters, counts, ordering, and pagination. `DELETE` changes status to `CANCELLED`. Offering responses embed limited course, term, and instructor summaries; this reference context does not grant access to otherwise unauthorized administrative collections.

The Enrollments collection supports:

| Capability    | Fields                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Search        | student number/name, course code/title, academic year, section                          |
| Filter        | `student_id`, `course_offering_id`, `academic_term_id`, `instructor_id`, `status`       |
| Sort          | `id`, `student_id`, `course_offering_id`, `enrollment_date`, `created_at`, `updated_at` |
| Default order | `enrollment_date` descending, then `id` ascending                                       |

Enrollment collection scope is applied before filters, counts, ordering, and pagination. The same scope and query rules apply to `GET /students/{student_id}/enrollments`, except `student_id` is fixed by the path. `GET /course-offerings/{course_offering_id}/students` fixes the offering through the path and maps the authorized enrollment rows to safe academic student summaries. Administrators and staff may retrieve any roster, instructors only assigned rosters, and students cannot enumerate rosters. Both nested views use the standard bounded pagination metadata. `DELETE` changes enrollment status to `CANCELLED`. Responses exclude private contact and account fields.

The Grades collection supports:

| Capability    | Fields                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Search        | student number/name, course code/title, academic year, section, remarks                            |
| Filter        | `enrollment_id`, `student_id`, `course_offering_id`, `academic_term_id`, `instructor_id`, `status` |
| Sort          | `id`, `enrollment_id`, `midterm_grade`, `final_grade`, `created_at`, `updated_at`                  |
| Default order | `created_at` descending, then `id` ascending                                                       |

Grade collection scope is applied before filters, counts, ordering, and pagination. Instructors receive only grades connected to their assigned offerings; students receive only their own `PUBLISHED` grades. Scores are JSON numbers from 0 through 100 with at most two decimal places, and publishing requires both midterm and final values. A grade's enrollment is immutable. Grades have no `DELETE` route; administrators and staff preserve history by changing status to `VOIDED` through `PATCH`. Responses embed safe enrollment context without student contact or account-security fields.

The Academic Record endpoint is a non-paginated read model at `GET /students/{student_id}/academic-record`. It groups `PUBLISHED` grade entries by academic term, ordered by term start date descending and then course code, section, and grade ID ascending. Each entry includes safe course and instructor context plus the stored midterm and final scores. Draft and voided grades are excluded for every caller. No GPA, weighted average, pass/fail result, or earned-unit total is calculated because the laboratory does not define those institutional rules.

## Error responses

All handled failures use this envelope:

```json
{
  "success": false,
  "message": "Student not found.",
  "errors": null
}
```

Validation failures use field-keyed arrays so a client can display more than one message:

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": {
    "email": ["A valid email address is required."],
    "year_level": ["Value must be between 1 and 6."]
  }
}
```

Nested fields use dot notation, such as `address.city`. Non-field request problems use a key such as `request`. Messages must explain the client-visible problem without exposing SQL, database constraint names, stack traces, tokens, password material, or internal exception text.

### Status-code rules

| Status                      | Use                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `400 Bad Request`           | Malformed JSON or another request that cannot be interpreted.                                             |
| `401 Unauthorized`          | Authentication is missing, expired, or invalid. Include `WWW-Authenticate: Bearer`.                       |
| `403 Forbidden`             | The authenticated user lacks role or object-level permission.                                             |
| `404 Not Found`             | The requested resource does not exist.                                                                    |
| `409 Conflict`              | A unique value already exists, capacity is exhausted, or the requested state conflicts with current data. |
| `422 Unprocessable Content` | Parsed input fails field, relationship, filter, sorting, or business validation.                          |
| `500 Internal Server Error` | An unexpected server failure. Return only a generic message.                                              |
| `503 Service Unavailable`   | A required dependency such as the database is temporarily unavailable.                                    |

Database integrity errors must be translated to the appropriate public response. For example, duplicate student numbers, course codes, and enrollments return `409`; raw database errors never reach clients.

## Authentication and authorization

The complete role and object-access matrix is defined in `docs/AUTHORIZATION_RULES.md`.

- Protected routes require `Authorization: Bearer <access_token>`.
- Login returns `200 OK` with the access token, token type, and expiry information inside `data`.
- Logout or equivalent invalidation returns `204 No Content` after the presented credential can no longer be used as designed.
- Missing or invalid authentication returns `401`; authenticated users without permission receive `403`.
- Role and object-level authorization is enforced before returning or mutating protected data.
- Student accounts may access only their linked profile, enrollments, grades, and academic record. Instructors may modify grades only for enrollments in their assigned offerings.
- Password hashes, raw tokens, and internal authorization state are never serialized.

## Validation and normalization

- Required strings are trimmed and cannot be blank.
- Login email is trimmed, normalized to lowercase, and compared case-insensitively.
- Student numbers and academic codes are trimmed, normalized to uppercase, and protected by case-insensitive database uniqueness.
- Foreign-key identifiers must reference existing, permitted records.
- Values must follow the ranges and status vocabularies in `docs/DATA_MODEL.md`.
- Validation occurs before persistence when possible; database constraints remain the final integrity boundary for concurrent or bypassed requests.

## Contract documentation and tests

Each implemented route must declare in OpenAPI:

- Its purpose, authentication requirement, parameters, request model, response model, examples, and relevant status codes.
- At least the success response and applicable `401`, `403`, `404`, `409`, and `422` responses.
- No database-only or sensitive fields in response schemas.

Contract tests must assert status codes and complete response shapes for important success and failure paths. Collection tests also cover limits, metadata, search, filters, allowed and rejected sorting, empty results, and deterministic ordering.

Additive fields and endpoints may extend `/api/v1` when clients can safely ignore them. Removing or renaming fields, changing types, tightening accepted input, or changing response shapes is breaking and requires explicit review; once external clients depend on version 1, incompatible changes require a new API version or a documented migration path.
