# BCIS Agent Guide

Read this file before acting on a task in this repository. Use it to select only the skills that fit the request, then follow those skills and the project rules below.

## Skill selection

At the start of every task:

1. Read the user's full request and identify whether it asks for explanation, requirements, planning, implementation, UI design, backend work, documentation, or continuation of an existing task.
2. Check the relevant project files and task source before deciding what work remains. For prompts such as “proceed to the next task,” find the current task list, plan, or prior implementation state; do not guess what “next” means.
3. Activate the matching skills from this table. Read the skill instructions before following their workflow. Combine skills only when their scopes overlap.

| Skill                            | Use when                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caveman`                        | Every task. Keep conversation concise and technically complete. Do not use compressed style in repository documents, UI copy, commit messages, or other artifacts; write those for their intended readers.                                                                                         |
| `ponytail`                       | Every engineering task, including requirements analysis, plans, design, implementation, review, and dependency choices. Prefer the smallest complete solution; do not cut validation, safety, or explicitly requested scope.                                                                       |
| `using-superpowers`              | Every implementation task. Use it to select a relevant Superpowers workflow, not as a reason to force every workflow onto every request.                                                                                                                                                           |
| `writing-plans`                  | The user asks for an implementation plan, or a multi-step change needs a concrete plan before execution. For system requirements, inspect the repository and produce requirements; do not turn the request into an implementation plan unless asked.                                               |
| `brainstorming`                  | Requirements or desired behavior are materially ambiguous, or the user asks to explore options. Keep clarification focused. Skip its extended ideation or approval loop when the user gave a clear specification, asked to continue an existing plan, or requests a direct requirements inventory. |
| `test-driven-development`        | Implementing or fixing behavior where a focused failing test can capture the expected change. Follow repository test conventions and financial-data safeguards.                                                                                                                                    |
| `systematic-debugging`           | Investigating a bug, failing check, or unexpected runtime behavior. Find the cause before changing code.                                                                                                                                                                                           |
| `verification-before-completion` | Before reporting an implementation or fix as complete. Run the applicable checks and report what passed or could not run.                                                                                                                                                                          |
| `living-docs`                    | A request changes documentation, or implementation changes setup, configuration, commands, APIs, architecture, deployment, behavior, or user workflows.                                                                                                                                            |
| `frontend-design`                | Creating or substantially redesigning a user-facing screen or visual direction.                                                                                                                                                                                                                    |
| `ui-quality-loop`                | Implementing or materially changing a UI component, screen, or flow. Check responsive behavior, accessibility, states, and rendered UI where available.                                                                                                                                            |
| `api-contract-keeper`            | Adding or changing externally visible Fastify HTTP or RPC contracts, request/response schemas, errors, auth, or serialization.                                                                                                                                                                     |
| `security-best-practices`        | A security review or security-sensitive implementation in supported languages.                                                                                                                                                                                                                     |
| `architecture-guardian`          | Structural refactors or changes to module responsibilities, dependencies, coupling, or boundaries.                                                                                                                                                                                                 |
| `quality-gate`                   | The user asks whether a completed change is verified or ready, or explicitly asks for a full quality assessment.                                                                                                                                                                                   |

Choose other installed skills only when their descriptions match the task. Examples: use `figma-implement-design` for implementing a supplied Figma design, and `vercel-react-best-practices` when changing React or Next.js code. Do not invoke design skills for backend-only work or backend skills for cosmetic UI changes.

## Superpowers use

Use installed Superpowers skills when their trigger fits: `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, code-review skills, or plan-execution skills. Keep the workflow proportional to the request. Do not run the full `brainstorming` process for a clear task or demand design sign-off when the user has already specified the outcome. Do not start subagents unless the user or applicable instructions explicitly ask for delegation.

## BCIS system rules

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through the Fastify API. Enforce authorization on the server.
- Store money as integer centavos. Use PostgreSQL transactions for financial posting.
- Never edit or delete posted financial history. Use linked reversals or adjustments.
- Validate trust boundaries with Zod. Back uniqueness rules with database constraints.
- Use synthetic customer and payment information in development and tests.
- Preserve existing architecture and conventions unless the task calls for a change.
- Update documentation when its facts change. Add commands only after they run successfully.
- Before completing implementation work, run applicable formatting, lint, type, test, and build checks. If a check is unavailable or unrelated, state that clearly instead of claiming it passed.
