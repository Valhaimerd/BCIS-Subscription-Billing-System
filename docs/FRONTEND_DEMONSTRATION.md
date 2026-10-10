# Activity III Live Demonstration

Prepare PostgreSQL, apply migrations, run the idempotent seeder, start FastAPI with the frontend origin in `CORS_ALLOWED_ORIGINS`, then run Vite. Keep browser developer tools on the Network tab and never expose `.env` files or tokens.

|   # | Demonstration action                       | Expected evidence                                                                                                   |
| --: | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
|   1 | Open the application                       | Professional responsive login page loads.                                                                           |
|   2 | Submit invalid credentials                 | Safe backend authentication error appears.                                                                          |
|   3 | Sign in as Administrator                   | Dashboard and authorized totals load from the API.                                                                  |
|   4 | Refresh a protected nested route           | Session restores through `/auth/me`; route remains usable.                                                          |
|   5 | Show role-aware navigation                 | Academic management plus Users and Roles are present.                                                               |
|   6 | Open Students                              | Backend records, pagination metadata, sorting, and controls render.                                                 |
|   7 | Search students                            | Network request contains `search`; displayed rows come from the response.                                           |
|   8 | Apply program/year filters and page        | URL and API query parameters change.                                                                                |
|   9 | Create a student                           | Valid form posts to the API; reload/search proves persistence.                                                      |
|  10 | Trigger validation or duplicate feedback   | Field or conflict feedback is readable and preserves safe input.                                                    |
|  11 | Edit that student                          | Saved backend values appear after refetch.                                                                          |
|  12 | Deactivate with confirmation               | Confirmation runs `DELETE`; historical row remains inactive.                                                        |
|  13 | Manage Program, Course, Term, and Offering | Open each workflow and show reference options from the API.                                                         |
|  14 | Open an offering roster                    | Authorized student summaries load through the nested endpoint.                                                      |
|  15 | Enroll a student                           | Create enrollment; repeat the pair to show backend duplicate rejection.                                             |
|  16 | Update a grade as assigned Instructor      | Instructor sees assigned scope and saves an authorized update.                                                      |
|  17 | Show a Student academic record             | Published grades are grouped by term from the aggregate endpoint.                                                   |
|  18 | Prove authorization                        | Staff lacks Users/Roles; direct route shows Access denied and backend request returns `403`.                        |
|  19 | Prove responsive and failure states        | At 390x844 use the drawer and form; disconnect/intercept API, show unreachable message and Retry, then reconnect.   |
|  20 | Show verification and explain AI use       | Run documented checks, show evidence files, and explain the enrollment-capacity or frontend session/query workflow. |

Finish by logging out and confirming a protected URL returns to login. The live presentation, any recording, and any instructor-requested code change remain the student's responsibility.
