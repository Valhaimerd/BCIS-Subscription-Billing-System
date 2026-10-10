import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const subscriberStatus = pgEnum('subscriber_status', [
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
]);
export const serviceAccountStatus = pgEnum('service_account_status', [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DISCONNECTED',
  'TERMINATED',
]);
export const reconnectionStatus = pgEnum('reconnection_status', [
  'REQUESTED',
  'COMPLETED',
]);
export const contactType = pgEnum('contact_type', ['MOBILE', 'EMAIL', 'OTHER']);
export const billingCycleStatus = pgEnum('billing_cycle_status', [
  'DRAFT',
  'FINALIZED',
]);
export const invoiceStatus = pgEnum('invoice_status', [
  'DRAFT',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'CREDITED',
]);
export const invoiceItemType = pgEnum('invoice_item_type', [
  'SUBSCRIPTION',
  'FEE',
  'DISCOUNT',
  'PENALTY',
  'ADJUSTMENT',
]);
export const ledgerEntryType = pgEnum('ledger_entry_type', [
  'INVOICE_DEBIT',
  'INVOICE_VOID',
  'ADJUSTMENT_DEBIT',
  'ADJUSTMENT_CREDIT',
  'PAYMENT_CREDIT',
  'PAYMENT_REVERSAL_DEBIT',
]);
export const paymentMethod = pgEnum('payment_method', [
  'CASH',
  'GCASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'OTHER',
]);
export const paymentStatus = pgEnum('payment_status', [
  'PENDING_VERIFICATION',
  'POSTED',
  'REJECTED',
  'REVERSED',
]);
export const collectionBatchStatus = pgEnum('collection_batch_status', [
  'OPEN',
  'IN_PROGRESS',
  'SUBMITTED',
  'REMITTED',
  'RECONCILED',
  'CLOSED',
]);
export const backupOperation = pgEnum('backup_operation', [
  'BACKUP',
  'SAFETY_BACKUP',
  'RESTORE',
]);
export const backupStatus = pgEnum('backup_status', ['SUCCEEDED', 'FAILED']);
export const invoiceNumberSequence = pgSequence('invoice_number_sequence', {
  startWith: 1001,
});
export const receiptNumberSequence = pgSequence('receipt_number_sequence', {
  startWith: 5001,
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    email: text('email'),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password')
      .notNull()
      .default(false),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('roles_code_unique').on(table.code)],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    description: text('description').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('permissions_code_unique').on(table.code)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_index').on(table.userId),
    index('sessions_expires_at_index').on(table.expiresAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    reason: text('reason'),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_index').on(table.actorUserId),
    index('audit_logs_created_at_index').on(table.createdAt),
  ],
);

export const applicationSettings = pgTable(
  'application_settings',
  {
    id: integer('id').primaryKey().default(1),
    backupRetentionCount: integer('backup_retention_count')
      .notNull()
      .default(10),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    check('application_settings_singleton_check', sql`${table.id} = 1`),
    check(
      'application_settings_retention_check',
      sql`${table.backupRetentionCount} between 1 and 50`,
    ),
  ],
);

export const backupHistory = pgTable(
  'backup_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operation: backupOperation('operation').notNull(),
    status: backupStatus('status').notNull(),
    backupName: text('backup_name').notNull(),
    sourceBackupName: text('source_backup_name'),
    manifest: jsonb('manifest'),
    message: text('message').notNull(),
    initiatedByUserId: uuid('initiated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('backup_history_name_operation_unique').on(
      table.backupName,
      table.operation,
    ),
    index('backup_history_completed_at_index').on(table.completedAt),
  ],
);

export const serviceTypes = pgTable(
  'service_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('service_types_code_unique').on(table.code)],
);

export const servicePlans = pgTable(
  'service_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceTypeId: uuid('service_type_id')
      .notNull()
      .references(() => serviceTypes.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    priceCentavos: bigint('price_centavos', { mode: 'number' }).notNull(),
    speedMbps: integer('speed_mbps'),
    channelCount: integer('channel_count'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('service_plans_code_unique').on(table.code),
    index('service_plans_type_index').on(table.serviceTypeId),
  ],
);

export const collectionAreas = pgTable(
  'collection_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('collection_areas_code_unique').on(table.code)],
);

export const collectors = pgTable(
  'collectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    fullName: text('full_name').notNull(),
    contactNumber: text('contact_number'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('collectors_code_unique').on(table.code)],
);

export const collectorAreaAssignments = pgTable(
  'collector_area_assignments',
  {
    collectorId: uuid('collector_id')
      .notNull()
      .references(() => collectors.id, { onDelete: 'cascade' }),
    collectionAreaId: uuid('collection_area_id')
      .notNull()
      .references(() => collectionAreas.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.collectorId, table.collectionAreaId] }),
  ],
);

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountNumber: text('account_number').notNull(),
    fullName: text('full_name').notNull(),
    status: subscriberStatus('status').notNull().default('ACTIVE'),
    collectionAreaId: uuid('collection_area_id').references(
      () => collectionAreas.id,
    ),
    assignedCollectorId: uuid('assigned_collector_id').references(
      () => collectors.id,
    ),
    notes: text('notes'),
    defaultBillingDay: integer('default_billing_day').notNull().default(1),
    defaultDueDay: integer('default_due_day').notNull().default(15),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('subscribers_account_number_unique').on(table.accountNumber),
    index('subscribers_full_name_index').on(table.fullName),
    index('subscribers_status_index').on(table.status),
    check(
      'subscribers_billing_days_check',
      sql`${table.defaultBillingDay} between 1 and 28 and ${table.defaultDueDay} between 1 and 28`,
    ),
  ],
);

export const subscriberAddresses = pgTable(
  'subscriber_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    addressLine: text('address_line').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('subscriber_addresses_subscriber_index').on(table.subscriberId),
  ],
);

export const subscriberContacts = pgTable(
  'subscriber_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    type: contactType('type').notNull(),
    value: text('value').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('subscriber_contacts_subscriber_index').on(table.subscriberId),
  ],
);

export const subscriberEvents = pgTable(
  'subscriber_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    previousStatus: subscriberStatus('previous_status'),
    newStatus: subscriberStatus('new_status').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscriber_events_subscriber_index').on(table.subscriberId),
  ],
);

export const serviceAccounts = pgTable(
  'service_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountNumber: text('account_number').notNull(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => servicePlans.id),
    installationAddressId: uuid('installation_address_id').references(
      () => subscriberAddresses.id,
    ),
    assignedCollectorId: uuid('assigned_collector_id').references(
      () => collectors.id,
    ),
    currentRateCentavos: bigint('current_rate_centavos', {
      mode: 'number',
    }).notNull(),
    billingDay: integer('billing_day').notNull(),
    dueDay: integer('due_day').notNull().default(15),
    billingStartDate: date('billing_start_date', { mode: 'string' })
      .notNull()
      .default('2026-01-01'),
    activationDate: timestamp('activation_date', { withTimezone: true }),
    status: serviceAccountStatus('status').notNull().default('PENDING'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('service_accounts_account_number_unique').on(
      table.accountNumber,
    ),
    index('service_accounts_subscriber_index').on(table.subscriberId),
    index('service_accounts_status_index').on(table.status),
    check(
      'service_accounts_billing_days_check',
      sql`${table.billingDay} between 1 and 28 and ${table.dueDay} between 1 and 28`,
    ),
  ],
);

export const serviceEvents = pgTable(
  'service_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id),
    previousStatus: serviceAccountStatus('previous_status'),
    newStatus: serviceAccountStatus('new_status').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('service_events_account_index').on(table.serviceAccountId)],
);

export const delinquencySettings = pgTable(
  'delinquency_settings',
  {
    id: integer('id').primaryKey().default(1),
    gracePeriodDays: integer('grace_period_days').notNull().default(7),
    suspensionThresholdDays: integer('suspension_threshold_days')
      .notNull()
      .default(60),
    reconnectionFeeCentavos: bigint('reconnection_fee_centavos', {
      mode: 'number',
    })
      .notNull()
      .default(0),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    check('delinquency_settings_singleton_check', sql`${table.id} = 1`),
    check(
      'delinquency_settings_values_check',
      sql`${table.gracePeriodDays} >= 0 and ${table.suspensionThresholdDays} >= ${table.gracePeriodDays} and ${table.reconnectionFeeCentavos} >= 0`,
    ),
  ],
);

export const suspensionRecords = pgTable(
  'suspension_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id),
    reason: text('reason').notNull(),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    notes: text('notes'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('suspension_records_service_date_index').on(
      table.serviceAccountId,
      table.effectiveDate,
    ),
  ],
);

export const reconnectionRecords = pgTable(
  'reconnection_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id),
    suspensionRecordId: uuid('suspension_record_id').references(
      () => suspensionRecords.id,
    ),
    status: reconnectionStatus('status').notNull().default('REQUESTED'),
    reason: text('reason').notNull(),
    technician: text('technician').notNull(),
    requestDate: date('request_date', { mode: 'string' }).notNull(),
    completionDate: date('completion_date', { mode: 'string' }),
    feeCentavos: bigint('fee_centavos', { mode: 'number' })
      .notNull()
      .default(0),
    notes: text('notes'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('reconnection_records_service_date_index').on(
      table.serviceAccountId,
      table.requestDate,
    ),
    uniqueIndex('reconnection_records_open_service_unique')
      .on(table.serviceAccountId)
      .where(sql`${table.status} = 'REQUESTED'`),
    check(
      'reconnection_records_fee_nonnegative_check',
      sql`${table.feeCentavos} >= 0`,
    ),
  ],
);

export const billingCycles = pgTable(
  'billing_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    status: billingCycleStatus('status').notNull().default('DRAFT'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('billing_cycles_period_unique').on(
      table.periodYear,
      table.periodMonth,
    ),
    check(
      'billing_cycles_period_check',
      sql`${table.periodYear} between 2000 and 2200 and ${table.periodMonth} between 1 and 12`,
    ),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceNumber: text('invoice_number').notNull(),
    billingCycleId: uuid('billing_cycle_id')
      .notNull()
      .references(() => billingCycles.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id),
    serviceAccountNumber: text('service_account_number').notNull(),
    planName: text('plan_name').notNull(),
    billingPeriodLabel: text('billing_period_label').notNull(),
    invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    subtotalCentavos: bigint('subtotal_centavos', { mode: 'number' }).notNull(),
    totalCentavos: bigint('total_centavos', { mode: 'number' }).notNull(),
    status: invoiceStatus('status').notNull().default('DRAFT'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invoices_number_unique').on(table.invoiceNumber),
    uniqueIndex('invoices_service_cycle_unique').on(
      table.serviceAccountId,
      table.billingCycleId,
    ),
    index('invoices_subscriber_index').on(table.subscriberId),
    index('invoices_due_status_index').on(table.dueDate, table.status),
    check(
      'invoices_totals_check',
      sql`${table.subtotalCentavos} >= 0 and ${table.totalCentavos} >= 0`,
    ),
  ],
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    type: invoiceItemType('type').notNull(),
    description: text('description').notNull(),
    amountCentavos: bigint('amount_centavos', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('invoice_items_invoice_index').on(table.invoiceId)],
);

export const adjustments = pgTable(
  'adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amountCentavos: bigint('amount_centavos', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('adjustments_invoice_index').on(table.invoiceId),
    check('adjustments_nonzero_check', sql`${table.amountCentavos} <> 0`),
  ],
);

export const collectionBatches = pgTable(
  'collection_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectorId: uuid('collector_id')
      .notNull()
      .references(() => collectors.id),
    collectionAreaId: uuid('collection_area_id')
      .notNull()
      .references(() => collectionAreas.id),
    batchDate: date('batch_date', { mode: 'string' }).notNull(),
    status: collectionBatchStatus('status').notNull().default('OPEN'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    remittedAt: timestamp('remitted_at', { withTimezone: true }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledByUserId: uuid('reconciled_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('collection_batches_route_date_unique').on(
      table.collectorId,
      table.collectionAreaId,
      table.batchDate,
    ),
    index('collection_batches_status_date_index').on(
      table.status,
      table.batchDate,
    ),
  ],
);

export const batchAccounts = pgTable(
  'batch_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => collectionBatches.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id),
    subscriberAccountNumber: text('subscriber_account_number').notNull(),
    subscriberName: text('subscriber_name').notNull(),
    serviceAccountNumber: text('service_account_number').notNull(),
    routeAddress: text('route_address').notNull(),
    currentBillCentavos: bigint('current_bill_centavos', {
      mode: 'number',
    }).notNull(),
    arrearsCentavos: bigint('arrears_centavos', { mode: 'number' }).notNull(),
    totalDueCentavos: bigint('total_due_centavos', {
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('batch_accounts_batch_service_unique').on(
      table.batchId,
      table.serviceAccountId,
    ),
    index('batch_accounts_subscriber_index').on(table.subscriberId),
    check(
      'batch_accounts_amounts_nonnegative_check',
      sql`${table.currentBillCentavos} >= 0 and ${table.arrearsCentavos} >= 0 and ${table.totalDueCentavos} >= 0`,
    ),
    check(
      'batch_accounts_total_check',
      sql`${table.totalDueCentavos} = ${table.currentBillCentavos} + ${table.arrearsCentavos}`,
    ),
  ],
);

export const collectorRemittances = pgTable(
  'collector_remittances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => collectionBatches.id),
    amountCentavos: bigint('amount_centavos', { mode: 'number' }).notNull(),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    remittedAt: timestamp('remitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('collector_remittances_batch_unique').on(table.batchId),
    check(
      'collector_remittances_amount_nonnegative_check',
      sql`${table.amountCentavos} >= 0`,
    ),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    batchAccountId: uuid('batch_account_id').references(() => batchAccounts.id),
    amountCentavos: bigint('amount_centavos', { mode: 'number' }).notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull(),
    referenceNumber: text('reference_number'),
    senderDetails: text('sender_details'),
    notes: text('notes'),
    paymentDate: timestamp('payment_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    postedByUserId: uuid('posted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    ...timestamps,
  },
  (table) => [
    index('payments_subscriber_date_index').on(
      table.subscriberId,
      table.paymentDate,
    ),
    index('payments_status_index').on(table.status),
    index('payments_status_date_index').on(table.status, table.paymentDate),
    index('payments_reference_index').on(table.referenceNumber),
    uniqueIndex('payments_batch_account_unique')
      .on(table.batchAccountId)
      .where(
        sql`${table.batchAccountId} is not null and ${table.status} in ('PENDING_VERIFICATION', 'POSTED')`,
      ),
    uniqueIndex('payments_gcash_reference_unique')
      .on(table.referenceNumber)
      .where(
        sql`${table.method} = 'GCASH' and ${table.referenceNumber} is not null`,
      ),
    check('payments_amount_positive_check', sql`${table.amountCentavos} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amountCentavos: bigint('amount_centavos', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_allocations_payment_invoice_unique').on(
      table.paymentId,
      table.invoiceId,
    ),
    index('payment_allocations_invoice_index').on(table.invoiceId),
    check(
      'payment_allocations_amount_positive_check',
      sql`${table.amountCentavos} > 0`,
    ),
  ],
);

export const paymentProofs = pgTable(
  'payment_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storagePath: text('storage_path').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_proofs_payment_unique').on(table.paymentId),
    uniqueIndex('payment_proofs_storage_path_unique').on(table.storagePath),
    check('payment_proofs_size_positive_check', sql`${table.sizeBytes} > 0`),
  ],
);

export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    receiptNumber: text('receipt_number').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('receipts_payment_unique').on(table.paymentId),
    uniqueIndex('receipts_number_unique').on(table.receiptNumber),
  ],
);

export const paymentReversals = pgTable(
  'payment_reversals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_reversals_payment_unique').on(table.paymentId),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    adjustmentId: uuid('adjustment_id').references(() => adjustments.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    paymentReversalId: uuid('payment_reversal_id').references(
      () => paymentReversals.id,
    ),
    entryType: ledgerEntryType('entry_type').notNull(),
    reference: text('reference').notNull(),
    description: text('description').notNull(),
    debitCentavos: bigint('debit_centavos', { mode: 'number' })
      .notNull()
      .default(0),
    creditCentavos: bigint('credit_centavos', { mode: 'number' })
      .notNull()
      .default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ledger_entries_subscriber_date_index').on(
      table.subscriberId,
      table.occurredAt,
    ),
    uniqueIndex('ledger_entries_invoice_type_unique').on(
      table.invoiceId,
      table.entryType,
    ),
    uniqueIndex('ledger_entries_adjustment_unique').on(table.adjustmentId),
    uniqueIndex('ledger_entries_payment_type_unique').on(
      table.paymentId,
      table.entryType,
    ),
    uniqueIndex('ledger_entries_payment_reversal_unique').on(
      table.paymentReversalId,
    ),
    check(
      'ledger_entries_amounts_check',
      sql`${table.debitCentavos} >= 0 and ${table.creditCentavos} >= 0 and not (${table.debitCentavos} > 0 and ${table.creditCentavos} > 0)`,
    ),
  ],
);
