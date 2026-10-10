# BCIS Billing and Payment Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make monthly billing, payment collection, GCash verification, receipts, and corrections easier to understand while preserving every financial rule.

**Architecture:** Keep billing/payment services and API contracts as the authority. Improve the existing React feature views using existing desktop bridge calls; do not change allocation, posting, duplicate protection, or correction semantics.

**Tech Stack:** React 19, TypeScript, React Hook Form/Zod where already used, Fastify, PostgreSQL, CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through Fastify and enforce authorization on the server.
- Store money as integer centavos and use PostgreSQL transactions for financial posting.
- Never edit or delete posted financial history; use linked reversals or adjustments.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Use synthetic customer and payment information in tests.
- Add no dependency for layout, charting, or animation.

## Review Focus

- Draft billing cycle has zero eligible services: show an explicit empty state and do not finalize; cover in `BillingViews.test.tsx`.
- Finalization fails after preview: retain draft context and show safe retry guidance; cover in `BillingViews.test.tsx`.
- Payment amount is invalid or exceeds safe centavo range: block posting before API call; cover in `PaymentViews.test.tsx`.
- GCash remains pending or is rejected: do not show a receipt or cleared balance; cover in `PaymentViews.test.tsx` and existing payment route tests.
- Reversed payment: retain the original and reason and show linked correction; cover in `PaymentViews.test.tsx` and `payment-routes.test.ts`.

---

### Task 1: Give billing a clear period review and finalize path

**Files:**

- Modify: `apps/desktop/src/renderer/src/BillingViews.tsx`
- Create: `apps/desktop/src/renderer/src/BillingViews.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Keep `BillingView({ canGenerate }: { canGenerate: boolean })` and existing `window.bcis.billing` signatures.
- Present period selection → draft generation → draft review → explicit finalization as one visible sequence; finalized cycles are read-only except existing adjustment/void actions with reasons.

- [ ] **Step 1: Add tests** for the four billing states, no-service empty state, disabled unauthorized actions, and retaining the draft when finalization errors.
- [ ] **Step 2: Run `BillingViews.test.tsx` and confirm the new assertions fail.**
- [ ] **Step 3: Reorganize the existing billing controls** into a period action header, draft review, cycle history, and invoice list; keep required confirmation and reason inputs.
- [ ] **Step 4: Run desktop tests and inspect at 960 px**; no hidden financial status, clipped action, or unlabelled control.

### Task 2: Simplify cashier payment and GCash states

**Files:**

- Modify: `apps/desktop/src/renderer/src/PaymentViews.tsx`
- Create: `apps/desktop/src/renderer/src/PaymentViews.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Keep the current `PaymentsView` permission props and `window.bcis.payments` bridge methods.
- Keep payment preview before posting; show pending verification, rejected, posted, and reversed states as distinct states with explicit next steps.
- Preserve oldest-first allocation, unapplied credit display, GCash proof requirements, unique reference protection, and receipt printing.

- [ ] **Step 1: Add UI tests** for method-specific fields, previewed allocations, pending GCash without receipt, rejected proof, posted receipt, and reversible action hidden without `payment.reverse`.
- [ ] **Step 2: Run the focused test and confirm it fails before the redesign.**
- [ ] **Step 3: Reorder the payment workflow** around subscriber selection, amount/method, allocation preview, final confirmation, and receipt result; keep secondary payment history searchable.
- [ ] **Step 4: Make correction history explicit** with original receipt, reversal status, reason, and actor when present; no destructive-looking “delete” affordance.
- [ ] **Step 5: Run desktop tests plus API `payment-routes.test.ts`, lint, typecheck, and build.** Confirm all money stays integer centavos through the bridge.
