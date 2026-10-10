# BCIS Interaction and Visual Redesign Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` task by task. Complete each slice and its verification before starting the next. Do not start implementation until this proposal is approved.

**Goal:** Make the BCIS desktop client visibly modern, easier to navigate, and reliable to operate by mouse and keyboard while preserving existing role and financial behavior.

**Architecture:** Keep React/Electron, the typed preload bridge, and Fastify API. Improve the shared dialog and shell foundations first, then redesign each major screen as a working vertical slice. Keep each slice independently testable and leave business rules and API contracts unchanged.

**Tech Stack:** Electron, React, TypeScript, existing CSS, Lucide, Vitest/Testing Library, existing Playwright Electron scripts.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-interaction-and-visual-redesign-design.md`

## Global Constraints

- Renderer stays isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- All data access stays behind the existing typed bridge and Fastify API; server authorization remains authoritative.
- Money remains integer centavos through UI-to-API calls; posted history changes only through linked corrections.
- No new UI, animation, or chart dependencies without an evidenced need.
- Use synthetic subscriber/payment data in tests and screenshots.
- Every slice keeps loading, empty, error, success, permission, keyboard, and reduced-motion behavior usable.
- The Electron window minimum remains 960 × 640; critical actions must fit without clipping at that size.
- Do not replace UI-only permissions with client authorization or change API contracts in this redesign.

## Review Focus

- A click handler calls `window.prompt`/`window.confirm` and Electron does not present that browser dialog: prove the real runtime behavior and replace with an app-owned dialog.
- A dialog renders in a component test but the real initiating button never opens it: test the full action-to-dialog path in Electron.
- A collapsed sidebar hides the active destination or traps pointer/keyboard focus: test persistence, navigation, tooltip, and narrow-window behavior.
- A user changes the receivable as-of date while a request is in flight: apply summary and rows from one matching date/request.
- A user lacks a write permission or an action conflicts with server state: hide unavailable actions and preserve the server's explanatory error.

## Slice Order

### Slice 0 — Diagnose and fix action/dialog reliability

**Outcome:** Every action that needs a prompt or confirmation opens a visible, app-owned dialog from its real click target.

**Files:**

- Modify `apps/desktop/src/renderer/src/ModalDialog.tsx` only if runtime testing finds a shared dialog issue.
- Modify `apps/desktop/src/renderer/src/BillingViews.tsx`, `PaymentViews.tsx`, `MasterDataViews.tsx`, and `CollectionsView.tsx` to replace JavaScript prompts/confirmations.
- Extend `apps/desktop/src/renderer/src/ModalDialog.test.tsx` and owning view tests.
- Extend `tests/seeded-state-electron.mjs` for real pointer activation; use existing Electron Playwright launch and synthetic seeded records.

**Steps:**

1. Add a failing test for each high-risk trigger: invoice adjustment, invoice void, payment reversal, GCash rejection, collection reconciliation, collection close, and plan price change. Assert that clicking the source button opens the named dialog.
2. Run the existing seeded Electron flow and capture the affected dialog state. Record whether the handler ran, whether `window.prompt`/`confirm` returned, and whether a dialog entered the browser top layer. Do not infer root cause from Testing Library alone.
3. Convert one trigger at a time to controlled app dialog state. Keep each dialog’s existing API method, input validation, permission prop, and error behavior. Require explicit cancel/confirm; require reason text for correction/rejection actions; show affected period/amount before posting or reversal.
4. Improve the shared dialog only if a failing real interaction identifies a shared defect. Preserve focus on close, Escape handling, backdrop handling, and clicks inside content.
5. Verify pointer click, Enter/Space activation, focus, cancel/no-mutation, confirm/API-call, and safe error states. Run focused view tests and `npm run verify:seeded-ui` with the configured local seeded credentials when available.

**Done when:** No `window.prompt` or `window.confirm` remains in user-facing action flows; real source-button clicks open dialogs in Electron; cancel performs no mutation; successful confirm calls the expected existing API exactly once.

### Slice 1 — Set visual foundations and redesign the sidebar

**Outcome:** A clear, polished shell with expanded/collapsed navigation and distinct active, hover, and keyboard focus states.

**Files:**

- Modify `apps/desktop/src/renderer/src/App.tsx`, `navigation.ts`, `App.test.tsx`, and `styles.css`.
- Keep `visibleNavigation(permissions)` as the permission-filtered navigation source; do not add fake destinations.

**Steps:**

1. Add tests for expanded/collapsed states, persistence after view changes/reload, active item in each state, permission-filtered groups, icon accessible names, group disclosure, focus-visible styling, and the mobile drawer close paths.
2. Introduce CSS variables for the approved canvas/surface/ink/brand/status palette, quiet borders, control/card/dialog radii, and spacing scale. Keep ordinary cards flat; reserve elevation for popovers and dialogs.
3. Add a labeled collapse control. Use a 256 px expanded sidebar and 72 px collapsed rail. Add Lucide destination icons, concise tooltips, 180–220 ms width transition, and stable active marker. Keep active group open after a reload or route change.
4. Separate mouse hover/active visuals from keyboard `:focus-visible`; keep a high-contrast keyboard outline and remove misleading click-time rings only after keyboard tests prove focus remains perceivable.
5. Make narrow-window navigation a scrim-backed drawer with Escape, close button, focus handling, and automatic close after a destination is selected.
6. Inspect Electron screenshots at 1440 × 900, 960 × 640, and narrow/mobile widths; adjust only values that visibly fail the design spec.

**Done when:** A user can collapse/expand with mouse or keyboard, current page stays obvious, all granted destinations remain reachable, and no content or pointer target is clipped at minimum desktop width.

### Slice 2 — Rebuild the shared page frame and visual hierarchy

**Outcome:** Pages share a consistent top bar, title region, action placement, spacing, and surface hierarchy.

**Files:** `App.tsx`, `styles.css`, `App.test.tsx`, and existing screen view components only where duplicate titles or alert placement require a small adjustment.

**Steps:**

1. Test one top-level page title, one page purpose line, search, session menu, alert placement, and shell layout in both sidebar modes.
2. Reduce top bar to 64–68 px; include the page label once. Keep global subscriber search visible and keyboard-operable.
3. Standardize page intro, primary action, inline exception, section heading, data table, status badge, and empty-state patterns.
4. Use consistent max widths for forms and full width for tables; align content to one left edge. Avoid oversized empty card regions and duplicate heading bars.
5. Add small transitions for nav, controls, and overlays; add `prefers-reduced-motion` rules. Avoid motion on money values and dense rows.
6. Capture shell and representative page screenshots at minimum and normal window sizes; resolve visible overlap, clipping, or broken tab order.

**Done when:** One representative list/form page and one detail page use the shared frame without duplicated headings, detached alerts, or inconsistent action hierarchy.

### Slice 3 — Receivables follow-up workspace

**Outcome:** Staff can see what needs follow-up, choose a subscriber, review context, and take only a permitted service action.

**Files:** `ReceivablesView.tsx`, `ReceivablesView.test.tsx`, `styles.css`, and `tests/task7-electron.mjs`.

**Steps:**

1. Add tests for current local as-of date, summary/list consistency, aging selection, sort order disclosure, no rows, load/error state, permission-hidden settings/actions, account detail, and service-history actions.
2. Reorder page to: compact as-of toolbar; priority summary; labeled aging strip; follow-up queue; secondary delinquency policy.
3. Put oldest unpaid date, months overdue, arrears, service state, area/collector, and next permitted action in a consistent row hierarchy. Preserve server filters and pagination.
4. Replace any destructive browser prompt with dialogs from Slice 0. Show reason/date/fee/action summary and refresh rows and service history after success.
5. Handle stale requests so a previous as-of response cannot overwrite the newly selected date. Keep summary and row result paired to the requested date.
6. Update the Electron flow to click a real eligible account row, verify detail contents, cancel one service action without a request, then validate a safe eligible flow using synthetic data.

**Done when:** User can identify the right follow-up from summary and queue; date labels match the data; read-only roles see no mutation affordance; state conflict is explained without stale UI.

### Slice 4 — Subscriber workspace and account journey

**Outcome:** Subscriber identity and service context persist through activity, billing, payment, and service-history drill-ins.

**Files:** `MasterDataViews.tsx`, `SubscriberActivity.tsx`, `SubscriberQuickSearch.tsx`, their tests, `App.tsx`, and `styles.css`.

**Steps:**

1. Test search keyboard paths, loading/empty/error states, role-safe event visibility, profile context, and direct links to authorized workspaces.
2. Redesign the profile hero around name/account number, active/inactive service state, area/collector, balance context when authorized, and a small set of permitted primary actions.
3. Keep Activity as a time-ordered overview; preserve distinct Service, Billing, Ledger, Contacts, Addresses, and service-history tabs.
4. Reduce table density without removing useful columns; use clear statuses and selected-tab state.
5. Make quick search results consistent with account rows and close/return behavior. Verify a user can go Receivables → profile → ledger and return without losing context.

**Done when:** Staff can identify the account at every step and navigate to permitted detail without repeated searches or permission leakage.

### Slice 5 — Billing and payment workspaces

**Outcome:** Billing period review, cashier posting, GCash verification, receipt, and corrections have clear sequential states.

**Files:** `BillingViews.tsx`, `PaymentViews.tsx`, related tests, `styles.css`, and `tests/task4-electron.mjs` / `tests/task5-electron.mjs`.

**Steps:**

1. Add tests for no eligible invoices, draft review, failed finalization, direct payment without a fresh preview, oldest-first allocation, excess credit, pending/rejected GCash, posted receipt, and reversal permission.
2. Billing hierarchy: select period → generate draft → review count/total/invoices → explicit finalization. Finalized invoices remain read-only except existing linked adjustment/void actions.
3. Cashier hierarchy: find subscriber → amount/method → allocation preview → explicit post or pending GCash submission → receipt/result.
4. Payment history uses recognizable status wording, receipt/refund relationships, reason text, and next actions. Do not show receipt for pending/rejected GCash.
5. Use Slice 0 app dialogs for finalization, adjustment, void, rejection, and reversal. Preserve integer-centavo conversion and exact bridge signatures.
6. Verify responsive table overflow, keyboard focus, print receipt, and full seeded Electron path.

**Done when:** Every financial action makes effect and amount clear before confirmation; GCash cannot appear paid until approved; correction history remains traceable.

### Slice 6 — Collection route and remittance

**Outcome:** Route work, per-account collection, remittance difference, and batch status read as one sequence.

**Files:** `CollectionsView.tsx`, `CollectionsView.test.tsx`, `styles.css`, and `tests/task6-electron.mjs`.

**Steps:**

1. Test every lifecycle status, legal next action, empty assignment, pending proof, signed shortage/overage, permission visibility, and dialog cancellation.
2. Batch list emphasizes route, owner, assigned accounts, expected amount, and latest actionable stage.
3. Batch detail groups lifecycle, route/account list, record action, remittance, and reconciliation. Keep print route sheet separate from app chrome.
4. Display signed difference with words and amount before reconciliation/close; preserve the API-calculated difference and state transitions.
5. Verify all account and remittance actions at 960 px and with keyboard only.

**Done when:** Staff sees current step and only legal next actions; shortage/overage cannot be missed or silently normalized.

### Slice 7 — Home analytics and reports

**Outcome:** Each role sees useful next actions; report catalogue answers operational questions and protects audit data.

**Files:** `DashboardView.tsx`, `ReportingViews.tsx`, their tests, `styles.css`, and `tests/task8-electron.mjs`.

**Steps:**

1. Test role-gated Home content, chart/table parity, no-warning empty state, grouped report options, audit visibility, date context, empty/error/paginated/export states.
2. Home order: needs-attention queue → role-relevant summary figures → billing/collection trend → secondary activity. Each item drills into an existing authorized workspace.
3. Use restrained chart color, clear axes and period, and the existing table equivalent. Remove any chart that cannot cite its source/period.
4. Reports group by revenue/collection, subscriber account, and controls/audit. Make page preview versus full filtered export explicit; preserve filters after cancel/error.
5. Verify auditor remains read-only and API `audit.view` checks stay unchanged.

**Done when:** Home answers “what next?” for each role; reports are discoverable, dated, exportable, and permission-safe.

### Slice 8 — Plans, services, and recovery

**Outcome:** Remaining workspaces match the shared visual language without implying unsupported user administration.

**Files:** `MasterDataViews.tsx`, `OperationsView.tsx`, related tests, `styles.css`, and existing Electron scripts.

**Steps:**

1. Test plan create/update, service actions, backup/restore visibility, dialog cancel, busy/error, and read-only behavior.
2. Plans use a compact creation area and a searchable status/price table. Historical price changes stay visible and use reasoned dialogs.
3. Services use clear account state and chronological control history with only permitted operations.
4. Recovery shows readiness, backup status, progress, and consequences before restore; retain existing exact typed confirmation requirements.
5. Keep unsupported user/role administration out of the navigation until its API and requirements have an approved separate plan.

**Done when:** Existing service and recovery actions are clear and role-safe; no placeholder feature is disguised as complete.

### Slice 9 — Cross-role finish and regression review

**Outcome:** The redesigned application works consistently at desktop and compact widths, for every existing role and input method.

**Files:** All changed renderer tests, `tests/seeded-state-electron.mjs`, `styles.css`, and `docs/manual/USER_MANUAL.md`.

**Steps:**

1. Run full database/API/desktop tests, formatting, lint, typecheck, and all relevant task verification scripts.
2. Run synthetic seeded Electron flows for Owner, Cashier, Auditor, Technician, and a read-only role. Check navigation, hidden actions, dialog activation, search, and drill-down return paths.
3. Capture 1440 × 900 and 960 × 640 screens for Home, Subscribers, Receivables, Billing, Payments, Collections, and Reports. Check sidebar expanded/collapsed, table overflow, dialogs, and print routes.
4. Exercise keyboard-only flow, reduced motion, focus return, dialog Escape/cancel, and visible focus after mouse navigation.
5. Update the manual only where visible labels or workflows changed. Record any role/test fixture that cannot run; do not claim it passed.

**Done when:** All checks pass, no unresolved interaction defect remains, and docs describe actual screens.

## Execution rules

- Implement one slice at a time. Each slice starts with focused failing tests, then the smallest complete change, then focused and adjacent regression checks.
- Review screenshots and interaction state after each UI slice; do not defer all visual QA to the end.
- Keep accepted behavior/API signatures stable. Propose a separate scope change if visual work exposes a real business-rule or API gap.
- The earlier workflow redesign remains implemented. This plan is a new visual and interaction pass, not a reversal of permission, accounting, or data-flow safeguards.
