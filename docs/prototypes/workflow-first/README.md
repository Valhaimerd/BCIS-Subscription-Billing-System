# Workflow-first clickable prototype

Open `index.html` in a browser, or serve this folder locally with `python -m http.server 4181 --directory docs/prototypes/workflow-first` and visit `http://127.0.0.1:4181/`. The prototype is a separate static artifact; it does not import the desktop app, call the API, persist answers, or post money. All names, phone numbers, and figures are synthetic examples.

## What to compare

Switch between **A · Workbench**, **B · Focus**, and **C · Rail** in the top strip. A uses a dark, expanded navigation anchor; B uses a light sidebar and one dominant priority; C begins as a compact icon rail. The sidebar toggle stays **inside the sidebar** in every concept. Choose a role in the top bar to inspect the proposed navigation and Today priorities.

**Current recommendation for staff review:** Start with A. Its visible labels reduce memory work for occasional users, while the dark rail clearly separates navigation from the task canvas. Compare B's stronger single-priority layout as an alternative. C offers the most canvas space but depends on tooltips and icon recognition; test it with new staff before making it the default.

Try this journey in each concept: **Today → Find a subscriber → choose Maria Santos → enter ₱1,500 Cash → review allocation → review payment → sample result**. Search, customer cards, account detail, all work destinations, concept switching, sidebar control, and the payment wizard are clickable. The result is labeled `PROTOTYPE-ONLY` and creates no receipt.

## Staff review script

Use the same synthetic records for each participant. Do not coach during the first attempt. Record the route taken, time, mis-clicks, hesitations, backtracks, and any point where a table is genuinely needed. Ask which concept makes the next action easiest to find and why.

| Role                  | Task 1                                                | Task 2                                                |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Cashier               | Find Maria Santos and review a ₱1,500 Cash allocation | Find a prior payment from Money                       |
| Owner                 | Find what needs follow-up today                       | Find the October billed/collected question            |
| Collection supervisor | Identify the most urgent case                         | Find where a batch would be reconciled                |
| Auditor               | Locate overdue source accounts                        | Find corrected-record evidence without a write action |
| Technician            | Find Imelda Corpuz's service                          | Identify where service history would open             |

**Decision record to fill after observation:** preferred shell (A/B/C), first action by role, whether technician service entry belongs under Customers or Field work, any unclear button or status, any missing register use, and needed copy changes. The current choices are proposals, not approved usability findings.

Browser review of this static prototype covered 1440×900, 960×640, 720×900, and 390×844. Each viewport had no horizontal document overflow. The payment wizard was clicked from customer choice through the clearly marked sample result. These checks do not replace staff observation or verification of the future Electron implementation.

## Copy glossary proposed for the next slice

- **Subscriber**: the customer identity and account number.
- **Service**: an installed subscription tied to a plan, rate, and address.
- **Draft**: a reviewable invoice or billing run that has not posted to the ledger.
- **Finalized / posted**: committed financial history; use linked corrections rather than editing it.
- **Payment**: money received; a GCash submission awaiting verification is **pending verification**, not posted.
- **Allocation**: how a payment is applied to eligible invoices and any remaining credit.
- **Arrears / overdue**: unpaid amount after its due date, shown with an as-of date.
- **Batch / remittance**: assigned field collection work and the money the collector turns in.

## Boundaries

Only the payment journey is detailed end to end. Other cards open concept sheets that state what their future production flow needs. Data and role switching simulate presentation only and are **not** server authorization. Production work follows the [experience specification](../../superpowers/specs/2026-10-10-bcis-workflow-first-experience.md) and [implementation plan](../../superpowers/plans/2026-10-10-bcis-workflow-first-overhaul.md), including safe API previews and financial controls.
