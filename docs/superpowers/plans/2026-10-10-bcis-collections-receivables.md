# BCIS Collections and Receivables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make field route progress, cash remittance differences, overdue follow-up, and service-control decisions visible and easy to complete.

**Architecture:** Keep collection and receivable services/API rules authoritative. Preserve the collection batch lifecycle and `asOf` accounting semantics; improve existing desktop views and link dashboard/profile drill-downs to them.

**Tech Stack:** React 19, TypeScript, Fastify, Drizzle, PostgreSQL, CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through Fastify and enforce authorization on the server.
- Store money as integer centavos and use PostgreSQL transactions for financial posting.
- Never edit or delete posted financial history; use linked reversals or adjustments.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Keep shortage/overage amounts signed, visible, and traceable; never force reconciliation to zero.

## Review Focus

- Batch has no assigned subscribers: explain why a route is empty; cover in `CollectionsView.test.tsx`.
- Batch is in each lifecycle state: show only legal next actions; cover in `CollectionsView.test.tsx`.
- Remittance is short or over expected Cash: display the signed difference before confirmation; cover in `CollectionsView.test.tsx`.
- Receivable `asOf` date changes: refresh totals and row set together and label the date; cover in `ReceivablesView.test.tsx`.
- Service is already suspended or arrears no longer qualify: hide/disable invalid action and preserve backend conflict copy; cover in `ReceivablesView.test.tsx` and existing route tests.

---

### Task 1: Clarify collection batch progress and reconciliation

**Files:**

- Modify: `apps/desktop/src/renderer/src/CollectionsView.tsx`
- Create: `apps/desktop/src/renderer/src/CollectionsView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Keep `CollectionsView({ canReconcile }: { canReconcile: boolean })` and all `window.bcis.collections` method signatures.
- Render lifecycle `OPEN → IN_PROGRESS → SUBMITTED → REMITTED → RECONCILED → CLOSED` from `CollectionBatchDetailDto.status`.
- Reconciliation confirmation must show `differenceCentavos` exactly as returned by the API.

- [ ] **Step 1: Test each lifecycle status**, legal available actions, signed shortage/overage values, record-collection validation, and an empty route.
- [ ] **Step 2: Run `CollectionsView.test.tsx` and confirm the new assertions fail.**
- [ ] **Step 3: Reorganize list and batch detail** into route context, lifecycle/progress, accounts, collection entry, remittance, and reconciliation difference. Keep print route sheet behavior.
- [ ] **Step 4: Run desktop collection tests and existing API `collection-routes.test.ts`.**

### Task 2: Focus receivables on ordered follow-up and service history

**Files:**

- Modify: `apps/desktop/src/renderer/src/ReceivablesView.tsx`
- Create: `apps/desktop/src/renderer/src/ReceivablesView.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Keep `ReceivablesView({ canManage }: { canManage: boolean })` and current `window.bcis.receivables` methods.
- Require explicit `asOf`; show selected date beside bucket totals and list. Retain current/overdue buckets and server filtering.
- Keep suspension/reconnection forms reasoned, auditable, and limited to `receivable.manage`.

- [ ] **Step 1: Test date refresh, each aging bucket, no results, role-hidden mutation actions, and service-control history.**
- [ ] **Step 2: Run `ReceivablesView.test.tsx` and confirm the new assertions fail.**
- [ ] **Step 3: Put summary → ordered follow-up list → account/service detail in that hierarchy**; use clear overdue age and next permitted action, never a color-only warning.
- [ ] **Step 4: Run desktop tests and API `receivable-routes.test.ts` plus `npm run verify:task7 --workspace @bcis/api`.**
- [ ] **Step 5: Run lint, typecheck, and build**; verify the minimum 960 px layout.
