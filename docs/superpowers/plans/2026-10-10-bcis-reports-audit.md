# BCIS Reports and Audit Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reports easier to choose, filter, preview, reconcile, and export while keeping auditor access read-only and server-enforced.

**Architecture:** Reuse existing report kinds, query schemas, API allowlists, pagination, and export endpoints. Improve the renderer catalogue and preview; do not add a new report family or relax permission checks in this visual slice.

**Tech Stack:** React 19, TypeScript, Fastify 5, shared Zod contracts, PDFMake, ExcelJS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through Fastify and enforce authorization on the server.
- Keep reports derived from authoritative records; money remains integer centavos until display/export.
- Auditor is read-only under `seed.ts` and `AUTHORIZATION_RULES.md`; do not grant reversals or adjustments.
- Preserve report pagination, complete authorized export semantics, safe errors, and output redaction.

## Review Focus

- Auditor opens audit/user activity without `audit.view`: UI hides options and API rejects direct calls; cover in `ReportsView.test.tsx` and `report-routes.test.ts`.
- A report has no rows: preview explains the selected filters and offers a way to broaden the query; cover in `ReportsView.test.tsx`.
- A report has many rows: visible page and export scope remain distinct; cover in `ReportsView.test.tsx` and route tests.
- Date range is inverted or `asOf` differs: preserve contract validation and visible date context; cover in `report-routes.test.ts`.
- Export fails or destination is canceled: retain preview and show actionable status without implying file creation; cover in `ReportsView.test.tsx`.

---

### Task 1: Give report options useful names and permission-safe groups

**Files:**

- Modify: `apps/desktop/src/renderer/src/ReportingViews.tsx`
- Create: `apps/desktop/src/renderer/src/ReportsView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Keep `ReportsView({ canExport, canAudit }: { canExport: boolean; canAudit: boolean })` and `ReportKind` contract values.
- Group existing report kinds as Revenue & collection, Subscriber accounts, and Controls & audit; show Controls & audit only with `audit.view`.
- Keep Accounting / Auditor read-only; `report.export` permits export only, never a financial mutation.

- [ ] **Step 1: Test report catalogue visibility** for Owner, Auditor with/without `audit.view`, and Read-only Viewer; assert no mutation action appears.
- [ ] **Step 2: Run the focused test and confirm it fails.**
- [ ] **Step 3: Replace the flat selector with the grouped report chooser** and concise descriptions of the question each existing report answers.
- [ ] **Step 4: Run `ReportsView.test.tsx` and `App.test.tsx`.**

### Task 2: Improve report preview, filters, and export states

**Files:**

- Modify: `apps/desktop/src/renderer/src/ReportingViews.tsx`
- Modify: `apps/desktop/src/renderer/src/ReportsView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Preserve `ReportQuery` fields: `from`, `to`, `asOf`, `granularity`, `dimension`, `subscriberId`, `q`, `page`, and `pageSize`.
- Keep date filters visible in the preview header; retain totals, paginated rows, print, PDF, and XLSX methods.

- [ ] **Step 1: Test loading, empty, error, paginated, preview-success, export-success, and export-failure states.**
- [ ] **Step 2: Run the focused test and confirm new states fail.**
- [ ] **Step 3: Reorder controls as report choice → required date/filter fields → preview → totals/table → export actions**; distinguish preview page from complete export.
- [ ] **Step 4: Test keyboard flow, readable table at 960 px, and print stylesheet behavior.**
- [ ] **Step 5: Run desktop `ReportsView.test.tsx`, API `report-routes.test.ts`, lint, typecheck, and build.**
