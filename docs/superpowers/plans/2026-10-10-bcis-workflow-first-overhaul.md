# BCIS Workflow-First Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement only after this design and order have been reviewed with the owner; this document is the requested plan, not permission to ship an unreviewed workflow.

**Goal:** Replace table-led BCIS screens with clear role work desks, actionable cards, focused details, and real multi-step entry/posting flows.

**Architecture:** Retain Electron/React, typed preload, Fastify, PostgreSQL, and authoritative financial records. Replace one end-to-end role journey per slice; extend the API only when a preview, summary, or safe commit needs server support. Keep old destinations reachable behind a temporary route/feature switch until replacement journeys pass real Electron checks.

**Tech Stack:** Existing TypeScript, React, Electron, Fastify, Zod, PostgreSQL, Vitest/Testing Library, and Playwright Electron harness. Reuse existing icon/chart primitives where fit; add no UI package merely for visual polish.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-workflow-first-experience.md`

## Global constraints

- Do not build around the existing page arrangement. Reuse domain rules and source records, not the current layout.
- All write permissions are enforced by Fastify. Hidden controls are only a presentation rule.
- Integer centavos, transactional posting, idempotency, immutable posted history, linked corrections, Zod validation, DB uniqueness, and synthetic data remain required.
- Auditor remains read-only until an explicit permission change is separately designed.
- No placeholder destination, fabricated chart, or fake draft-save button.
- Each slice must work with mouse and keyboard in Electron at 1440×900 and 960×640, including reduced motion and error states.
- A 2-step task may use a focused sheet; reserve wizards for 3+ meaningful steps.
- Preserve previous saved data and compatibility with the API during staged rollout; deploy schema before dependent client code.

## Review focus

1. A card looks actionable but click/Enter does nothing: verify the full Electron source-to-result path, not just isolated render.
2. A wizard preview becomes stale before posting: server recalculates transactionally or returns conflict and forces fresh review.
3. A role sees a permitted action but gets `403`, or sees a forbidden action: cross-check seeded permissions and direct API calls.
4. A summary card disagrees with its drill-down at the same as-of date: assert consistent server filter/date basis and totals.
5. A visual change hides an important correction or financial status: retain text, source link, and immutable history at every detail level.

## File map and work boundaries

| Responsibility   | Existing entry point                                                         | Planned location/change                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell/navigation | `apps/desktop/src/renderer/src/App.tsx`, `navigation.ts`, `styles.css`       | Split shell and common UI into focused files under `apps/desktop/src/renderer/src/ui/` as first slice needs them; avoid one giant CSS file growing indefinitely. |
| Customer work    | `MasterDataViews.tsx`, `SubscriberActivity.tsx`, `SubscriberQuickSearch.tsx` | Extract `features/customers/` components and wizard state by task while keeping old view behind route switch.                                                    |
| Billing/payment  | `BillingViews.tsx`, `PaymentViews.tsx`                                       | Extract `features/money/` work desks and wizards.                                                                                                                |
| Field work       | `CollectionsView.tsx`, `ReceivablesView.tsx`                                 | Extract `features/field-work/` cards, detail sheets and cases.                                                                                                   |
| Insights/system  | `ReportingViews.tsx`, `OperationsView.tsx`                                   | Extract question-led reports and guarded recovery flow.                                                                                                          |
| Shared contracts | `packages/contracts/src/index.ts`, `apps/desktop/src/shared/desktop-api.ts`  | Add bounded DTOs only as endpoints are implemented; keep old contracts during transition.                                                                        |
| API              | `apps/api/src/*-routes.ts`, domain services                                  | Add preview/summary/search and idempotent commit where required. Business rules stay in services.                                                                |
| Data             | `packages/database/src/schema.ts`, migrations                                | Add only persisted workflow state proved necessary; avoid a speculative draft table.                                                                             |
| Docs             | `docs/manual/USER_MANUAL.md`, API/architecture docs                          | Update after each shipped journey and record route/contract changes.                                                                                             |

Use the existing names until a slice actually extracts a component. The paths under `features/` are planned destinations, not files that already exist.

## Phase 0 — Protect, discover, and prototype (no product behavior change)

### Task 0.1: Preserve a reviewable baseline

- [x] Audit `.gitignore` and repository contents for credentials, dumps, generated output, and real records. Local GCash attachment images and generated captures were excluded from the baseline.
- [x] Initialize Git and create a private GitHub repository. Baseline commit `4a81a17` and tag `pre-workflow-overhaul-2026-10-10` are pushed to [the private BCIS repository](https://github.com/Valhaimerd/BCIS-Subscription-Billing-System). To inspect this immutable starting point later, run `git switch --detach pre-workflow-overhaul-2026-10-10` in a separate checkout; do not reset a working implementation branch.
- [x] Inventory current API route families, role rules, prior plans/manual, and the 13 user screenshots. Label untested staff assumptions in the spec rather than promoting screenshot data to requirements.

**Done when:** Baseline is available on GitHub, with source/docs included and secrets/data excluded. This task may be completed during planning; no UI implementation is implied.

### Task 0.2: Validate tasks and a clickable prototype

- [ ] Ask one representative each of owner, cashier, supervisor, auditor, and technician to perform two real-world tasks using synthetic records. Record where they hesitate, mis-click, backtrack, or need a table.
- [x] Prototype three shell/card concepts and one Receive payment wizard using BCIS terminology and synthetic data. The [clickable prototype](../../prototypes/workflow-first/README.md) was visually compared at 1440×900 and 960×640, plus narrower 720×900 and 390×844 layouts. Final token/layout choice remains subject to staff observation.
- [x] Owner selected Concept A (Workbench) as the direction for the live shell. Staff task observations remain open before changing domain workflows.
- [ ] Resolve whether service work belongs under Customers or Field work for the technician based on task observations. Keep the selected IA consistent across sidebar, search, and result breadcrumbs.
- [ ] Freeze a short copy glossary: subscriber/account/service, draft/finalized/posted, payment/verification, arrears/overdue, batch/remittance. Fix contradictory wording before component work.

**Done when:** Owner can review clickable shell and one complete wizard, and task observations support the chosen navigation. This is a design gate, not a demand for a new framework.

## Phase 1 — Foundations that make every later slice coherent

The first live slice implements Workbench tokens and the permission-filtered shell on branch `feature/workflow-first-shell`. It moves the collapse control into the sidebar, shows supported destinations without nested group toggles, and preserves the saved icon-rail preference.

The second slice adds reusable actionable work cards and a focused detail sheet to Today. It uses existing permission-filtered dashboard data, keeps a single recommended action visible, and moves detailed figures into focused sheets and Reports. The cashier payment flow and reusable wizard frame remain the next vertical slice.

### Task 1: Tokens, interaction components, and real clickable controls

**Files:** `App.tsx`, `styles.css`, `ModalDialog.tsx`, `ActionDialog.tsx`; add focused `ui/` files and colocated tests as components are extracted.

- [ ] Write component tests for filled primary, tinted secondary, tertiary, destructive, disabled-explanation, card-as-link/button, keyboard focus, and sheet/modal focus return.
- [ ] Introduce color/spacing/type/radius/elevation/motion tokens from the spec. Check text/control contrast and target sizes in actual rendered states.
- [x] Build a work-card component with title, context, optional status, and real action. Static cards retain their existing non-interactive styling; the reusable work card is always a button.
- [ ] Build a reusable side sheet for record detail and a full-page wizard frame with step title, progress, Back/Continue, errors, review, and unsaved-exit handling.
- [ ] Verify clicks, Enter/Space, Escape, background scroll/focus, and reduced motion in Electron.

**Done when:** A user can tell primary action from secondary navigation at a glance, and every elevated/hovered element acts as advertised.

### Task 2: Replace the shell and sidebar

**Files:** `App.tsx`, `navigation.ts`, `styles.css`, `SubscriberQuickSearch.tsx`, shell tests.

- [ ] Test permission-filtered work destinations, sidebar toggle location, persisted expanded/rail state, active marker, tooltip/flyout, narrow drawer, and search focus shortcut.
- [ ] Move collapse control into the sidebar header. Make Today, Customers, Money, Field work, Insights, and System the top-level mental model; expand only destinations supported for the role and current implementation.
- [ ] Keep top bar limited to search, working context and profile/session. Preserve prior search and page state when a detail sheet closes.
- [ ] At 960×640 and higher zoom, confirm main CTA and sidebar control remain visible; test keyboard route order and click targets in Electron.

**Done when:** Staff never have to look in the top bar to collapse navigation, and current location is clear in expanded, collapsed, and drawer modes.

## Phase 2 — First complete journey: Cashier

### Task 3: Search → account card → Receive payment → receipt

**Files:** `MasterDataViews.tsx`, `PaymentViews.tsx`, `SubscriberQuickSearch.tsx`, `payment-routes.ts`, `payments.ts`, `packages/contracts/src/index.ts`, `desktop-api.ts`, tests and manual.

- [x] Reuse the existing permission-safe, paginated subscriber search DTO; no additional role work-summary DTO is needed for this flow.
- [x] Update focused payment UI tests for account selection, method-specific fields, oldest-first allocation review, GCash pending state, server conflict, and receipt destination; the full repository suite passes.
- [x] Implement subscriber search cards with explicit account number, service and state, then a focused payment wizard. Carry selected account context forward without asking again.
- [x] Add a server preview fingerprint; post checks it inside one transaction and rejects changed balances for re-review. Use an idempotency key for the final direct post.
- [x] Return an explicit receipt or pending-verification card with the correct next action. Keep history in its separate register view.
- [ ] Run focused API/UI tests, a real Electron click flow, and role checks for cashier and auditor. Compare task completion with the baseline observation.

**Done when:** Cashier can find a subscriber, understand allocation, post once, and reach the right receipt/status without scanning a ledger table.

## Phase 3 — Customers and plan setup

### Task 4: Subscriber and service journeys

**Files:** `MasterDataViews.tsx`, `SubscriberActivity.tsx`, `master-data-routes.ts`, `master-data.ts`, contracts/bridge, colocated tests and manual.

- [x] Reuse existing permission-safe, paginated subscriber and detail DTOs; they provide the card and profile fields needed here.
- [x] Implement search customer cards and sticky profile identity with Overview, Services, Money, and History task tabs. Preserve permission-filtered data and links to source records.
- [x] Implement Register subscriber as Identity → Contact/location → Billing defaults → Review. Validate per step and open the new profile after one atomic create.
- [x] Implement Add service as Choose plan → Installation/assignment → Billing schedule → Review. Show the monthly plan rate without claiming a first invoice total before billing generates it.
- [x] Test duplicates, missing optional data, back navigation, mid-flow exit, server errors, role restrictions, and 960×640 overflow in focused tests and a real Electron click flow.

**Done when:** New staff can register and connect a service without facing a long all-field form; existing profile history remains findable.

### Task 5: Plan catalogue and price change

**Files:** `MasterDataViews.tsx`, master-data API/service, contracts, tests and manual.

- [x] Build plan cards by type with price, speed/channels, status, and a View plan action. Keep a compact register for comparison.
- [x] Add the three-step Add plan flow and a price-change review sheet with required reason and future-rate explanation.
- [x] Confirm plan-code uniqueness in the database schema and test that a price update touches only service plans; billing reads each service account's captured rate.

**Done when:** Plan selection is card-based, and price-change impact is explicit before confirmation.

## Phase 4 — Billing and field work

### Task 6: Billing run and invoices

**Files:** `BillingViews.tsx`, `billing-routes.ts`, `billing.ts`, contracts/bridge, tests and manual.

- [x] Add a read-only server eligibility/exception summary. Eligibility uses active services whose billing start date is on or before the selected month's last day; it is recalculated during draft generation.
- [x] Build a selected-month run card and other-month cards. Select month → Eligibility review → Draft generation → Draft review/finalize are distinct states.
- [x] Show exclusions before generation, invoice cards for quick reading, a paged month-scoped register for reconciliation, and invoice detail with lines, corrections, allocations, print, and linked receipts.
- [x] Guard repeated generation clicks; retain the existing invoice uniqueness constraint. Finalization locks the cycle row and posts matching ledger debits transactionally, with immutable corrections.
- [x] Cover empty draft, changed preview result, interrupted eligibility load, role denial, register paging, and linked invoice/receipt navigation in tests.

**Done when:** A period can be reviewed and finalized from a compact, understandable flow with totals traceable to invoices.

### Task 7: Collection batch desk

**Files:** `CollectionsView.tsx`, `collection-routes.ts`, `collections.ts`, contracts/bridge, tests and manual.

- [x] Reuse the batch summary DTO through six bounded status queries for lane counts and cards.
- [x] Build Prepare/In field/Reconcile lanes and a step flow for area/collector selection, account review, and issue batch.
- [x] Build difference-first remittance, a required reason for Cash differences, and read-only closed-batch evidence.
- [x] Check permissions and selected-account creation at the API boundary; retain transactional duplicate and transition guards, and expose batch audit history.

**Done when:** Supervisor sees what batch requires action without reading a long register; financial differences are unmistakable.

### Task 8: Receivable case desk

**Files:** `ReceivablesView.tsx`, `receivable-routes.ts`, `receivables.ts`, contracts/bridge, tests and manual.

- [ ] Define stable queue ordering and as-of semantics; ensure summary/chart/card results use the same date and filters.
- [ ] Build Act today/Due soon/All case cards and an aging distribution with labels, counts, values and drill-down.
- [ ] Build case sheet with source invoice/ledger links, last payment, service state, policy basis, and permitted action.
- [ ] Move delinquency policy controls to owner System settings. If a contact log is desired, design its DB/audit contract separately before showing a “contacted” action.
- [ ] Test stale requests, policy threshold edge cases, auditor read-only view, state conflicts and history after suspension/reconnection.

**Done when:** A user can choose and resolve a follow-up case without a broad table or policy form interrupting the queue.

## Phase 5 — Insight and operational trust

### Task 9: Reports and auditor trace

**Files:** `ReportingViews.tsx`, `report-routes.ts`, `reports.ts`, contracts/bridge, tests and manual.

- [ ] Map each report question card to a real server report and document definition/date basis. Drop a card if no authoritative source exists.
- [ ] Implement preview with compact defaults, optional advanced filters, chart + text/table equivalent, and record-level drill-down.
- [ ] Ensure print/export uses the same filter snapshot and permission as the preview; show generation states and failures.
- [ ] Test adjustment/reversal trace, source record, actor/time/reason, and no write controls for auditor.

**Done when:** Auditor can answer a concrete question and trace its number to source records without hunting through a universal filter panel.

### Task 10: Backup and recovery

**Files:** `OperationsView.tsx`, `operation-routes.ts`, `operations.ts`, contracts/bridge, tests and manual.

- [ ] Build health, last verified backup and retention cards; history timeline with register option.
- [ ] Add a guarded restore flow with backup selection, verification, impact review, safety backup and explicit confirmation; preserve current server safety controls.
- [ ] Check failure/interruption reporting, owner-only authorization, unavailable files, and restore result links in real Electron.

**Done when:** Owner can understand backup state and restore impact without relying on a small ambiguous table-row action.

## Phase 6 — Remove the old experience safely

### Task 11: Cross-role acceptance and retirement

- [ ] Run scripted tasks with synthetic data for owner, administrator, cashier, supervisor, auditor, technician and viewer. Check real mouse click and keyboard paths, 1440×900 and 960×640, zoom, focus, reduced motion, loading, empty, errors and permission changes.
- [ ] Reconcile every dashboard total with its linked report/record set; verify financial invariants, old URLs/deep links, migration compatibility and backup restore point.
- [ ] Compare task time/error counts to Phase 0 baseline. Fix observed confusion before switching default navigation.
- [ ] Update user manual, architecture and API docs; remove superseded screens/routes only after equivalent tasks pass. Archive earlier visual plans as history, mark this plan as successor.
- [ ] Run repository-required format, lint, type, tests and builds at each implementation slice, not just at the end. Commit each accepted slice and retain a rollback tag.

**Done when:** All permitted workflows remain complete, user observation supports the new flow, and the old table-led route can be retired without data loss.

## Dependencies and decision gates

Order is deliberate: shell/components → cashier journey → customers → billing → field work → insights/system → retirement. Task 3 creates the interaction pattern and safe post/preview approach reused later. Tasks 6–8 can be estimated separately after Task 3; do not merge them into a single giant change.

Before implementation, the owner should review a clickable prototype and the role-task inventory. These are design choices that cannot be settled from screenshots alone: whether Customers or Field work owns the technician entry, whether recent-account cards are useful for cashier, and which three priority cards each role needs. Implementation can still start with the shared shell after the GitHub baseline and prototype are available.

**Additional plans to create during execution:** (1) a contract/migration plan for each server-backed preview or persisted case note, (2) an accessibility and usability test script, (3) a release/rollback plan for the desktop installer and LAN API, and (4) a separate access-management spec if owner administration is requested. These are bounded deliverables inside the relevant slices; none justifies a speculative backend rewrite today.
