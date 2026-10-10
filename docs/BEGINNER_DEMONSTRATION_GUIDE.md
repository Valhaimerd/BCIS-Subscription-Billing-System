# Beginner's Exact Laboratory Demonstration Guide

This guide assumes you understand the ideas of students, courses, enrollment, and grades but
have little experience operating a backend API. Follow it from top to bottom. You do not need to
build a frontend, write SQL, memorize every command, or manually type access tokens.

This file is local and Git-ignored. The permanent project sources of truth are `README.md`,
`docs/SUBMISSION_EVIDENCE.md`, and the generated Swagger documentation.

## What is already ready on this computer

As checked on 2026-09-15:

- The virtual environment exists at `.venv`.
- `.env` points to a working PostgreSQL database.
- The current `.env` demo password matches the seeded administrator account.
- The database migration is at `20260911_0003 (head)`.
- The minimum seed data is present: 5 users, 3 programs, 100 students, 20 courses, 2 academic
  terms, 20 course offerings, 200 enrollments, and 100 grades.
- The current seeded instructor `instructor1@example.test` has user ID `8`.
- The automated suite has 279 tests.

You can therefore start at **Prepare the database before a demonstration**. The first-time setup
section is only for recovering the project or moving it to another computer.

## Tiny glossary

| Term                | Plain meaning                                                                          |
| ------------------- | -------------------------------------------------------------------------------------- |
| Backend             | The program that applies rules and talks to the database. This project is the backend. |
| API                 | A collection of URLs that another program can call to read or change data.             |
| Endpoint            | One API method and URL, such as `GET /api/v1/students`.                                |
| Request             | What Postman sends to the API: method, URL, token, and sometimes JSON data.            |
| Response            | What the API sends back: status code and usually a JSON body.                          |
| JSON                | The structured text containing fields such as `"first_name": "Ada"`.                   |
| Server              | The running Uvicorn/FastAPI process waiting for API requests.                          |
| Database            | PostgreSQL, where persistent students, courses, enrollments, and grades are stored.    |
| Migration           | A numbered, repeatable database structure change managed by Alembic.                   |
| Seeder              | `app.seed`, which creates the required demonstration data.                             |
| Token               | A temporary secret returned by login and sent with protected requests.                 |
| Authentication      | Proving who you are by logging in.                                                     |
| Authorization       | Checking whether the logged-in role may perform an action.                             |
| Collection variable | A Postman value such as `student_id` that requests can reuse.                          |

The complete request flow is:

```text
Postman -> Uvicorn -> FastAPI route -> authentication/authorization
        -> Pydantic validation -> service rules -> SQLAlchemy -> PostgreSQL
        -> response schema -> JSON shown in Postman
```

## HTTP status code cheat sheet

The number is the quickest way to understand a response.

|                      Status | Meaning in this project                                           |
| --------------------------: | ----------------------------------------------------------------- |
|                    `200 OK` | A read, login, or update worked.                                  |
|               `201 Created` | A new database record was created.                                |
|            `204 No Content` | Logout or deactivation worked; an empty response body is correct. |
|           `400 Bad Request` | The JSON itself is malformed.                                     |
|          `401 Unauthorized` | The token is missing, expired, invalid, or logged out.            |
|             `403 Forbidden` | Login worked, but that role is not allowed to do the action.      |
|             `404 Not Found` | The requested ID does not exist.                                  |
|              `409 Conflict` | A duplicate or conflicting record was rejected.                   |
| `422 Unprocessable Content` | One or more input values failed validation or a business rule.    |
| `500 Internal Server Error` | An unexpected application bug occurred.                           |
|   `503 Service Unavailable` | The API is running, but PostgreSQL is unavailable.                |

`401`, `403`, `404`, `409`, and `422` are not always mistakes during this lab. Several mandatory
steps intentionally cause them to prove that protection and validation work.

## How to use PowerShell without getting lost

1. In VS Code, select **Terminal > New Terminal**.
2. Confirm that the terminal type is PowerShell.
3. You will see a prompt similar to:

   ```text
   PS C:\Users\Valhaimerd\Desktop\Lab Activity 2>
   ```

   Do not type the `PS ...>` part. Type only the commands shown in code blocks.

4. Check the current folder:

   ```powershell
   Get-Location
   ```

5. If it is not the project root, move there:

   ```powershell
   Set-Location -LiteralPath 'C:\Users\Valhaimerd\Desktop\Lab Activity 2'
   ```

6. Run one command at a time and press Enter. Wait for it to finish before entering the next
   command, except for the server command, which intentionally keeps running.

This project always calls `.\.venv\Scripts\python.exe` directly. You do not need to activate the
virtual environment.

## First-time setup only

Skip this section on the current computer unless `.venv` or `.env` was removed.

### 1. Create the virtual environment

```powershell
python -m venv .venv
```

Meaning: create an isolated Python installation for this project inside `.venv`.

### 2. Install dependencies

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Meaning: install FastAPI, SQLAlchemy, Alembic, PostgreSQL support, tests, Ruff, and mypy using
the versions recorded by the repository.

### 3. Prepare `.env`

If `.env` does not exist, copy `.env.example` to a new file named `.env`. Open `.env` in VS Code
and supply a real `DATABASE_URL` for a dedicated local PostgreSQL database. Keep
`APP_ENVIRONMENT=development` and choose a `DEMO_SEED_PASSWORD` with at least eight characters.

Never show `.env` during the presentation, paste it into chat, or commit it. It contains database
credentials. PostgreSQL itself must be installed, running, and contain the database and user named
by `DATABASE_URL`.

## Prepare the database before a demonstration

Do this before every rehearsal or live demonstration. It is safe when migrations and seed data
already exist.

### 1. Apply migrations

In a VS Code PowerShell terminal, run:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

What it does: Alembic compares the database with the migration files and applies anything
missing. If the database is already current, it makes no structural change.

Expected result: informational Alembic lines and no traceback or red error.

### 2. Confirm the revision

```powershell
.\.venv\Scripts\python.exe -m alembic current
```

Expected important line:

```text
20260911_0003 (head)
```

What to say:

> Alembic reports the database at the latest migration, so the schema can be reproduced from the
> repository.

### 3. Ensure seed data exists

```powershell
.\.venv\Scripts\python.exe -m app.seed
```

Expected minimum totals:

```text
roles: 4
users: 5
programs: 3
students: 100
courses: 20
academic_terms: 2
course_offerings: 20
enrollments: 200
grades: 100
```

Counts may be higher after you rehearse create requests. That is okay. The seeder is idempotent:
it adds missing demo rows without duplicating its own rows. It does not erase your data and does
not change passwords of existing demo accounts.

What to say:

> The idempotent seeder provides at least the data volumes required by the laboratory and can be
> rerun safely.

## Start the backend server

### 1. Start Uvicorn

Use your first terminal and run:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Expected ending:

```text
Application startup complete.
Uvicorn running on http://127.0.0.1:8000
```

The terminal now appears stuck. That is correct: the server is running and waiting for requests.
Do not close it and do not type more commands there.

### 2. Open a second terminal

Select **Terminal > New Terminal** again. Use this second terminal for tests. Leave the first
terminal running so Postman can reach the API.

### 3. Check the browser pages

Open each address in a browser:

- `http://127.0.0.1:8000/api/v1/health`
- `http://127.0.0.1:8000/api/v1/health/readiness`
- `http://127.0.0.1:8000/docs`

The readiness page should show:

```json
{
  "success": true,
  "message": "API and database are ready.",
  "data": { "status": "ok" }
}
```

If the browser says it cannot connect, the Uvicorn terminal is not running. If readiness returns
`503`, Uvicorn is running but PostgreSQL or `DATABASE_URL` needs attention.

## Set up Postman exactly once

Use the Postman desktop application if available. A browser-hosted Postman workspace may require
its desktop agent to call `127.0.0.1`.

### 1. Import the collection

1. Open Postman and enter your workspace.
2. Select **Import** or **Use resources or import**.
3. Select **Files** and choose:
   `api-client/Student-Information-Management.postman_collection.json`.
4. Confirm the import.
5. In the left **Collections** sidebar, find **Student Information Management API**.

If that collection is already visible, do not import it again; otherwise you will have confusing
duplicate copies.

### 2. Understand the Postman screen

When you select a request:

- The method (`GET`, `POST`, `PATCH`, and so on) and URL appear at the top.
- **Params** contains URL filters such as `page` and `search`.
- **Authorization** shows how the Bearer token is supplied.
- **Body > raw > JSON** contains data sent by create and update requests.
- **Send** executes the request.
- The lower response panel shows the status code and returned JSON body.

### 3. Set collection variables

1. Select the collection name, not a request.
2. Open its **Variables** tab.
3. Use the local **Value** column. Do not share passwords or tokens to a team workspace.
4. Confirm these variables:

| Variable                            | What to enter now                                          | Purpose                                                |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `base_url`                          | `http://127.0.0.1:8000`                                    | Address of the running API.                            |
| `email`                             | `admin@example.test`                                       | Administrator login for most steps.                    |
| `password`                          | The value after `DEMO_SEED_PASSWORD=` in your local `.env` | Demo login password. Never show it.                    |
| `access_token`                      | Leave it alone                                             | Login fills this automatically.                        |
| `instructor_id`                     | `8` for the current database                               | Instructor used when creating an offering.             |
| `program_id` and later resource IDs | Leave them alone                                           | Successful create requests replace them automatically. |

If you use a Postman environment containing variables with the same names, those values can
override the collection values. For this lab, selecting no environment is simplest.

### 4. Know how automatic IDs work

After a successful create response, the collection's post-response script copies `data.id` into
a variable. For example:

```text
Create Program succeeds -> program_id is saved
Create Student succeeds -> student_id is saved
Create Course succeeds -> course_id is saved
```

The next request uses `{{program_id}}`, `{{student_id}}`, or another saved variable. Do not
replace those braces in request URLs or bodies. If a create request fails, stop and fix it; a
stale ID may otherwise point to an older rehearsal record.

Postman's `{{$timestamp}}` is a generated number used to make several codes unique.

## Five-minute rehearsal before presentation day

1. Run migrations and the seeder.
2. Start Uvicorn and confirm readiness.
3. Open Postman and confirm the collection variables.
4. Run **Authentication > Login**.
5. Run **Users > List Users**, locate `instructor1@example.test`, and confirm its `id`. Update
   `instructor_id` if it is no longer `8`.
6. Open **Academic Terms > Create Academic Term** and inspect its JSON body. If you previously
   created `2030-2031` plus `FIRST_SEMESTER`, change the year and dates to a new consistent year,
   such as `2031-2032`, `2031-08-01`, and `2031-12-15`.
7. Open **Students > Create Student**. If `ada@example.test` was already used and the request
   conflicts, change it to another valid demonstration address such as
   `ada2@example.test`.
8. Do not run **Logout** until the end because it invalidates the current token.

# The 20 mandatory demonstrations

Perform these in order. Every numbered section tells you what to do, what to look for, and what
to say.

## 1. Start the REST API and connect to the database

**Purpose:** prove the backend process runs and PostgreSQL responds.

1. Keep the Uvicorn terminal open.
2. In Postman, expand the collection.
3. Select the top-level **Database Readiness** request.
4. Select **Send**.
5. Look for status `200 OK`.
6. In the JSON body, confirm `"message": "API and database are ready."`.

Say:

> Uvicorn is serving the FastAPI application on port 8000. This readiness endpoint performs a
> simple database query, so HTTP 200 proves both the API and PostgreSQL are available.

If it fails: check the Uvicorn terminal first. `503` means PostgreSQL or `DATABASE_URL` is the
problem; connection refused means Uvicorn is not running.

## 2. Authenticate successfully

**Purpose:** prove a valid account receives a temporary Bearer token.

1. Confirm collection variable `email` is `admin@example.test`.
2. Confirm `password` is filled, but do not reveal it on screen longer than necessary.
3. Select **Authentication > Login**.
4. The body should contain `{{email}}` and `{{password}}`; leave those placeholders unchanged.
5. Select **Send**.
6. Look for `200 OK`, `"success": true`, `"token_type": "bearer"`, and `expires_at`.
7. Do not read or copy the token aloud. The request script automatically stores it in
   `access_token`.
8. Select **Authentication > Current User**, then **Send**.
9. Look for `200 OK`, email `admin@example.test`, and role code `ADMINISTRATOR`.

Say:

> Login verifies the hashed password and returns an expiring opaque Bearer token. Postman stores
> it as a collection variable, and protected requests inherit it automatically.

If login returns `401`: confirm the email and use the password that existed when the account was
first seeded. Changing `.env` later does not reset an existing password.

## 3. Reject a protected request without authentication

**Purpose:** prove the server, not merely the client, requires authentication.

1. Select **Students > List Students - Missing Token (401)**.
2. This special request uses **No Auth**. Do not change it.
3. Select **Send**.
4. Look for `401 Unauthorized`.
5. Confirm the response contains:

   ```json
   {
     "success": false,
     "message": "Invalid authentication credentials.",
     "errors": null
   }
   ```

Say:

> This request deliberately sends no token. The backend rejects it with 401 before returning
> protected student data.

## 4. Create a program

**Purpose:** create the parent record required by the new student.

1. Select **Programs > Create Program**.
2. Open **Body** and observe the JSON. `{{$timestamp}}` makes the program code unique.
3. Select **Send**.
4. Look for `201 Created`, `"success": true`, and the new program under `data`.
5. The script stores the returned `data.id` in `program_id`.
6. If curious, open the collection **Variables** tab and confirm `program_id` changed.

Say:

> POST creates a program and returns 201 plus its representation. The database enforces unique
> program codes, and Postman saves the ID for the dependent student request.

If it returns `401`, log in again. If it returns `403`, you are logged in as the wrong role.

## 5. Create a valid student

**Purpose:** prove validated CRUD creation and a valid program relationship.

1. Select **Students > Create Student**.
2. Open **Body**. Confirm `"program_id": {{program_id}}` still uses the variable.
3. If `ada@example.test` was already used in a rehearsal and causes a conflict, change only the
   email to another valid value.
4. Select **Send**.
5. Look for `201 Created`.
6. Confirm the response contains the new student, an assigned numeric `id`, the generated
   student number, program information, and `"status": "ACTIVE"`.
7. The script stores the returned ID in `student_id`.

Say:

> Pydantic validates the JSON, the service validates the program relationship, SQLAlchemy saves
> the student, and the database protects the unique student number.

## 6. Reject invalid student data

**Purpose:** prove bad input is rejected before it is stored.

1. Select **Students > Create Student - Invalid Email (422)**.
2. Open **Body** and point out `"email": "not-an-email"`.
3. Select **Send**.
4. Look for `422 Unprocessable Content`.
5. Confirm `"success": false`, `"message": "Validation failed."`, and an `email` entry inside
   `errors`.

Say:

> The request is valid JSON, but the email fails schema validation. The API returns a safe,
> field-specific 422 response and does not insert the student.

Optional duplicate proof: edit the normal **Create Student** request to reuse an existing
`student_number`, send it, and show `409 Conflict`. Restore the body afterward. The invalid-email
request alone satisfies the mandatory invalid-or-duplicate step.

## 7. Retrieve and update a student

**Purpose:** prove read and partial-update operations use the created student's ID.

1. Select **Students > Retrieve Student**.
2. Its URL contains `{{student_id}}`, which came from Step 5.
3. Select **Send** and look for `200 OK` and the created student.
4. Select **Students > Update Student**.
5. Open **Body** and observe that only `year_level` and `contact_number` are supplied.
6. Select **Send**.
7. Look for `200 OK` and confirm `year_level` is now `3` while omitted fields remain unchanged.

Say:

> GET retrieves one resource. PATCH changes only the supplied fields, so the other student data
> remains intact.

You may demonstrate **Replace Student** instead, but it uses PUT and requires the full writable
representation. PATCH is easier and safer for the live demonstration.

## 8. Search and filter students

**Purpose:** prove the collection can narrow results using server-side query parameters.

1. Select **Students > List Students**.
2. Open the **Params** tab.
3. Keep or add these checked rows:

   | Key          | Value                  |
   | ------------ | ---------------------- |
   | `page`       | `1`                    |
   | `per_page`   | `20`                   |
   | `search`     | `Ada`                  |
   | `program_id` | `{{program_id}}`       |
   | `status`     | `ACTIVE`               |
   | `sort`       | `last_name,first_name` |

4. The imported request does not initially contain `search` or `status`; add them manually with
   **Add parameter** if needed.
5. Select **Send**.
6. Look for `200 OK` and verify the returned rows match the name, program, and active status.

Say:

> Search checks the documented student text fields case-insensitively. Exact filters are combined
> with AND, so every returned row must also match the program and status.

If you receive `422`, check spelling and make sure the parameter names are exactly `search`,
`program_id`, and `status`.

## 9. Show pagination and sorting

**Purpose:** prove a large collection is returned in controlled, deterministic pages.

1. Stay in **Students > List Students** and open **Params**.
2. Temporarily uncheck `search`, `program_id`, and `status` so the seeded students are visible.
3. Set:

   | Key        | Value                  |
   | ---------- | ---------------------- |
   | `page`     | `1`                    |
   | `per_page` | `5`                    |
   | `sort`     | `last_name,first_name` |

4. Select **Send**.
5. Confirm only five objects appear in `data`.
6. Expand `meta.pagination` and point out `page`, `per_page`, `total`, and `last_page`.
7. Optionally change `page` to `2` and send again to show the next page.
8. Optionally prefix a supported field with `-`, such as `-created_at`, to show descending sort.

Say:

> The server limits the result to five rows, reports the total and last page, and applies a stable
> sort before slicing the requested page.

## 10. Create a course and an academic term

**Purpose:** create both parent records required by a course offering.

### Create the course

1. Select **Courses > Create Course**.
2. Its course code contains `{{$timestamp}}`, so it is normally unique.
3. Select **Send**.
4. Look for `201 Created`; the script stores `course_id`.

### Create the term

1. Select **Academic Terms > Create Academic Term**.
2. Before sending, check the body. The default combination is academic year `2030-2031` and
   `FIRST_SEMESTER`.
3. If that combination was already created during rehearsal, change the year and both dates to a
   future consistent year.
4. Select **Send**.
5. Look for `201 Created`; the script stores `academic_term_id`.

Say:

> The course and academic term are separate normalized resources. Their returned IDs become
> foreign keys for the offering.

If the term returns `409`, its year-and-term combination already exists. Change the year and dates
and send again.

## 11. Create a course offering

**Purpose:** connect a course, term, and instructor into a class section.

1. If you have not confirmed the instructor ID, run **Users > List Users**.
2. Find the row whose email is `instructor1@example.test` and role code is `INSTRUCTOR`.
3. Set the collection variable `instructor_id` to that user's `id`. It is currently `8`.
4. Select **Course Offerings > Create Course Offering**.
5. Open **Body** and confirm it contains `{{course_id}}`, `{{academic_term_id}}`, and
   `{{instructor_id}}`.
6. Confirm status is `OPEN`; enrollment in Step 12 requires an open offering.
7. Select **Send**.
8. Look for `201 Created`; the script stores `course_offering_id`.

Say:

> The offering is the specific delivery of a course in one term, assigned to an active instructor
> with a section, schedule, room, capacity, and status.

If it returns `422` with an instructor error, do not guess another number. Repeat the user lookup
and correct `instructor_id`.

## 12. Enroll the student

**Purpose:** create the transaction connecting the student to the offering.

1. Select **Enrollments > Create Enrollment**.
2. Open **Body** and confirm it uses `{{student_id}}` and `{{course_offering_id}}`.
3. Confirm status is `ENROLLED`.
4. Select **Send** once.
5. Look for `201 Created`.
6. Confirm the response embeds safe student and offering information.
7. The script stores `enrollment_id`.

Say:

> The service verifies that the student is active, the offering is open, the pair is unique, and
> capacity remains before committing the enrollment.

Do not double-click **Send**. The second request is the deliberate duplicate demonstration in the
next step.

## 13. Prevent duplicate enrollment

**Purpose:** prove the same student cannot be enrolled twice in the same offering.

1. Without changing the body from Step 12, select **Send** again.
2. Look for `409 Conflict`.
3. Confirm the body says:

   ```json
   {
     "success": false,
     "message": "The student is already enrolled in this course offering.",
     "errors": {
       "course_offering_id": ["Student enrollment must be unique per offering."]
     }
   }
   ```

4. The Postman test named **Enrollment is created** may appear red because this same saved request
   normally expects `201`. That red assertion is expected during this intentional negative test;
   the important evidence is the HTTP `409` and safe error body.
5. `enrollment_id` still refers to the successful first enrollment.

Say:

> The service detects the duplicate and returns 409. A database unique constraint is also the
> final defense against simultaneous duplicate requests.

## 14. Create and publish an authorized grade

**Purpose:** prove a grade belongs to an enrollment and must meet publication rules.

### Create the draft

1. Select **Grades > Create Draft Grade**.
2. Confirm the body uses `{{enrollment_id}}` and contains both midterm and final scores.
3. Select **Send**.
4. Look for `201 Created` and `"status": "DRAFT"`.
5. The script stores `grade_id`.

### Publish it

1. Select **Grades > Publish Grade**.
2. Confirm its URL contains `{{grade_id}}` and its body is `{"status": "PUBLISHED"}`.
3. Select **Send**.
4. Look for `200 OK` and `"status": "PUBLISHED"`.

Say:

> A grade is normalized to one enrollment. Drafts can be edited, while publication requires both
> scores. This administrator is authorized to publish it.

If creation returns `409`, a grade already exists for the saved enrollment. Repeat Steps 10 to 12
with new resources or ensure `enrollment_id` came from the latest successful enrollment.

## 15. Retrieve the student's academic record

**Purpose:** prove the API derives a grouped read model from several related tables.

1. Select **Academic Records > Retrieve Student Academic Record**.
2. Confirm the URL contains `{{student_id}}`.
3. Select **Send**.
4. Look for `200 OK`.
5. Confirm the student summary appears and the newly published grade is grouped under its academic
   term.

Say:

> This endpoint does not store a duplicate transcript table. It derives the record from the
> student, enrollment, offering, course, term, and published grade rows, then groups them by term.

If the grade is missing, return to **Publish Grade** and confirm its status is `PUBLISHED`. Draft
and voided grades are intentionally excluded.

## 16. Reject an unauthorized role

**Purpose:** prove authentication alone is insufficient; the server also enforces role
authorization.

1. Open the collection **Variables** tab.
2. Change `email` from `admin@example.test` to `student@example.test`.
3. Keep the same seeded demo password.
4. Run **Authentication > Login**. A successful response replaces `access_token` with a student
   token.
5. Run **Authentication > Current User** and show role code `STUDENT`.
6. Select **Enrollments > Create Enrollment** and select **Send**.
7. Look for `403 Forbidden` and message
   `"You do not have permission to perform this action."`.
8. The saved request's success assertion may appear red because this is an intentional forbidden
   request. Focus on the `403` response.
9. Immediately restore `email` to `admin@example.test`.
10. Run **Authentication > Login** again, then **Current User**, and confirm role
    `ADMINISTRATOR` before continuing.

Say:

> The student is authenticated, so this is not 401. The backend checks the role and returns 403
> because students cannot create enrollments.

## 17. Show a not-found case

**Purpose:** prove missing resources return a safe `404`, not a database error or empty success.

1. Select **Academic Records > Retrieve Academic Record - Missing Student (404)**.
2. Its URL intentionally uses student ID `999999`.
3. Select **Send**.
4. Look for `404 Not Found`.
5. Confirm the body contains `"message": "Student not found."` and no stack trace.

Say:

> The route validates the ID shape, the service cannot find that student, and the API translates
> the result into a consistent safe 404 response.

## 18. Display API documentation

**Purpose:** prove clients can discover and understand the contract.

1. Open `http://127.0.0.1:8000/docs` in a browser.
2. Point out that routes are grouped under Authentication, Students, Programs, Courses, Academic
   Terms, Course Offerings, Enrollments, Grades, and Academic Records.
3. Expand one route, such as `POST /api/v1/students`.
4. Show its request schema, example, success response, and documented error responses.
5. Show the **Authorize** button and explain Bearer authentication.
6. Expand `GET /api/v1/students` and show page, filter, and sort query parameters.
7. Do not expose a real token while presenting.

Say:

> FastAPI generates this Swagger UI from the same Pydantic request and response models used by
> the application, so the interactive contract stays close to the implementation.

## 19. Run the automated tests and checks

**Purpose:** prove important success and failure behavior is repeatable, not only manually shown.

Use the second VS Code PowerShell terminal. Run each command separately.

### Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected current result: `279 passed`.

### Lint

```powershell
.\.venv\Scripts\python.exe -m ruff check .
```

Expected result: `All checks passed!`

### Formatting check

```powershell
.\.venv\Scripts\python.exe -m ruff format --check .
```

Expected current result: `82 files already formatted`.

### Static type check

```powershell
.\.venv\Scripts\python.exe -m mypy app tests
```

Expected current result: `Success: no issues found in 65 source files`.

Say:

> Pytest checks behavior, Ruff checks code quality and formatting, and mypy checks static types.
> The suite includes positive, validation, authentication, authorization, conflict, and OpenAPI
> cases.

If any command fails during the real demonstration, do not claim it passed. Read the first actual
error, keep the complete output, and explain that it needs investigation.

## 20. Explain one AI-assisted contribution

**Purpose:** prove AI accelerated development but you reviewed and understand the result.

Use the enrollment-capacity implementation. Before presenting, open these files in VS Code:

- `docs/AI_ASSISTED_DEVELOPMENT.md`
- `app/api/v1/enrollments.py`
- `app/services/enrollments.py`
- `app/models.py`
- `tests/test_enrollments_api.py`

Use this explanation in your own natural words:

> AI helped propose and review the capacity-safe enrollment flow, but I verified it through the
> implementation and tests. The FastAPI route first requires an administrator or staff role, and
> the Pydantic schema validates the request shape. The service loads the course offering using a
> database row lock so concurrent requests for the same class do not perform the seat check at the
> same time. It confirms that the student exists and is active, the offering exists and is open,
> the student is not already enrolled, and the number of active enrolled rows is below capacity.
> SQLAlchemy then commits the enrollment. A database unique constraint on student plus offering is
> the final protection against duplicates, even if two requests race. Expected conflicts become
> safe HTTP 409 responses instead of exposing raw database errors. The enrollment API tests prove
> success, duplicates, full capacity, invalid references, role restrictions, and related cases.

If asked why both a row lock and a unique constraint are needed:

- The row lock coordinates capacity checks for simultaneous enrollments in the same offering.
- The unique constraint is the database's final guarantee that the same student/offering pair
  cannot appear twice.
- Application checks provide clear error messages; database rules protect integrity even if an
  application check is bypassed or two requests race.

If asked what AI did:

> AI assisted with bounded planning, implementation suggestions, test cases, reviews, and
> documentation. I accepted changes only after reading the request flow and running pytest, Ruff,
> mypy, migrations, and runtime checks.

Do not say that AI built everything and you do not know how it works. The grading requirement is
that you can trace and modify the accepted code.

## Finish and shut everything down

1. Optionally run **Authentication > Logout**. Expect `204 No Content`; an empty body is correct.
2. Return to the first terminal containing Uvicorn.
3. Press `Ctrl+C` once.
4. Wait for messages saying application shutdown is complete.
5. You may now close VS Code, Postman, and the browser.

## Common problems and exact recovery actions

| What you see                                         | Likely meaning                                                        | What to do                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Browser/Postman cannot connect                       | Uvicorn is not running.                                               | Start the server and leave its terminal open.                                 |
| `Address already in use`                             | Another process already owns port 8000.                               | Find the older Uvicorn terminal and press `Ctrl+C`, then start once.          |
| Readiness returns `503`                              | PostgreSQL is unavailable or `DATABASE_URL` is wrong.                 | Start PostgreSQL and check `.env` privately.                                  |
| `ModuleNotFoundError`                                | Dependencies are missing or the wrong Python was used.                | Run the dependency-install command with `.venv\Scripts\python.exe`.           |
| Login returns `401`                                  | Email/password is wrong or the existing account has another password. | Restore the correct collection email and original seeded password.            |
| A normal protected request returns `401`             | Token is missing, expired, or was logged out.                         | Run **Login** again.                                                          |
| A normal admin request returns `403`                 | The current token belongs to another role.                            | Restore the admin email and run **Login** again.                              |
| Postman shows a variable in red                      | It is empty or unresolved.                                            | Run the earlier successful create request or correct the collection value.    |
| Create Academic Term returns `409`                   | That year and term already exist.                                     | Use a new consistent academic year and dates.                                 |
| Create Course Offering returns instructor `422`      | `instructor_id` does not identify an active instructor.               | Run **Users > List Users** and copy the correct instructor ID.                |
| Create Enrollment returns `422`                      | A referenced record is invalid/inactive or the offering is not open.  | Confirm the latest saved IDs and offering status `OPEN`.                      |
| Create Enrollment returns `409` the first time       | The saved student/offering pair was already used.                     | Repeat the create chain with new student/offering resources.                  |
| Academic record lacks the grade                      | The grade is still draft or voided.                                   | Publish the grade and retrieve the record again.                              |
| A negative demonstration has a red Postman assertion | The reused request script expects its normal success status.          | Explain the deliberate negative status and show the safe response body.       |
| Seeder refuses to run                                | `APP_ENVIRONMENT` is not local/development/test.                      | Check the environment name privately; do not weaken the safety guard.         |
| You see `500`                                        | An unexpected application error occurred.                             | Read the Uvicorn terminal, save the error, and investigate before presenting. |

## Presentation-day checklist

Before the instructor watches:

- [ ] PostgreSQL is running.
- [ ] Migrations report `20260911_0003 (head)`.
- [ ] The seeder reports at least the required counts.
- [ ] Uvicorn is running in terminal 1.
- [ ] Readiness returns `200`.
- [ ] Postman has only one copy of the collection.
- [ ] `base_url`, administrator email, and password are correct.
- [ ] `instructor_id` was checked through **Users > List Users**.
- [ ] The academic-term year is unused.
- [ ] You know which responses intentionally return `401`, `403`, `404`, `409`, and `422`.
- [ ] Terminal 2 is ready for pytest, Ruff, and mypy.
- [ ] Swagger UI is open.
- [ ] The five files for the AI-assisted contribution are open in VS Code.
- [ ] Notifications and unrelated windows are hidden.
- [ ] `.env`, passwords, tokens, and database credentials will not be shown.

## What the laboratory is actually grading

You are demonstrating that:

1. The backend and database start reproducibly.
2. Migrations create the correct structure and the seeder supplies enough data.
3. Authentication identifies a user and authorization limits what that role can do.
4. CRUD and academic workflows operate through resource-oriented `/api/v1` endpoints.
5. Validation, conflicts, missing records, and errors use appropriate safe responses.
6. Collections support search, filters, sorting, and pagination.
7. Swagger and Postman document and exercise the contract.
8. Automated checks support the manual demonstration.
9. You understand the code you accepted with AI assistance.

You do not need a graphical frontend for this laboratory.

## Official Postman help if the interface looks different

- Importing a collection: `https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data`
- Editing collection variables: `https://learning.postman.com/latest-v-12/docs/use/send-requests/variables/define-variables`
- Understanding the response panel: `https://learning.postman.com/docs/use/send-requests/response-data/responses`
