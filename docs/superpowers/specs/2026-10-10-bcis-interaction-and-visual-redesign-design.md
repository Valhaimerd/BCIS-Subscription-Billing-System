# BCIS Interaction and Visual Redesign — Design Proposal

**Status:** Proposed for owner review. This document plans the next visual redesign; it does not authorize implementation.

## Intent

Make BCIS feel like a deliberate, modern desktop operations tool while keeping its accounting and subscriber workflows easy to scan. Improve the shared shell first, fix dialog actions that users cannot reliably activate, then redesign one operational workflow at a time. Receivables follow-up is the first deep workflow after the shared shell because the owner selected it.

## Evidence from the current client

- The supplied screenshots show a fixed, full-width dark-blue sidebar with text-only navigation, large gaps between groups, no collapse control, and a bright focus outline that can read as the active state after a mouse click.
- Content uses repeated white cards with thin blue-grey borders and similar visual weight. Receivables places six summary measures in a grid, including an awkward partially empty second row; policy controls appear as another full-size card before the account list.
- The supplied Plans screenshot shows **Change price**, whose handler calls `window.prompt`. Invoice adjustment/void, payment reversal, GCash rejection, and collection reconciliation/close also use `window.prompt` or `window.confirm`. These are browser JavaScript dialogs, not app-owned dialogs.
- `ModalDialog.tsx` calls `showModal()` after mount. `ModalDialog.test.tsx` mounts the dialog directly and dispatches events on the dialog; it does not test a trigger button.
- `tests/seeded-state-electron.mjs` does click real invoice, receipt, collection, and receivable rows, then waits for app-owned dialogs. It covers those detail-dialog paths, but not the browser-native prompts called by **Change price** or financial correction actions.
- The evidence points to a mixed implementation: existing detail dialogs have Electron smoke coverage, while the screenshot's price action relies on a browser prompt with no click-to-result test. This is the first likely failure path to reproduce. Slice 0 must still verify the user's exact click in Electron before declaring root cause.

## Outcomes

1. Every visible action responds to mouse, keyboard, and assistive input; consequential actions use app-owned dialogs with clear labels and safe cancellation.
2. Users can collapse navigation to an icon rail, identify their current location, and open a module with one predictable click.
3. Page hierarchy consistently distinguishes context, primary task, supporting data, exceptions, and secondary actions.
4. Receivables presents a clear follow-up queue, reproducible as-of balances, account detail, and permitted service controls.
5. Later screen slices apply the same foundations to subscribers, billing and payments, collections, reports, plans/services, and recovery.
6. Motion improves cause-and-effect and orientation without delaying financial work or hiding status.

## Non-goals

- No change to business rules, role permissions, posting order, money representation, audit history, API contracts, or Electron security boundaries.
- No new charting, animation, component-library, or icon dependency. Reuse installed React, Lucide, CSS, HTML dialog, and test tooling.
- No broad color-theme picker, dark mode, custom dashboard builder, speculative forecast, or navigation redesign based on unverified roles.
- No redesign in one giant change. Each slice must leave the app usable and independently verifiable.

## Visual direction

The current navy and blue already identify BCIS. Keep that identity, but reduce large blocks of saturated color. Use a cool light canvas, crisp white working surfaces, deep ink text, restrained royal-blue action color, teal for positive state, amber for attention, and red only for destructive/error state. Prefer borders and spacing to shadows on ordinary cards; reserve soft elevation for menus, popovers, and modal surfaces. Avoid decorative gradients and ornamental dashboard charts that do not explain a decision.

### Starter token proposal

These are implementation starting points; tune contrast against actual displays during Slice 1.

| Token      | Proposed value | Use                                             |
| ---------- | -------------- | ----------------------------------------------- |
| Canvas     | `#F3F6FA`      | Main window background                          |
| Surface    | `#FFFFFF`      | Tables, forms, dialogs                          |
| Ink        | `#14263F`      | Primary text                                    |
| Muted      | `#64748B`      | Help text and metadata                          |
| Brand      | `#2864D9`      | Primary actions and active navigation           |
| Brand soft | `#EAF1FF`      | Active item and selected filters                |
| Success    | `#13795B`      | Posted/complete states                          |
| Attention  | `#A85F0A`      | Due/overdue warnings                            |
| Danger     | `#B42332`      | Reject, reverse, void, destructive confirmation |
| Line       | `#DCE4EF`      | Quiet separators and control borders            |

Use the installed Segoe UI Variable/Segoe UI system stack. Establish a consistent 12/14/16/20/28/36 px type scale, 4 px spacing base, 10 px control radius, 14 px card radius, and 18 px dialog radius. Use no shadow on every card: ordinary cards get a clear surface and quiet border; interactive overlays get a soft two-layer shadow. Primary controls keep a minimum 40 px height and unmistakable text labels.

### Motion and surface rules

- Sidebar collapse/expand: 180–220 ms ease-out; content width shifts with it, without a horizontal page jump.
- Hover/active feedback: 120–160 ms; small color/background transition only. No scale bounce on data rows or money actions.
- Dialog: 150–190 ms opacity and 6–10 px vertical settle; backdrop fades and blurs lightly. Close reverses the entrance. Do not animate layout-critical content.
- Charts: reveal once when first shown; do not continuously loop. Keep a table/data equivalent.
- Loading: small inline progress or skeleton matching final layout. Never make a spinner the only indication that a click registered.
- All transitions honor `prefers-reduced-motion: reduce`. No information depends on animation, hover, or color alone.

## Shared shell and sidebar behavior

### Expanded layout

- Fixed 256 px sidebar with BCIS mark/name at top, grouped navigation in the middle, and secure-session/lock plus collapse controls at the bottom.
- Use a Lucide icon for every top-level destination. Pair icon and plain-text label in expanded mode.
- Groups have sentence-case labels and optional disclosure controls only if the group is genuinely collapsible. The active group automatically stays open.
- Active destination uses a muted brand background, narrow brand edge, brighter icon/text, and `aria-current="page"`. This is distinct from `:focus-visible`; mouse focus must not appear as a thick keyboard ring.
- Keyboard focus retains a high-contrast outline. Tooltips on collapsed icons include the full destination and permission-safe context.

### Collapsed layout

- 72 px icon rail; retain brand mark, grouped icons, active marker, and bottom session controls.
- A labeled collapse/expand button toggles state. Persist preference locally in renderer-only UI state; do not store credentials or alter security architecture.
- Tooltip appears on keyboard focus and pointer hover after a short delay. Tooltip does not cover the clickable icon or intercept its pointer events.
- On narrow widths, the sidebar becomes a modal drawer with scrim and Escape/close support; selecting a destination closes it. Desktop collapse is not reused as a mobile drawer state.

### Workspace frame

- 64–68 px top bar with sidebar toggle, concise page title/breadcrumb, subscriber search, and user/session menu. Remove duplicate page headings from the bar and body.
- Content uses one consistent left alignment, a readable maximum width for forms, and wider tables only when the data requires it. Page title and one-sentence task description precede alerts and working content.
- Alerts sit near the task they affect, include text and status, and do not push the page title into a second competing heading.

## Screen design by workflow

### Receivables — first deep workflow

1. Page introduction names the task: review balances and choose the next follow-up action.
2. Compact as-of control sits beside an explicit date badge and a single refresh action.
3. Summary shows four decision-level figures first: overdue amount, follow-up accounts, suspension candidates, and total AR. Current balance and aging buckets become a compact second layer, not a half-empty six-cell matrix.
4. A named aging distribution strip uses selectable labeled segments, values, and a visible selected state. Do not use a color-only chart.
5. Account follow-up table is the main surface. Default sort puts eligible overdue accounts first, then oldest unpaid and largest arrears; show the sort description. Preserve server filtering and pagination. Every balance and age has a text label.
6. Row selection opens a service/account detail dialog with subscriber identity, service state, oldest invoice, arrears, last payment, collection assignment, and service-control history.
7. Suspension/reconnection actions are shown only when role and current row state allow them. Each action opens a dialog with the required date, reason, fee/impact, notes, and a plain summary before final confirmation. Backend conflicts remain visible with actionable copy.
8. Delinquency policy becomes a secondary, permission-gated settings section. Saving is explicit and has success/error feedback; it does not dominate account follow-up.

### Subscriber account journey

- Global quick search opens a keyboard-operable list with account number, name, service status, and area; Enter opens a profile, Escape closes results.
- Profile header keeps identity, service status, arrears/credit summary, and primary actions in one stable place.
- Activity timeline is the chronological index. Services, invoices, ledger, contacts, addresses, and service history remain distinct tabs with permissions applied.
- Deep links from Home, receivables, payments, billing, and collections retain the selected subscriber context.

### Billing and cashier payments

- Billing screen starts with period selection and draft creation; draft review shows eligible invoice count and total before finalization.
- Finalization uses a click-tested confirmation dialog with the exact period, count, and amount. Adjustment and void dialogs explain that history is retained and require a reason.
- Payment entry is a short sequence: select subscriber, enter amount/method, review oldest-first allocation/credit, then post or submit for GCash verification.
- Cash and other direct methods create a receipt only after successful posting. GCash proof stays pending until approved; rejected/pending/posted/reversed states have distinct labels and next actions.
- Receipt detail uses an app dialog; reversal requires a separate reasoned confirmation and leaves original history visible.

### Collections

- Batch list highlights route date, collector/area, assigned accounts, expected amount, lifecycle status, and any signed remittance difference.
- Batch detail makes the current step and legal next action visible; accounts and collection entry are primary, remittance/reconciliation appear only at valid lifecycle stages.
- Shortage/overage is signed, labeled, and shown before reconciliation confirmation. Never force it to zero or hide it in a toast.
- Route print sheet remains available and gains a print-focused layout without app chrome.

### Home and reports

- Home is role-aware and starts with a short “needs attention” queue with direct destinations. Place period totals beside a clearly labeled accessible trend, with a data table equivalent.
- Do not show empty warning cards or management totals to roles lacking the corresponding permission.
- Reports chooser groups existing report kinds by revenue/collections, subscriber accounts, and controls/audit. Audit group is visible only with audit permission.
- Report preview names the date range/as-of and current page. Exports clearly include the full authorized filtered result. Empty/error/cancel states preserve filter choices and make next action clear.

### Plans, services, and system recovery

- Plans use one compact create flow and a searchable table with status and price history actions. Price changes use reasoned app dialogs, never browser prompts.
- Services and recovery keep operational state, last success/failure, and permitted actions explicit. Risky recovery actions use a distinct danger treatment and typed confirmation where existing rules require it.
- No missing administration APIs are implied by visual work. User/role administration remains a separate requirements and API project.

## Dialog reliability contract

- Replace every `window.prompt` and `window.confirm` in financial/service actions with an app-owned, accessible dialog using the existing dialog foundation or the smallest needed improvement to it.
- The initiating visible button must open the dialog on a real pointer click. Dialog must also open with Enter/Space, trap focus, focus an appropriate field, close with Escape when safe, restore focus to its trigger, and not close when users click inside content.
- Destructive or posting actions require an explicit final action. Cancellation must not mutate data. Preserve Zod/API validation and server authorization.
- Test source action click → dialog visible → form input → confirm/cancel outcome. A unit test that mounts the dialog directly is insufficient.
- Exercise at least one actual packaged/development Electron mouse flow and a Playwright interaction test for every shared trigger pattern. Capture screenshots/DOM state on failure.

## Accessibility and interaction acceptance

- All controls have labels; icon-only controls have accessible names.
- Keyboard sequence is visible and stable. Mouse activation does not leave misleading keyboard-only focus styling.
- Dialog and drawer announce role/name, keep focus inside, restore focus, and support safe close behavior.
- Charts have text/table equivalents. Status is never conveyed by hue alone.
- Minimum usable desktop width remains 960 px; responsive behavior supports narrow windows without hidden controls.
- Reduced-motion mode removes non-essential transitions.
- Loading, empty, error, success, disabled, and permission-hidden states are deliberately designed and tested for each slice.

## Security and data constraints

- Renderer remains isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Existing typed preload bridge and Fastify API remain the only data path; API authorization remains authoritative.
- Money stays integer centavos until display. Posted history changes only through linked reversal/adjustment flows.
- Use synthetic data in tests and screenshots. Do not place real subscriber/payment details in UI artifacts.

## Decisions left to the implementer

- Exact spacing, icon choice, shadow blur, and animation curve may be tuned within these tokens after viewing the actual desktop app.
- Prefer HTML/CSS and installed dependencies. Add no dependency unless a verified interaction/accessibility gap cannot be covered by current tools.
- Preserve current report kinds and permissions. New metrics, navigation destinations, and business actions need an evidenced API and a separate approved plan.
