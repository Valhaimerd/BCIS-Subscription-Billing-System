# BCIS Role-Aware Home and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each role a useful Home view and add clear, accessible monthly billing-versus-collection analytics from authoritative records.

**Architecture:** Keep `/api/v1/dashboard` as the single management summary read for users with `report.view`. Reuse its current monthly billing/collection aggregation for a small monthly series. Users without `report.view` receive action-focused Home content based on their permissions and existing workflows; the renderer must not call the management endpoint for them.

**Tech Stack:** Fastify 5, shared TypeScript contracts, React 19, CSS, Lucide, inline SVG, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through Fastify and enforce authorization on the server.
- Store money as integer centavos and use PostgreSQL transactions for financial posting.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Preserve existing architecture and conventions; add no charting dependency.
- Label the invoice-period and payment-date semantics separately; never imply that billing and collection describe the same transaction cohort.

## Review Focus

- User lacks `report.view`: Home must not call dashboard and must not render management totals; cover in `App.test.tsx`.
- Empty time period: chart shows a useful empty state, not fabricated months or misleading zero-only trend; cover in `ReportingViews.test.tsx`.
- Range crosses year boundaries: month labels remain chronological and unique; cover in `reports.test.ts` or focused report rule test.
- Amounts exceed typical ranges or equal zero: SVG scale stays finite and labels remain readable; cover in `ReportingViews.test.tsx`.
- `asOf` differs from `to`: dashboard labels receivable aging with `asOf` and trends with `from`/`to`; cover in `report-routes.test.ts` and renderer test.

---

### Task 1: Extend the dashboard contract with a monthly series

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/reports.ts`
- Modify: `apps/api/src/report-routes.test.ts`
- Modify: `apps/api/src/task8-check.ts`
- Modify: `docs/API.md`

**Interfaces:**

- Add `DashboardDto.monthlyTrend: Array<{ period: string; billedCentavos: number; collectedCentavos: number; differenceCentavos: number }>`.
- Derive each point from the existing `billingCollection.rows` already built with `granularity: 'MONTHLY'`; do not add chart-only SQL or client-side financial arithmetic beyond the displayed difference already returned.
- Preserve dashboard request schema `from`, `to`, `asOf`, the `report.view` permission, and all existing fields.

- [ ] **Step 1: Add a dashboard route contract test** asserting the returned `monthlyTrend` point keys and integer-centavo values are passed through unchanged; add an assertion that unauthorized requests never call `ReportService.dashboard`.
- [ ] **Step 2: Run `report-routes.test.ts` and confirm the new response assertion fails.**
- [ ] **Step 3: Map `billingCollection.rows` into `monthlyTrend`** in `ReportService.dashboard`; preserve period order and include periods present in either billed or collected data.
- [ ] **Step 4: Update the OpenAPI contract documentation** for the trend fields and distinguish invoice-date billing from payment-date collections.
- [ ] **Step 5: Run `npm run test --workspace @bcis/api -- src/report-routes.test.ts` and `npm run verify:task8 --workspace @bcis/api`** against the configured lab database; both must pass.

### Task 2: Build the Home trend and period controls

**Files:**

- Create: `apps/desktop/src/renderer/src/DashboardView.tsx`
- Create: `apps/desktop/src/renderer/src/DashboardView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/ReportingViews.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Produce `DashboardView({ permissions, onNavigate }: { permissions: readonly PermissionCode[]; onNavigate: (view: AppViewId) => void }): React.JSX.Element`.
- Initialize the period to the current calendar month and `asOf` to today using local calendar dates; remove the hard-coded August–October 2026 constants.
- Call `window.bcis.reports.dashboard({ from, to, asOf })` only when `report.view` is present. Keep the current summary indicators and recent items, but place the trend and attention queue first.
- Use inline SVG for two labeled series and a semantic table/list equivalent. No values may be available only on hover.

- [ ] **Step 1: Add renderer tests** for current-month initialization, date range updates, role-without-report-view behavior, loading/error/empty states, keyboard-accessible period controls, and a trend table with the same values as the SVG summary.
- [ ] **Step 2: Run `DashboardView.test.tsx` and confirm it fails** before the view exists.
- [ ] **Step 3: Extract `DashboardView` from `ReportingViews.tsx`** into its own focused file; keep `ReportsView` behavior unchanged.
- [ ] **Step 4: Render role-aware Home content:** report-enabled roles get their authorized summary; Cashier gets subscriber/payment shortcuts and recent posted payments only through its existing permitted payment read; Technician gets subscriber/service lookup shortcuts without unsupported aggregate claims.
- [ ] **Step 5: Draw the billing/collection trend** using the existing CSS palette, readable axis labels, PHP formatting, reduced-motion-safe transitions, and a visible text/table equivalent. Add links to Reports and Receivables using `onNavigate`.
- [ ] **Step 6: Run `npm run test --workspace @bcis/desktop -- src/renderer/src/DashboardView.test.tsx src/renderer/src/App.test.tsx`, `npm run lint`, `npm run typecheck`, and `npm run build`.** Confirm 960 px and 1440 px layouts in the rendered desktop app.

### Task 3: Add role-focused exception panels

**Files:**

- Modify: `apps/desktop/src/renderer/src/DashboardView.tsx`
- Modify: `apps/desktop/src/renderer/src/DashboardView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Consume existing `DashboardDto` alerts, aging, collector summaries, and recent payments; do not invent new KPI names or add API calls for each panel.
- Render an attention item only when its count is nonzero; retain a clear all-caught-up state.

- [ ] **Step 1: Add tests** for report-enabled role drill-downs, no-alert state, and hiding actions unavailable under the user’s permissions.
- [ ] **Step 2: Run the focused tests and confirm the new cases fail.**
- [ ] **Step 3: Add the aging distribution and collection accountability summaries** with accessible table equivalents and links to their owning screens.
- [ ] **Step 4: Run desktop tests, lint, typecheck, and build**; verify reduced motion and keyboard focus in the rendered app.
