# BCIS Shell and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current page-label navigation with a clear work-first shell that shows only usable, permitted destinations.

**Architecture:** Keep the current React/Electron local view model and narrow desktop bridge. Extract navigation metadata and permission filtering into a small typed module; leave business queries and server authorization unchanged. Use page names and heading copy consistently, and avoid advertising the nonfunctional Administration placeholder.

**Tech Stack:** Electron 44, React 19, TypeScript, Lucide, CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through the Fastify API and enforce authorization on the server.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Preserve existing architecture and conventions unless the task calls for a change.
- Use the existing BCIS palette, Segoe UI Variable stack, React, Lucide, and CSS; add no dependencies.
- Navigation visibility is a usability control; it never replaces API authorization.

## Review Focus

- Role has no visible modules: render an accessible Home destination without an empty sidebar section; cover in `navigation.test.ts`.
- User has `report.view` but not `audit.view`: show Reports and suppress Audit; cover in `navigation.test.ts`.
- User has `audit.view` but not `report.view`: do not expose report previews through an Audit shortcut; cover in `navigation.test.ts`.
- Narrow 960 px Electron viewport: nav and page heading remain usable without horizontal overflow; cover in desktop shell UI test.
- Administration route has no server/UI implementation: do not present the existing placeholder as a live destination; cover in `App.test.tsx`.

---

### Task 1: Define permission-aware navigation metadata

**Files:**

- Create: `apps/desktop/src/renderer/src/navigation.ts`
- Create: `apps/desktop/src/renderer/src/navigation.test.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Interfaces:**

- Produces `type AppViewId = 'Home' | 'Subscribers' | 'Plans' | 'Billing' | 'Payments' | 'Collections' | 'Receivables' | 'Services' | 'Reports' | 'Backup & recovery'`.
- Produces `type NavigationGroup = { label: string; items: Array<{ id: AppViewId; permission: PermissionCode | null }> }`.
- Produces `visibleNavigation(permissions: readonly PermissionCode[]): NavigationGroup[]`.
- Home remains available to every authenticated session. Reports requires `report.view`; its Audit report option remains gated inside the report view by `audit.view`. Every other operational view retains its current required permission. Omit Administration until its routes and UI exist.

- [ ] **Step 1: Add `visibleNavigation` tests** for Owner, Cashier, Accounting / Auditor, Technician, Read-only Viewer, and a permission set that produces no operational groups. Assert required pages and absent pages per `seed.ts` permissions.
- [ ] **Step 2: Run the focused test and confirm it fails** with the missing module/export.

Run: `npm run test --workspace @bcis/desktop -- src/renderer/src/navigation.test.ts`
Expected: FAIL because `navigation.ts` is not implemented.

- [ ] **Step 3: Implement the typed metadata and `visibleNavigation`** in `navigation.ts`; group pages as Customers, Revenue, Field work, Service, and Insights; suppress empty groups.
- [ ] **Step 4: Render navigation from the metadata** in `App.tsx`; map Home to the existing `DashboardView`, retain the existing modules, and remove the placeholder Administration item.
- [ ] **Step 5: Re-run navigation tests and `App.test.tsx`**; verify Cashier cannot navigate to Reports/backup and Auditor sees no mutation destinations.
- [ ] **Step 6: Run `npm run lint` and `npm run typecheck`**; both must pass.

### Task 2: Align the shell and page context

**Files:**

- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Consumes `AppViewId` and `visibleNavigation` from Task 1.
- Keeps one persistent primary navigation, one page heading, and lock/sign-out controls. The Home working-period selector belongs to Task 3 of the dashboard plan; remove the hard-coded “October 2026” period from the shared shell.
- Keep search in its working Subscribers screen until the subscriber-workspace plan connects it to a real search result. Do not retain the current focus-only “global” search.

- [ ] **Step 1: Add shell assertions** for the Home heading, selected navigation state, absence of fake global-search behavior, and no Administration placeholder.
- [ ] **Step 2: Run `App.test.tsx` and confirm the new assertions fail** against the current shell.
- [ ] **Step 3: Update the sidebar, top bar, page heading, and spacing** in `App.tsx`/`styles.css`; keep brand colors from `:root`, preserve visible focus and the skip link, and leave feature-page styling untouched.
- [ ] **Step 4: Verify the shell at 960 px and 1440 px** with keyboard navigation and each role fixture; no horizontal overflow, hidden focused control, or decorative control without behavior.
- [ ] **Step 5: Run `npm run test --workspace @bcis/desktop -- src/renderer/src/App.test.tsx`, `npm run lint`, `npm run typecheck`, and `npm run build`.** All must pass.

### Task 3: Correct frontend workflow documentation

**Files:**

- Modify: `docs/FRONTEND_ARCHITECTURE.md`
- Modify: `docs/manual/USER_MANUAL.md`
- Reference: `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/src/App.tsx`, `apps/api/src/server.ts`, `docs/ARCHITECTURE.md`, `docs/AUTHORIZATION_RULES.md`, `apps/api/src/seed.ts`

- [ ] **Step 1: Replace the unrelated FastAPI/web-client description** with the verified Electron renderer → narrow preload/main bridge → authenticated Fastify API → PostgreSQL flow. Document actual renderer modules and session handling from source.
- [ ] **Step 2: Correct the auditor workflow copy** so it does not say Accounting / Auditor can reverse or adjust payments unless the actual seeded permission is deliberately changed in a separately approved access-control change.
- [ ] **Step 3: Check links and facts** against the named source files; do not add unverified commands.
- [ ] **Step 4: Run `npx prettier --check docs/FRONTEND_ARCHITECTURE.md docs/manual/USER_MANUAL.md`**; expected result is all files formatted.
