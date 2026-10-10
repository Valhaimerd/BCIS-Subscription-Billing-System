# Task 8 Evidence

Task 8 implements the handout dashboard and named operational reports from the existing Task 4-7 financial records. It does not add reporting tables, backup behavior, installer work, cloud analytics, or forecasts.

## Implemented

- The dashboard derives current and overdue receivables, overdue subscribers, billing versus collection, payment-method totals, collector performance, alerts, and recent payments from authoritative transactions.
- Ten server-generated report kinds cover collections by period, billing versus collection, revenue by plan/service/area, AR aging, subscriber master, subscriber SOA, collector performance, corrections, user activity, and the audit trail.
- One validated filter/result contract feeds the paginated desktop preview, navigation-free print view, full PDF export, and full XLSX export.
- Server-side permissions separate report viewing from exporting and additionally protect user-activity/audit outputs. Explicit column definitions prevent sensitive internal fields from entering previews or files.
- The Electron main process owns native save dialogs and file writes; the isolated renderer receives only the narrow typed report bridge.

## Verified results

- `npm run verify:task8` reconciles dashboard AR with Task 7 receivables and collection totals with posted payments, checks an empty range, proves exports are not preview-paginated, structurally inspects PDFs, opens workbooks with ExcelJS, and regenerates eight retained files.
- Unit and route tests cover UTC daily/weekly/monthly/annual boundaries, pagination, safe filenames, validation, route publication, and export authorization.
- The Electron journey verifies the dashboard, report preview, navigation-free print layout, and a compact 960px AR view without renderer errors.
- Monthly collection, AR aging, subscriber SOA, and collector performance PDFs were visually inspected after regeneration; their corresponding workbooks open successfully.
- The final quality gate passes formatting, lint, type checking, 91 automated tests, production builds, migration application, and the live Task 8 verifier. `npm audit --omit=dev` reports two moderate findings in ExcelJS's pinned `uuid@8.3.2`; npm offers only a forced breaking ExcelJS downgrade, so no unsafe automatic rewrite was applied. Task 8 uses only ExcelJS's UUID v4 path and never passes caller-provided buffers to it.

## Retained samples

- [Monthly collection PDF](../reports-samples/monthly-collection.pdf) and [XLSX](../reports-samples/monthly-collection.xlsx)
- [AR aging PDF](../reports-samples/ar-aging.pdf) and [XLSX](../reports-samples/ar-aging.xlsx)
- [Subscriber SOA PDF](../reports-samples/subscriber-soa.pdf) and [XLSX](../reports-samples/subscriber-soa.xlsx)
- [Collector performance PDF](../reports-samples/collector-performance.pdf) and [XLSX](../reports-samples/collector-performance.xlsx)

## Visual evidence

- [Dashboard](../output/playwright/bcis-task-08-dashboard.png)
- [Report preview](../output/playwright/bcis-task-08-report-preview.png)
- [Navigation-free print view](../output/playwright/bcis-task-08-report-print.png)
- [Compact AR report](../output/playwright/bcis-task-08-compact.png)
