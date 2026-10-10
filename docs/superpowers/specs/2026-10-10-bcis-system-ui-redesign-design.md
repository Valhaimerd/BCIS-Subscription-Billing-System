# BCIS System UI Redesign — Design Proposal

**Status:** Proposed; awaiting owner review before implementation planning.

## Intent

Make BCIS faster to understand and safer to operate for owners, administrators, cashiers, collection supervisors, accounting/auditors, technicians, and read-only viewers. Keep the documented subscriber-to-cash lifecycle as the organizing model, then redesign navigation, dashboards, subscriber context, and workflow screens around the decisions each role makes.

The redesign is for the existing Windows Electron desktop client. It keeps the Fastify API as the source of business data and authorization. It does not replace the system architecture.

## What users need

- **Owner / Administrator:** see business health and exceptions, finish period setup, monitor staff activity, and reach administration or recovery when permitted.
- **Cashier:** find the correct subscriber quickly, understand current charges/credit, record or verify a payment, and issue a receipt.
- **Collection Supervisor:** prepare routes, monitor batches, resolve remittance differences, and follow overdue accounts.
- **Accounting / Auditor:** reconcile billed, collected, allocated, remitted, and outstanding amounts; inspect corrections and audit evidence without mutating records.
- **Technician:** identify the subscriber and service, see the current service state and history, and record only permitted service actions.
- **Read-only Viewer:** explore the same permitted operational context without seeing action controls that imply write access.

Frontend controls remain a usability aid. The API continues to enforce every permission.

## Proposed outcomes

1. A role-aware home view answers “what needs attention next?” before showing secondary metrics.
2. Navigation follows the real work sequence and exposes only modules granted by the current session.
3. A subscriber workspace links identity and service state to invoices, payments, receipts, collections, and service history.
4. Financial charts explain a period and its source figures, offer a useful table equivalent, and link to the filtered records behind them.
5. Existing module workflows become easier to scan and complete without changing financial or authorization rules.
6. Shared interaction patterns make search, filters, tables, forms, confirmation, loading, errors, empty states, and success feedback predictable.

## Non-goals

- No change to billing rules, allocation order, financial posting, reversal/adjustment semantics, audit retention, or role permissions as part of a visual redesign.
- No customer-facing portal, mobile application, cloud service, offline synchronization, GIS route optimization, automated payment verification, AI forecasting, or notification system.
- No speculative KPI or chart that cannot be calculated from authoritative records and given a clear period/as-of definition.
- No wholesale framework or component-library replacement. Reuse installed React, Lucide, and existing project patterns unless an approved implementation plan proves a concrete gap.

## Current state and evidence

- The desktop client is Electron + React. `apps/desktop/src/renderer/src/App.tsx` owns the authenticated shell and permission-filtered sidebar; feature views live in `MasterDataViews.tsx`, `BillingViews.tsx`, `PaymentViews.tsx`, `CollectionsView.tsx`, `ReceivablesView.tsx`, `ReportingViews.tsx`, and `OperationsView.tsx`.
- The current shell groups pages under Workspace, Revenue, and Operations. Navigation switches local state rather than using separate routes. The global search currently sends focus to Subscribers.
- The current dashboard has six KPIs and summaries for billing versus collection, payment mix, AR aging, collector performance, alerts, and recent payments. It renders lists/strips, not time-series charts. `ReportingViews.tsx` supplies a fixed date range rather than a user-selected working period.
- `GET /api/v1/dashboard` returns authoritative totals, payment methods, aging buckets, collector totals, alerts, and recent payments. It requires `report.view`. There are report endpoints for collections, billing vs collection, revenue, AR aging, subscriber master/SOA, collector performance, corrections, user activity, and audit.
- The user manual describes the end-to-end lifecycle: plan → subscriber → service → draft/finalize billing → receive/verify payment → ledger/receipt → field collection/reconciliation → receivables/service control → reports → backup.
- `docs/AUTHORIZATION_RULES.md` and `apps/api/src/seed.ts` define Accounting / Auditor as read-only, including audit access. `docs/manual/USER_MANUAL.md` conflicts by describing reversals as auditor work. The redesigned controls must follow the permission seed and server behavior; correct the manual in the documentation slice after verifying the exact intended authority.
- `docs/FRONTEND_ARCHITECTURE.md` describes an unrelated academic/FastAPI web client and does not match this Electron/Fastify repository. Replace it with verified BCIS desktop/API architecture during the documentation slice, preserving only facts confirmed by source.
- Existing rules remain binding: Electron renderer isolation, Fastify authorization, Zod trust-boundary validation, integer-centavo money, transactional financial posting, immutable posted history with linked corrections, and synthetic development data.

## Experience concept

### Navigation and shell

Organize the persistent navigation around work, with section labels hidden when all contained pages are inaccessible:

```text
Home
Customers
  Subscribers
  Plans (only for roles with access)
Revenue
  Billing
  Payments
Field work
  Collections
  Receivables
Service
  Services
Insights
  Reports
  Audit (only with audit.view)
Administration
  Users and access
  Backup and recovery
```

Keep names consistent with button labels, headings, and result messages. Add global search for subscriber number/name/contact/service number and common record identifiers (invoice, receipt, batch) only where existing APIs can safely support each type. Search result rows identify record type and status. A result opens the relevant screen/profile without bypassing permission checks.

### Home dashboard

Use a single role-aware Home destination. Reuse a restrained dashboard frame, but prioritize sections by permission and job:

- **Owner / Administrator:** working-period summary, billed and collected totals with a monthly trend, outstanding/overdue receivables, pending verification/reconciliation/finalization counts where available, and an attention list ordered by consequence and age.
- **Cashier:** prominent subscriber lookup and Receive payment action, pending GCash verification if permitted, today's posted payments, and recent receipts. Do not show management-only backup or administrative actions.
- **Collection Supervisor:** route batches by lifecycle state, remittance differences, collection totals by collector/area, overdue follow-ups, and a direct route/batch action.
- **Accounting / Auditor:** date/as-of controls, billed-to-collected comparison, allocation and remittance reconciliation, AR aging, reversal/adjustment/void register, and audit activity. Read-only controls only.
- **Technician:** subscriber/service lookup, service state counts or assigned work only if the existing API can authoritatively supply them, plus direct links to service status/history.
- **Read-only Viewer:** relevant summary and trend panels only for data covered by existing read permissions; no mutation affordances.

Home must remain useful when data is absent or the API is unavailable: show a clear empty/loading/error state with a recovery action where appropriate, not invented zeroes or sample data.

### Analytics and graphs

Prioritize a small set of decision-support visuals:

1. **Billing and collections trend:** monthly billed versus posted collected amounts for a selectable range. State whether the comparison uses invoice period or payment date, show totals and the difference, and let users open the matching report.
2. **Receivables aging:** Current / 1–30 / 31–60 / 61–90 / 90+ as-of a selected date. Use a stacked bar or clear horizontal distribution with amount and account count; link each bucket to the matching receivables filter.
3. **Collection accountability:** collected versus remitted by collector or batch, with shortage/overage visibly signed and linked to reconciliation details.
4. **Payment method mix:** retain only where it helps cashier/accounting decisions; show both amount and count, and provide a list/table equivalent.

Charts must have keyboard-accessible summaries, readable labels, currency formatting in PHP, and a table/list equivalent. Avoid pie charts for close comparisons, unlabeled hover-only values, animation that delays data, and color as the sole status signal. Respect reduced motion.

### Subscriber workspace and lifecycle

Make subscriber search the fast entry point. A profile should have a stable identity header (account number, name, current status, area/collector, balance/as-of) and a chronological history. Keep the common tasks visible: view services, invoice/billing, payments/receipts, ledger/SOA, collection activity, and service control. Show one clear next action only when the current role has the required permission and the account state allows it. Keep posted history and reasons visible when a reversal or adjustment exists.

The profile timeline is contextual navigation over existing source records, not a new editable history store. Design it so permissions can hide action affordances without hiding evidence a role is allowed to review.

### Visual direction and interaction

- Continue the approved login visual language: deep BCIS navy, clean white/light workspace, clear blue action color, calm contrast, and softened transitions at large surfaces. Treat it as a starting point, not a mandate to apply the login split-panel everywhere.
- Use a compact persistent sidebar and a generous, aligned work canvas. Tables and financial values should carry more visual weight than decoration.
- Choose one characteristic moment per screen (e.g., a clean trend or a subscriber identity/status strip); keep other elements quiet. Avoid repeated cards, gratuitous gradients, all-caps eyebrow labels, and decorative metrics without an action.
- Use motion for state transitions, drawer/modal continuity, and short feedback after an action. Keep it brief, interruptible, and disabled/reduced when the operating-system preference requests reduced motion.
- Keep inputs labeled, focus visible, dialogs keyboard-operable, text legible at desktop zoom, and status understandable without color.

#### Compact visual system proposal

Use the existing product palette as the baseline, with semantic colors already present in `styles.css`:

| Token       | Value     | Use                                                          |
| ----------- | --------- | ------------------------------------------------------------ |
| BCIS navy   | `#0F2747` | Navigation, primary text emphasis, selected navigation       |
| Deep navy   | `#0A1C33` | Dense navigation/footer surfaces and restrained dark accents |
| Action blue | `#2563EB` | Primary actions, links, focus and chart series               |
| Canvas      | `#F6F8FB` | Main application background                                  |
| Surface     | `#FFFFFF` | Forms, work areas, tables, and dialogs                       |
| Muted       | `#64748B` | Secondary labels, helper text, and chart context             |

Keep existing semantic green/amber/red for success, warning, and danger, paired with text or icons. Use `Segoe UI Variable` (with the existing Segoe UI/Inter fallbacks) throughout for a familiar Windows desktop voice; distinguish hierarchy through size, weight, and spacing rather than adding a decorative display face. Align work content left, keep numeric columns right-aligned, and center only small confirmation or empty-state moments.

```text
┌───────────────┬────────────────────────────────────────────────────────┐
│ BCIS          │ Search records                 Period   User  Lock     │
│ Home          ├────────────────────────────────────────────────────────┤
│ Customers     │ Home / “what needs attention?”                         │
│ Revenue       │ [period summary]       [priority action queue]         │
│ Field work    │ [billed vs collected trend, with period and totals]     │
│ Service       │ [aging distribution]    [reconciliation exceptions]     │
│ Insights      │ [recent activity with permission-safe record links]     │
│ Admin         │                                                        │
└───────────────┴────────────────────────────────────────────────────────┘
```

The distinctive element is the connection from each trend or exception to the records and next permitted action behind it. This is specific to BCIS's reconciled billing-to-payment-to-collection workflow; avoid turning the dashboard into a generic grid of decorative metric cards.

**Self-review:** the existing navy/blue look is already recognizable and recently approved for login, so keep those colors rather than introducing a second brand. The current working dashboard is dense with repeated cards and report-like lists; the proposal moves to one trend, one prioritized work queue, and a small set of drill-downs so the primary story is operational and auditable.

## Data and backend boundaries

- Build metrics only from existing authoritative dashboard/report/receivable/collection/payment data.
- Before adding an endpoint, check whether an existing report or service can provide the result without inefficient repeated calls. Prefer one bounded summary query over client-side fan-out.
- If the approved dashboard needs data that cannot be obtained safely and efficiently, add a version-compatible Fastify endpoint/contract with shared Zod validation and server-side permission checks, update OpenAPI/API docs, and add route/service tests.
- Keep amounts in integer centavos through API and calculations; format only at the UI edge.
- Treat `asOf` separately from date range and label each chart with its date semantics. Never compare metrics with mismatched periods without saying so.
- Make role-aware sections a presentation convenience only. API permissions remain authoritative. Auditor read-only behavior follows server permissions until the owner explicitly approves a permission change.

## Suggested project boundaries

This redesign is large enough to plan as separate, reviewable vertical slices after this proposal is approved:

1. **Shell and navigation foundation:** information architecture, page heading/working-period behavior, global search entry point, shared UI states, responsive/accessibility rules, and documentation correction.
2. **Role-aware Home and analytics:** role-specific content selection, date controls, authoritative summary data, charts, table equivalents, and links to reports/receivables/reconciliation.
3. **Subscriber workspace and lifecycle:** profile information architecture, record search/deep links, lifecycle history, contextual next actions, and service/payment/billing drill-down.
4. **Operational workflow refinement:** billing finalization, payment/GCash, collection/remittance, receivable/service-control, and report/audit screen improvements, delivered as bounded module plans rather than one all-at-once rewrite.

Each slice should preserve working behavior and ship with its own API/UI checks. Avoid a big-bang rewrite; replace one coherent path at a time while keeping the application usable.

## Open decisions before detailed implementation plans

1. Confirm the proposed work-first navigation and role-tailored Home approach.
2. Confirm Accounting / Auditor remains read-only; the permission seed and authorization document currently say yes, while one manual section conflicts.
3. Choose the first implementation slice. Recommended: shell/navigation foundation, then role-aware Home/analytics, followed by subscriber workspace and operational modules.
4. Confirm whether global search should include invoice, receipt, and batch identifiers in its first slice, or start with subscribers/services and grow only after that path is solid.

## Approval gate

This is a design proposal, not implementation authorization. After the owner confirms or corrects the scope and open decisions, create one detailed `superpowers:writing-plans` plan per approved slice under `docs/superpowers/plans/`. Do not change product code until the corresponding implementation plan is approved.
