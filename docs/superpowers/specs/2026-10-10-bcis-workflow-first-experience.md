# BCIS workflow-first experience: product and interface specification

**Status:** Design direction for the next overhaul. The screenshots in the 2026-10-10 request are evidence of current friction, not a template to preserve. This supersedes the earlier table-led visual proposals wherever they conflict. No product code is changed by this document.

## The problem to solve

BCIS currently asks staff to scan large registers, interpret weak white controls, and complete too many fields at once. A new coat of paint would preserve the cognitive load. The new experience should make the next safe action obvious, show only the information needed to decide, and keep detailed records available on demand. The owner explicitly permits redesigning the workflow and backend contracts; the existing screen arrangement is not a constraint.

**Working hypothesis to validate with staff:** A cashier wants to finish one accurate payment in under a minute after finding an account; a supervisor wants to resolve exceptions without scanning an entire register; an auditor wants to trace a number to its source and correction history. Treat these as research assumptions, not measured facts.

### Non-negotiable business boundaries

- Electron renderer stays isolated; typed preload and Fastify API carry data. API authorizes every action.
- Currency values remain integer centavos. Financial posting uses PostgreSQL transactions and idempotency keys. Posted records are immutable; corrections are linked reversals or adjustments.
- Zod validates boundaries, unique identifiers have database constraints, and development screens use synthetic data.
- Auditor remains read-only unless a separately approved permission decision changes server rules.
- Every chart states its period, date basis, and drill-down source. No invented metric or decorative graph.

## Design concept: a work desk, not a report portal

The navigation leads to tasks. Each destination opens a **work desk**: a short header, one primary action, a small set of meaningful cards, and a queue of work. Selecting a card opens a side sheet or a focused full-page detail, preserving search/filter context. A dense register remains available through **View all records** for auditors, reconciliation, export, and bulk work; it is never the first impression. Cards are not identical boxes: their size, content, and emphasis follow decision priority.

```text
┌ sidebar ───────────────┐  ┌ top bar: Search records | Today/period | Profile ─┐
│ BCIS  [Collapse]       │  │ Today's work: Cashier                         │
│ Today     ●            │  │ [Find account / Receive payment]             │
│ Customers              │  │ ┌ Next action ────────┐ ┌ Verification ───┐ │
│ Money                  │  │ │ one decision         │ │ 3 awaiting     │ │
│ Field work             │  │ └──────────────────────┘ └──────────────────┘ │
│ Insights               │  │ Recent work / secondary detail on demand     │
│ System                 │  └──────────────────────────────────────────────┘
└────────────────────────┘
```

### Navigation and role entry

| Destination | First view | Secondary destinations |
| --- | --- | --- |
| Today | Role-specific priorities and one main action | Activity and relevant trends |
| Customers | Search and recent subscriber cards | Subscribers, services, plan catalog |
| Money | Task cards for billing and payments | Billing runs, invoices, receipts, payment history |
| Field work | Collection batches and follow-up cases | Routes, remittance, receivables, service controls |
| Insights | Question-led reports and audit | Exports, correction history, activity |
| System | Operational health | Backup/recovery; users/access only after real API exists |

Sidebar width: 248 px expanded, 68 px rail. The **collapse/expand button lives in the sidebar header**, next to BCIS identity, not in the top bar. Expanded groups show icon + label + optional count. Collapsed rail keeps current item visible with a 3 px accent bar, tinted active background and accessible tooltip; group menus can open anchored flyouts. The choice persists per device. At the 960 × 640 desktop minimum, avoid hiding main controls; at narrow widths use a scrim-backed drawer with an in-drawer close control. Role permissions remove unavailable destinations; an empty group disappears. Never show a dead link to an unbuilt feature.

The top bar is for search, context, and account controls. Search can return subscriber, invoice, receipt, and batch results only when server endpoints support permission-safe, bounded search. Each result says its record type and status. `Ctrl+K` opens the same search; Escape closes it. A direct link returns to the previous work desk with filters intact.

### Information budget

- Default first viewport: page purpose, one dominant action, at most three priority cards and one compact trend/queue preview. No full register above the fold.
- A card answers one question: **what**, **why it matters**, **what happens on click**. Example: “3 GCash payments need verification / oldest 2 hours / Review payments.” Use a real button/link, hover elevation, and visible focus. Static facts do not look clickable.
- Search and filter chips narrow the work queue immediately. Use saved view presets only after repeated use is observed; no speculative configuration system.
- A queue card shows name/identifier, amount or state, one reason for priority, and one primary action. Additional metadata lives in detail. Load 12–20 at a time with explicit **Load more**, not endless scroll.
- Dense tables are valid in a clearly labeled **Register view** for audit, cross-row comparison, and export. Preserve keyboard sorting, totals, and column labels. Provide a card/register switch only where both serve a real task.
- Every number links to the records behind it, with the same filters and as-of date. Card totals and results must reconcile.

## Visual language

**Personality:** assured utility for a billing and collection desk. Keep the approved login navy, but make the workspace warmer and more legible through contrast, tactile layering, and restrained blue/cyan cues. Avoid an all-grey grid or an equal-weight “SaaS card kit.”

| Token | Proposed value | Use |
| --- | --- | --- |
| Ink | `#10233F` | Primary text |
| Sidebar | `#0E2441` | Stable navigation anchor |
| Canvas | `#F1F5FA` | Cool workspace background |
| Surface | `#FFFFFF` | Cards, sheets, menus |
| Action | `#1959D1` | Primary CTA and active navigation |
| Action hover | `#1249AF` | Stronger interactive state |
| Signal cyan | `#21A6B8` | Selected data and chart accent, sparingly |
| Warning | `#A95812` | Follow-up attention, with icon/text |
| Danger | `#B42332` | Reversal/destructive confirmation, with text |

These are candidate tokens; final paired contrast is checked in implementation. Use Segoe UI Variable/Segoe UI with a tabular-numeral setting for currency and dates. Titles 30–36 px, section titles 20–24 px, body 14–16 px, supporting text at least 12 px with sufficient contrast. Avoid all-caps eyebrow labels everywhere. Keep line length around 65–75 characters in explanatory blocks.

Spacing scale: 4/8/12/16/24/32 px. Work canvas max width around 1320 px; forms 600–720 px. Card radius 16 px, controls 10 px, sheet/dialog 20 px. Use one quiet border (`#D6E1EE`) and depth only where hierarchy changes:

- **Canvas:** no shadow.
- **Resting work card:** subtle 0 1px 2px shadow; border remains visible.
- **Actionable/raised card:** 0 8px 24px soft navy shadow on hover/focus, 2–3 px translate at most; no motion on static metrics.
- **Floating sheet/menu:** 0 18px 48px shadow and opaque surface.
- **Modal:** 0 24px 64px shadow over a navy scrim around 45% opacity; backdrop blur up to 4 px only if performance allows, never as the sole distinction. A clear close button, focus trap, Escape behavior, and focus return are required.

Buttons: primary is filled action blue with white text, 44–48 px high; secondary uses a pale blue fill with blue text and border; tertiary is text-only for low-priority navigation; destructive is red-tinted and names the effect. An outline white button is not the default action. Icon-only controls need visible tooltip and accessible name. Disabled controls explain why, ideally adjacent to the control. Hover is supplementary; keyboard focus is a solid, offset ring. Charts and status use words/icons as well as color. Aim for WCAG 2.2 AA, with at least 24×24 CSS px targets and preferably 40–44 px for frequent controls.

Motion: action-led, not constant. Sidebar width 180–220 ms; card focus/hover 120–160 ms; sheet entrance 180–240 ms with fade and short horizontal travel; modal 160–200 ms fade/scale; success state 250 ms then settled text. No staggered parade of cards and no animating currency values. `prefers-reduced-motion` removes travel and keeps immediate state change. Loading skeletons match final card dimensions, then cross-fade briefly to avoid layout jumps.

## Screens and task flows

### 1. Today: a dashboard with a point of view

The header says “Good morning, [first name]” and the operational date. The dominant slot is role-dependent: Cashier **Receive payment**, Collection Supervisor **Review exceptions**, Owner **Review business health**, Auditor **Trace and reconcile**, Technician **Find service**. Below it: two or three live priority cards, one meaningful trend, and a short recent-work strip. A count of zero becomes “All caught up” with a link to the relevant register. The owner sees billed vs collected as a dated line/column comparison, receivable aging as horizontal bars, and exception totals. Cashier sees no management chart competing with account lookup. An auditor sees source period, cash date, posting state, and links to the immutable ledger. Every chart has an adjacent text summary and accessible data table option.

### 2. Customers: search and identity

Open on a large search field, “Recent accounts” cards, and filters for status/area. A subscriber card shows name, account number, service count, state, outstanding balance only if permitted, and a short next action. Selecting it opens a full profile with a sticky identity strip and four task tabs: **Overview**, **Services**, **Money**, **History**. Overview displays contact and service summary, not every field. History is a chronological, filterable event trail; posted financial records link to immutable detail. The separate top-level Services page becomes a service-focused view of this same data, not a duplicate subscriber table.

**Register subscriber wizard:** (1) Identity: name, unique account number or generated suggestion; (2) Contact/location: contact method, phone, address, area; (3) Billing defaults: collector, billing/due day; (4) Review: concise summary and clear **Create subscriber**. Optional notes are behind disclosure. Each step has its own heading and ≤5 related inputs. Back preserves answers; Next validates only the active step. Duplicate number/contact warnings show at the relevant step. If staff leave, a warning explains what is unsaved. Server-backed draft resume is a later decision only if interviews show repeated interruptions; initial wizard can hold an unposted draft in renderer state.

**Add service wizard:** from the subscriber profile: (1) Choose active plan with price/type cards, (2) Installation and assignment, (3) Billing start/day with a preview of first eligible period, (4) Review and create. Do not ask for fields irrelevant to the selected plan. Show historical-rate behavior in plain language. Final creation is one atomic server request; do not create half a service.

**Plan catalog:** searchable plan cards grouped by Internet/Cable/Combo. Each has customer-facing name, speed/channels, monthly price, status, and **View plan**. Only authorized users see **Add plan**. The add flow is three short steps: type, offer/price, review. Price changes open a review sheet showing future-only effect and required approval reason. Inactive plans are visually quiet and excluded from new-service selection.

### 3. Money: billing and payment desks

**Billing** opens with the current period as a large run card: state, eligible service count, draft invoice count/amount, and the next action. Other periods appear as small month cards. A **Generate billing** flow has four steps: select month, inspect eligibility/exceptions, generate drafts, review totals and finalize. Draft review groups exceptions first; normal invoices appear as compact cards with a register option. Finalization shows affected invoice count and total plus an explicit irreversible posting explanation. Posting returns a dated receipt of the run; a double-click/retry cannot create a second posting. An invoice detail sheet shows line items, due date, allocations and corrections, with print/download actions.

**Receive payment** must be a true wizard, not a row of numbers above one form: (1) Find and confirm subscriber (identity and outstanding balance), (2) Amount and method (Cash, GCash, bank, cheque; method-specific fields only), (3) Allocation preview (oldest-first invoices, residual/credit, warnings), (4) Review and post. Show a large amount and explicit method. Posting button says **Post ₱X payment** and is disabled with a reason until preview is current. A successful post opens a receipt card with print/copy actions and a clear route back to the customer. GCash submission routes to **Verification** and never appears as posted until approved. Verification cards show proof, matching reference, amount, payer/account, and outcome controls; reject requires a reason. A correction/reversal always shows the original record and linked effect before confirmation.

**Payment history** defaults to recent receipt cards and status chips. Search finds receipt/reference/subscriber. **Register view** supports audit-scale filtering. Avoid repeated identical Maria Santos rows without a distinguishing receipt, date/time, amount, and status.

### 4. Field work: collections and receivables

**Collections** starts with three status lanes: Prepare, In field, Reconcile. A batch card shows collector, area, account count, expected, collected, remitted, and a single next action. Preparing a route is a step flow: choose area/collector, review suggested eligible accounts (removable cards), confirm assignment, issue batch. Reconcile opens a side-by-side expected/collected/remitted summary and differences before a required reason/confirmation. Closed batches become read-only evidence cards with audit drill-down.

**Receivables** is a case queue. Header provides as-of date and a concise aging chart. Priority tabs are **Act today**, **Due soon**, **All**. Each account case card shows customer/service, arrears, oldest due date, reason for priority, last payment, assigned collector, and one permitted next action. Clicking opens a case sheet with ledger, contact history if stored, service state, policy basis, and actions such as review suspension or reconnection. Do not invent a “contacted” history until backend stores it. A service-state change uses a focused review sequence with effective date, fee, reason, preview, and confirm. Policy settings move to System/owner control, away from the operational queue.

### 5. Insights: answers, then detail

Replace the giant report filter form with report question cards: **What was billed and collected?**, **What is overdue?**, **What did collectors remit?**, **Which records were corrected?** Selecting a question opens compact filters, useful defaults, and a live preview. Advanced grouping and dimensions are in a disclosure. Preview includes definition, date basis, total, chart if comparative, and a register. Export/print controls appear only after a real preview succeeds and use the same server result and filters. Auditor view adds immutable record links, actor/time/reason, and before/after references where available; no mutation controls.

### 6. System: calm operational controls

Backup/recovery opens with clear health cards, last verified backup, retention, and **Create backup**. Backup history is a dated card timeline by default; register view remains for administrators. Restore is a dedicated guarded flow: choose backup, verify contents/status, understand impact and required safety backup, enter explicit confirmation, then monitor progress/result. Do not treat restore as an ordinary tiny row action. User administration needs a separate product and security specification because the current desktop has no complete workflow/API; do not place a placeholder in navigation.

## Common interaction contract

Every wizard: active step and total steps, labeled Back/Continue, per-step validation, review page, cancellation/unsaved warning, server error anchored to the step, keyboard access, one post request, and post success destination. Where a process is only two fields/steps, use one focused sheet instead of a ceremonial wizard. Server-side previews must return a revision/fingerprint or expire so posting cannot silently use a stale calculation; alternatively, post must recalculate inside the transaction and show a conflict requiring re-review.

Every screen: loading skeleton, meaningful empty state, recoverable network error, permission denial, stale/conflict handling, success with record link, and retained context after closing a sheet. A modal is reserved for brief confirmations; detailed work uses a sheet or full page. Never put a scrolling table inside a small modal. Make pointer clicks and keyboard paths work in real Electron, not only component tests.

## Backend and data implications

Before UI coding, inventory current API support for search, draft generation, allocation preview, verification, case filters, report dimensions, and backup. Add only contracts needed by a vertical slice. Proposed contract categories: bounded cross-record search; role work summaries; subscriber/service create and preview; billing eligibility/run preview; payment allocation preview plus idempotent post; collection batch preview/reconcile; receivable case summary/detail; report catalogue with server-backed preview. Each has Zod request/response contracts, permission check, pagination/cursor where needed, stale revision behavior, and API tests. Avoid client-side joins across many requests. A true saved draft requires persisted schema, authorization, cleanup, and conflict policy, so defer until observed need.

## Acceptance and rollout criteria

Measure with realistic synthetic datasets and actual staff tasks: time to find account, time/errors to post payment, time to locate a receivable case, successful billing review, auditor trace of a correction, and ability to complete with keyboard. Use at least owner, cashier, supervisor, and auditor walkthroughs before freezing copy/navigation. Compare to current baseline; do not claim improvement from aesthetics alone. Test Electron at 1440×900 and 960×640, 125%/150% zoom, reduced motion, keyboard, and pointer. A slice ships with a feature flag or route switch, a rollback path, reconciled totals, and no broken existing task. Move one role journey at a time; remove old screens only after the replacement passes and documentation is updated.

## External design references

- [GOV.UK question pages](https://design-system.service.gov.uk/patterns/question-pages/) and [check answers](https://design-system.service.gov.uk/patterns/check-answers/) inform focused steps and final review.
- [Carbon progress indicator](https://www.carbondesignsystem.com/building-blocks/core/components/progress-indicator/guidelines) informs visible, validated multi-step progress.
- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) and [focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) inform click and keyboard affordance. The specific colors, cards, and flows above are BCIS design proposals, not copied templates.
