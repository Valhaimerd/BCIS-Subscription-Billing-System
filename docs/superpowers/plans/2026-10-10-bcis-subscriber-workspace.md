# BCIS Subscriber Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscriber search and profiles the fast, coherent route through account, service, invoice, payment, collection, and lifecycle history.

**Architecture:** Reuse `MasterDataService.profile`, the existing invoice/payment filters by `subscriberId`, receivable/service history, and the server’s source records. Add one paginated, read-only subscriber activity endpoint to avoid renderer-side fan-out and never create a second mutable history store. Reuse the existing typed desktop bridge pattern.

**Tech Stack:** Fastify 5, Drizzle, shared Zod contracts, React 19, Electron preload bridge, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-bcis-system-ui-redesign-design.md`

## Global Constraints

- Keep the Electron renderer isolated from Node.js, PostgreSQL, credentials, and unrestricted IPC.
- Route all data access through the Fastify API and enforce authorization on the server.
- Validate trust boundaries with Zod and back uniqueness rules with database constraints.
- Use synthetic subscriber/payment information in tests.
- Do not duplicate source records or permit editing/deleting posted financial history.
- Existing permissions control each read and action; a profile does not imply extra access.

## Review Focus

- Subscriber has no services or financial history: show an empty account history, not errors; cover in `MasterDataViews.test.tsx`.
- Subscriber has many activity rows: pagination remains stable and does not duplicate source records; cover in `master-data-routes.test.ts`.
- Role can view subscribers but not billing: omit invoice/payment totals and financial links; cover in `MasterDataViews.test.tsx`.
- Nonexistent subscriber ID: activity route returns the existing safe not-found response; cover in `master-data-routes.test.ts`.
- Search text includes punctuation or phone digits: normalize and pass through existing query validation without SQL interpolation; cover in `master-data-routes.test.ts`.

---

### Task 1: Add a read-only subscriber activity contract

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/master-data-routes.ts`
- Modify: `apps/api/src/master-data.ts`
- Modify: `apps/api/src/master-data-routes.test.ts`
- Modify: `docs/API.md`

**Interfaces:**

- Add `subscriberActivityQuerySchema` based on `paginationSchema`; page size remains 1–100.
- Add `SubscriberActivityDto = { id: string; occurredAt: string; category: 'SUBSCRIBER' | 'SERVICE' | 'BILLING' | 'PAYMENT' | 'COLLECTION'; label: string; reference: string | null; status: string | null; amountCentavos: number | null; reason: string | null }`.
- Add `MasterDataService.activity(id: string, query: z.infer<typeof subscriberActivityQuerySchema>): Promise<Paginated<SubscriberActivityDto>>` and `GET /api/v1/subscribers/:id/activity`, protected by `subscriber.view`.
- The service projects a bounded page from existing subscriber/service events, invoices/ledger adjustments, payments/reversals, and collection-account payment records. It creates no new event table and returns no credentials, proof paths, or raw database objects.

- [ ] **Step 1: Add route tests** for authorization before service access, normalized pagination, stable not-found behavior, allowlisted DTO fields, chronological ordering, and the five category sources.
- [ ] **Step 2: Run `master-data-routes.test.ts` and confirm the activity contract cases fail.**
- [ ] **Step 3: Implement `activity` with a bounded query per source and stable `occurredAt`/`id` ordering**; normalize each source to the DTO and paginate the merged result. Do not load unbounded histories into the renderer.
- [ ] **Step 4: Document the endpoint and response fields** in `docs/API.md`.
- [ ] **Step 5: Run `npm run test --workspace @bcis/api -- src/master-data-routes.test.ts` and `npm run typecheck`; both must pass.**

### Task 2: Make subscriber search a useful shell entry point

**Files:**

- Create: `apps/desktop/src/renderer/src/SubscriberQuickSearch.tsx`
- Create: `apps/desktop/src/renderer/src/SubscriberQuickSearch.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/MasterDataViews.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**

- Produce `SubscriberQuickSearch({ canSearch, onSelect }: { canSearch: boolean; onSelect: (subscriberId: string) => void }): React.JSX.Element`; render it only when `subscriber.view` is present.
- Use `window.bcis.masterData.listSubscribers({ q, page: 1, pageSize: 8 })`; do not add a search API.
- Pass the chosen ID into `SubscribersView({ permissions, initialSubscriberId? })`; load the profile through existing `getSubscriber`.

- [ ] **Step 1: Test debounce, loading/empty/error states, ArrowUp/ArrowDown/Enter/Escape behavior, and selecting a result opens its profile.**
- [ ] **Step 2: Run the focused search test and confirm it fails.**
- [ ] **Step 3: Implement the quick-search component** with labeled input, announced result count, visible focus, and no results for empty input until a query is entered.
- [ ] **Step 4: Connect the top-bar search to the selected profile** and clear the query when a result is chosen; keep the in-page subscriber search available.
- [ ] **Step 5: Run desktop tests, lint, typecheck, and build**; verify keyboard-only operation at 960 px.

### Task 3: Present a profile summary and chronological activity

**Files:**

- Modify: `apps/desktop/src/renderer/src/MasterDataViews.tsx`
- Create: `apps/desktop/src/renderer/src/SubscriberActivity.tsx`
- Create: `apps/desktop/src/renderer/src/SubscriberActivity.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Add `window.bcis.masterData.activity(subscriberId, { page, pageSize })` to `apps/desktop/src/shared/desktop-api.ts` and the matching fixed API route in `apps/desktop/src/main/index.ts`/`preload/index.ts`.
- `SubscriberActivity({ subscriberId }: { subscriberId: string })` loads `Paginated<SubscriberActivityDto>` and links each item to an existing owning view using its source reference.
- Keep profile identity/status, contact, area/collector, and services sourced from `SubscriberProfileDto`.

- [ ] **Step 1: Add renderer tests** for mixed event ordering, optional amount/reason/reference, pagination, permission-hidden links, and service-only accounts.
- [ ] **Step 2: Run subscriber activity and App tests and confirm new assertions fail.**
- [ ] **Step 3: Add the typed bridge method**; main process makes the authenticated HTTP request and the renderer receives only the DTO.
- [ ] **Step 4: Replace the isolated profile tabs with a clear identity header, service summary, and activity list**; expose invoice, payment, collections, ledger/SOA, and service-control entry points only when the current permission and data support them.
- [ ] **Step 5: Run API and desktop focused tests, lint, typecheck, and build.** Confirm the existing subscriber registration/status and service-account flows still work.
