# BCIS Entity-Relationship Overview

The executable source of truth is `packages/database/src/schema.ts` plus the ordered SQL migrations. `DATA_MODEL.md` is the field-level data dictionary.

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : assigned
  ROLES ||--o{ USER_ROLES : contains
  ROLES ||--o{ ROLE_PERMISSIONS : grants
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : defines
  USERS ||--o{ SESSIONS : owns
  USERS ||--o{ AUDIT_LOGS : acts

  COLLECTION_AREAS ||--o{ SUBSCRIBERS : groups
  COLLECTORS ||--o{ SUBSCRIBERS : assigned
  SUBSCRIBERS ||--o{ SUBSCRIBER_ADDRESSES : has
  SUBSCRIBERS ||--o{ SUBSCRIBER_CONTACTS : has
  SUBSCRIBERS ||--o{ SERVICE_ACCOUNTS : owns
  SERVICE_TYPES ||--o{ SERVICE_PLANS : categorizes
  SERVICE_PLANS ||--o{ SERVICE_ACCOUNTS : selected

  BILLING_CYCLES ||--o{ INVOICES : contains
  SERVICE_ACCOUNTS ||--o{ INVOICES : billed
  INVOICES ||--o{ INVOICE_ITEMS : snapshots
  INVOICES ||--o{ ADJUSTMENTS : corrected
  SUBSCRIBERS ||--o{ PAYMENTS : makes
  PAYMENTS ||--o{ PAYMENT_ALLOCATIONS : allocates
  INVOICES ||--o{ PAYMENT_ALLOCATIONS : receives
  PAYMENTS ||--|| RECEIPTS : issues
  PAYMENTS ||--o| PAYMENT_REVERSALS : reversed_by
  SUBSCRIBERS ||--o{ LEDGER_ENTRIES : records

  COLLECTORS ||--o{ COLLECTION_BATCHES : works
  COLLECTION_AREAS ||--o{ COLLECTION_BATCHES : routes
  COLLECTION_BATCHES ||--o{ BATCH_ACCOUNTS : freezes
  COLLECTION_BATCHES ||--o| COLLECTOR_REMITTANCES : remits
  BATCH_ACCOUNTS ||--o| PAYMENTS : attributes

  SERVICE_ACCOUNTS ||--o{ SUSPENSION_RECORDS : suspends
  SUSPENSION_RECORDS ||--o{ RECONNECTION_RECORDS : resolves
  USERS ||--o{ BACKUP_HISTORY : initiates
```

All money columns use integer centavos. Current balances, subscriber credit, receivables, aging, collection differences, and reports are derived from immutable source rows rather than maintained in editable summary tables.
