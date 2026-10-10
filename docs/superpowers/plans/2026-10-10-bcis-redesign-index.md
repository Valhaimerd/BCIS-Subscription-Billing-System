# BCIS System UI Redesign — Implementation Plan Index

> **New direction, 2026-10-10:** The owner has requested a workflow-first overhaul that replaces the table-led screen model, including necessary API changes. Read the [new experience specification](../specs/2026-10-10-bcis-workflow-first-experience.md) and [phased overhaul plan](2026-10-10-bcis-workflow-first-overhaul.md) before any further UI implementation. The plans below record the earlier approved and completed pass; they are not the blueprint for the next overhaul.

The approved design is [the BCIS system UI redesign proposal](../specs/2026-10-10-bcis-system-ui-redesign-design.md). Implement one usable slice at a time; keep the application working between slices.

## Sequence

| Order | Plan                                                                          | Deliverable                                                                                              |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1     | [Shell and navigation](2026-10-10-bcis-shell-navigation.md)                   | Work-first permission-aware shell, accurate page context, corrected frontend architecture documentation  |
| 2     | [Role-aware Home and analytics](2026-10-10-bcis-role-aware-home-analytics.md) | Real working-period controls, accessible monthly billing/collection chart, permission-aware home content |
| 3     | [Subscriber workspace](2026-10-10-bcis-subscriber-workspace.md)               | Useful global subscriber search, profile drill-down, chronological account activity                      |
| 4     | [Billing and payment workflows](2026-10-10-bcis-billing-payment-workflows.md) | Clearer draft/finalize, payment/GCash, receipt and correction flows                                      |
| 5     | [Collections and receivables](2026-10-10-bcis-collections-receivables.md)     | Batch lifecycle, remittance exception, receivable follow-up, service-control flow                        |
| 6     | [Reports and audit experience](2026-10-10-bcis-reports-audit.md)              | Findable report catalogue, legible previews/exports, read-only audit review                              |

Each plan can be reviewed separately. Plans 2–6 depend on the navigation and shared page shell from plan 1; plan 3 also adds the cross-record profile surface used for drill-downs in later plans. Execute in order to avoid concurrent edits to `App.tsx` and `styles.css`.

## Additional scope found during code review

The existing **Administration** item renders a placeholder. The API has a `user.manage` permission but no user-management routes or UI, and the manuals do not define account creation, role assignment, disablement, or credential-reset workflows. A safe owner-access-management feature needs its own requirements/spec and permission review before implementation planning. It is not silently included in these redesign slices.

The current workspace has no `.git` directory, so these plans omit commit commands. Create reviewable checkpoints as soon as this work is in a Git checkout.

## Follow-up visual and interaction pass

The six workflow slices above were implemented, but the owner requested a deeper visual pass after reviewing the running UI. Use [the interaction and visual redesign proposal](../specs/2026-10-10-bcis-interaction-and-visual-redesign-design.md) and [its part-by-part implementation plan](2026-10-10-bcis-visual-redesign-plan.md) for that next effort. The new plan starts by reproducing the reported mouse/dialog issue, then redesigns the shared collapsible sidebar and shell, followed by Receivables as the first deep workflow.
