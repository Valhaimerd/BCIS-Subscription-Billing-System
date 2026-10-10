import { z } from 'zod';

export const serviceStatusSchema = z.enum(['ok', 'degraded']);

export const healthDataSchema = z.object({
  service: z.literal('bcis-api'),
  status: serviceStatusSchema,
  timestamp: z.iso.datetime(),
});

export const healthSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: healthDataSchema,
});

export const healthFailureSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  data: healthDataSchema,
});

export type HealthSuccess = z.infer<typeof healthSuccessSchema>;
export type HealthFailure = z.infer<typeof healthFailureSchema>;

export const roleCodes = [
  'OWNER',
  'ADMINISTRATOR',
  'CASHIER',
  'COLLECTION_SUPERVISOR',
  'ACCOUNTING_AUDITOR',
  'TECHNICIAN',
  'READ_ONLY_VIEWER',
] as const;

export const permissionCodes = [
  'subscriber.view',
  'subscriber.manage',
  'billing.view',
  'billing.generate',
  'payment.view',
  'payment.create',
  'payment.reverse',
  'payment.verify_gcash',
  'collection.view',
  'collection.reconcile',
  'receivable.view',
  'receivable.manage',
  'service.view',
  'service.manage',
  'report.view',
  'report.export',
  'user.manage',
  'audit.view',
  'backup.create',
  'backup.restore',
  'settings.manage',
] as const;

export type RoleCode = (typeof roleCodes)[number];
export type PermissionCode = (typeof permissionCodes)[number];

export const safeUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(z.enum(roleCodes)),
  permissions: z.array(z.enum(permissionCodes)),
  mustChangePassword: z.boolean(),
});

export const loginResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresAt: z.iso.datetime(),
    user: safeUserSchema,
  }),
});

export const sessionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    expiresAt: z.iso.datetime(),
    locked: z.boolean(),
    user: safeUserSchema,
  }),
});

export const actionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({}).strict(),
});

export const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string())),
});

export type SafeUser = z.infer<typeof safeUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const serviceTypeCodeSchema = z.enum(['INTERNET', 'CABLE', 'COMBO']);
export const subscriberStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
]);
export const serviceAccountStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DISCONNECTED',
  'TERMINATED',
]);
export const contactTypeSchema = z.enum(['MOBILE', 'EMAIL', 'OTHER']);

const trimmedText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(1000).optional();

export const addressInputSchema = z.object({
  label: trimmedText,
  addressLine: z.string().trim().min(5).max(500),
  isPrimary: z.boolean().default(false),
});

export const contactInputSchema = z.object({
  type: contactTypeSchema,
  value: trimmedText,
  isPrimary: z.boolean().default(false),
});

export const createPlanSchema = z
  .object({
    serviceTypeCode: serviceTypeCodeSchema,
    code: z.string().trim().min(2).max(40),
    name: trimmedText,
    priceCentavos: z.number().int().nonnegative().safe(),
    speedMbps: z.number().int().positive().nullable().optional(),
    channelCount: z.number().int().positive().nullable().optional(),
    description: optionalText,
  })
  .superRefine((value, context) => {
    if (
      (value.serviceTypeCode === 'INTERNET' ||
        value.serviceTypeCode === 'COMBO') &&
      !value.speedMbps
    )
      context.addIssue({
        code: 'custom',
        path: ['speedMbps'],
        message: 'Internet and Combo plans require a speed.',
      });
    if (
      (value.serviceTypeCode === 'CABLE' ||
        value.serviceTypeCode === 'COMBO') &&
      !value.channelCount
    )
      context.addIssue({
        code: 'custom',
        path: ['channelCount'],
        message: 'Cable and Combo plans require a channel count.',
      });
  });

export const updatePlanSchema = z
  .object({
    name: trimmedText.optional(),
    priceCentavos: z.number().int().nonnegative().safe().optional(),
    reason: z.string().trim().min(8).max(500).optional(),
    speedMbps: z.number().int().positive().nullable().optional(),
    channelCount: z.number().int().positive().nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.priceCentavos !== undefined && !value.reason)
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason is required for a price change.',
      });
  });

export const createSubscriberSchema = z.object({
  accountNumber: z.string().trim().min(3).max(40),
  fullName: trimmedText,
  collectionAreaId: z.uuid().nullable().optional(),
  assignedCollectorId: z.uuid().nullable().optional(),
  notes: optionalText,
  defaultBillingDay: z.number().int().min(1).max(28).default(1),
  defaultDueDay: z.number().int().min(1).max(28).default(15),
  addresses: z.array(addressInputSchema).min(1),
  contacts: z.array(contactInputSchema).min(1),
});

export const changeSubscriberStatusSchema = z.object({
  status: subscriberStatusSchema,
  reason: z.string().trim().min(3).max(500),
});

export const createServiceAccountSchema = z.object({
  accountNumber: z.string().trim().min(3).max(40),
  planId: z.uuid(),
  installationAddressId: z.uuid().nullable().optional(),
  assignedCollectorId: z.uuid().nullable().optional(),
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  billingStartDate: z.iso.date(),
  activationDate: z.iso.datetime().nullable().optional(),
  status: serviceAccountStatusSchema.default('PENDING'),
});

export const changeServiceStatusSchema = z.object({
  status: serviceAccountStatusSchema,
  reason: z.string().trim().min(3).max(500),
});

export const paginationSchema = z.object({
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface PlanDto {
  id: string;
  serviceTypeCode: z.infer<typeof serviceTypeCodeSchema>;
  code: string;
  name: string;
  priceCentavos: number;
  speedMbps: number | null;
  channelCount: number | null;
  description: string | null;
  isActive: boolean;
}

export interface ReferenceItemDto {
  id: string;
  code: string;
  name: string;
}

export interface AddressDto extends z.infer<typeof addressInputSchema> {
  id: string;
}
export interface ContactDto extends z.infer<typeof contactInputSchema> {
  id: string;
}
export interface ServiceAccountDto {
  id: string;
  accountNumber: string;
  planId: string;
  planName: string;
  serviceTypeCode: z.infer<typeof serviceTypeCodeSchema>;
  currentRateCentavos: number;
  billingDay: number;
  dueDay: number;
  billingStartDate: string;
  status: z.infer<typeof serviceAccountStatusSchema>;
  activationDate: string | null;
}
export interface LifecycleEventDto {
  id: number;
  previousStatus: string | null;
  newStatus: string;
  reason: string;
  createdAt: string;
}
export interface SubscriberSummaryDto {
  id: string;
  accountNumber: string;
  fullName: string;
  status: z.infer<typeof subscriberStatusSchema>;
  primaryContact: string | null;
  primaryAddress: string | null;
  serviceCount: number;
}
export interface SubscriberProfileDto extends SubscriberSummaryDto {
  notes: string | null;
  collectionArea: ReferenceItemDto | null;
  assignedCollector: ReferenceItemDto | null;
  addresses: AddressDto[];
  contacts: ContactDto[];
  serviceAccounts: ServiceAccountDto[];
  events: LifecycleEventDto[];
}
export const subscriberActivityQuerySchema = z
  .object({
    page: paginationSchema.shape.page,
    pageSize: paginationSchema.shape.pageSize,
  })
  .default({ page: 1, pageSize: 20 });
export type SubscriberActivityQuery = z.infer<
  typeof subscriberActivityQuerySchema
>;
export interface SubscriberActivityDto {
  id: string;
  occurredAt: string;
  category: 'SUBSCRIBER' | 'SERVICE' | 'BILLING' | 'PAYMENT' | 'COLLECTION';
  label: string;
  reference: string | null;
  status: string | null;
  amountCentavos: number | null;
  reason: string | null;
}
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const invoiceStatuses = [
  'DRAFT',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'CREDITED',
] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export const billingPeriodSchema = z.object({
  periodYear: z.number().int().min(2000).max(2200),
  periodMonth: z.number().int().min(1).max(12),
});
export const invoiceListQuerySchema = paginationSchema.extend({
  status: invoiceStatusSchema.optional(),
  subscriberId: z.uuid().optional(),
  billingCycleId: z.uuid().optional(),
});
export const ledgerQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const adjustmentInputSchema = z.object({
  amountCentavos: z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(500),
});
export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export interface BillingCycleDto {
  id: string;
  periodYear: number;
  periodMonth: number;
  status: 'DRAFT' | 'FINALIZED';
  invoiceCount: number;
  totalCentavos: number;
  finalizedAt: string | null;
}
export interface BillingEligibilityDto {
  periodYear: number;
  periodMonth: number;
  eligibleServices: number;
  existingInvoices: number;
  remainingServices: number;
  estimatedNewCentavos: number;
  inactiveServices: number;
  futureStartServices: number;
  cycleStatus: 'NOT_STARTED' | 'DRAFT' | 'FINALIZED';
}
export interface InvoiceSummaryDto {
  id: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberName: string;
  subscriberAccountNumber: string;
  serviceAccountNumber: string;
  planName: string;
  billingPeriodLabel: string;
  dueDate: string;
  totalCentavos: number;
  adjustmentCentavos: number;
  balanceCentavos: number;
  status: z.infer<typeof invoiceStatusSchema>;
}
export interface InvoiceItemDto {
  id: string;
  type: string;
  description: string;
  amountCentavos: number;
}
export interface AdjustmentDto {
  id: string;
  amountCentavos: number;
  reason: string;
  createdAt: string;
}
export interface InvoiceDetailDto extends InvoiceSummaryDto {
  invoiceDate: string;
  finalizedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  items: InvoiceItemDto[];
  adjustments: AdjustmentDto[];
  allocations: {
    id: string;
    amountCentavos: number;
    paymentDate: string;
    receiptNumber: string | null;
    status: z.infer<typeof paymentStatusSchema>;
  }[];
}
export interface LedgerEntryDto {
  id: number;
  occurredAt: string;
  reference: string;
  description: string;
  debitCentavos: number;
  creditCentavos: number;
  balanceCentavos: number;
}

export const paymentMethods = [
  'CASH',
  'GCASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'OTHER',
] as const;
export const paymentMethodSchema = z.enum(paymentMethods);
export const paymentStatuses = [
  'PENDING_VERIFICATION',
  'POSTED',
  'REJECTED',
  'REVERSED',
] as const;
export const paymentStatusSchema = z.enum(paymentStatuses);
export const createPaymentSchema = z.object({
  subscriberId: z.uuid(),
  idempotencyKey: z.uuid().optional(),
  previewFingerprint: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/)
    .optional(),
  batchAccountId: z.uuid().optional(),
  amountCentavos: z.number().int().positive().safe(),
  method: paymentMethodSchema,
  paymentDate: z.iso.datetime().optional(),
  referenceNumber: z.string().trim().min(1).max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export const gcashSubmissionSchema = z.object({
  subscriberId: z.uuid(),
  batchAccountId: z.uuid().optional(),
  amountCentavos: z.number().int().positive().safe(),
  referenceNumber: z.string().trim().min(3).max(100),
  senderDetails: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(1000).optional(),
  proof: z.object({
    filename: z.string().trim().min(1).max(200),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    dataBase64: z.string().min(4).max(7_000_000),
  }),
});
export const gcashDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({
    decision: z.literal('REJECT'),
    reason: z.string().trim().min(3).max(500),
  }),
]);
export const paymentReversalSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export const paymentListQuerySchema = paginationSchema.extend({
  status: paymentStatusSchema.optional(),
  subscriberId: z.uuid().optional(),
});

export interface PaymentSummaryDto {
  id: string;
  subscriberId: string;
  subscriberName: string;
  subscriberAccountNumber: string;
  amountCentavos: number;
  allocatedCentavos: number;
  creditCentavos: number;
  method: z.infer<typeof paymentMethodSchema>;
  status: z.infer<typeof paymentStatusSchema>;
  referenceNumber: string | null;
  senderDetails: string | null;
  notes: string | null;
  paymentDate: string;
  receiptNumber: string | null;
  receiptVoidedAt: string | null;
  proofId: string | null;
  proofFilename: string | null;
  rejectedReason: string | null;
  reversedReason: string | null;
}

export interface PaymentPreviewDto {
  subscriberId: string;
  fingerprint: string;
  balanceCentavos: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string;
    balanceCentavos: number;
    proposedCentavos: number;
  }>;
  unallocatedCreditCentavos: number;
}

export interface PaymentProofDto {
  id: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
}

export const collectionBatchStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'SUBMITTED',
  'REMITTED',
  'RECONCILED',
  'CLOSED',
] as const;
export const collectionBatchStatusSchema = z.enum(collectionBatchStatuses);
export const collectionBatchListQuerySchema = paginationSchema.extend({
  status: collectionBatchStatusSchema.optional(),
});
export const createCollectionBatchSchema = z.object({
  collectorId: z.uuid(),
  collectionAreaId: z.uuid(),
  batchDate: z.iso.date(),
});
export const remittanceSchema = z.object({
  amountCentavos: z.number().int().nonnegative().safe(),
  notes: z.string().trim().max(1000).optional(),
});
export const reconciliationSchema = z.object({
  actorConfirmed: z.literal(true),
  expectedDifferenceCentavos: z.number().int().safe(),
});

export interface CollectionBatchTotalsDto {
  expectedReceivableCentavos: number;
  cashCollectedCentavos: number;
  nonCashCollectedCentavos: number;
  uncollectedCentavos: number;
  remittedCashCentavos: number;
  differenceCentavos: number;
}
export interface BatchAccountDto {
  id: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberName: string;
  serviceAccountNumber: string;
  routeAddress: string;
  currentBillCentavos: number;
  arrearsCentavos: number;
  totalDueCentavos: number;
  paymentId: string | null;
  paymentMethod: z.infer<typeof paymentMethodSchema> | null;
  paymentAmountCentavos: number;
}
export interface CollectionBatchSummaryDto extends CollectionBatchTotalsDto {
  id: string;
  collectorId: string;
  collectorName: string;
  collectionAreaId: string;
  collectionAreaName: string;
  batchDate: string;
  status: z.infer<typeof collectionBatchStatusSchema>;
  accountCount: number;
}
export interface CollectionBatchDetailDto extends CollectionBatchSummaryDto {
  accounts: BatchAccountDto[];
}

export const agingBuckets = [
  'CURRENT',
  '1_30',
  '31_60',
  '61_90',
  '90_PLUS',
] as const;
export const agingBucketSchema = z.enum(agingBuckets);
export const receivableAsOfSchema = z.object({ asOf: z.iso.date() });
export const receivableListQuerySchema = paginationSchema.extend({
  asOf: z.iso.date(),
  collectorId: z.uuid().optional(),
  areaId: z.uuid().optional(),
  planId: z.uuid().optional(),
  serviceTypeCode: serviceTypeCodeSchema.optional(),
  agingBucket: agingBucketSchema.optional(),
});
export const delinquencySettingsInputSchema = z
  .object({
    gracePeriodDays: z.number().int().min(0).max(365),
    suspensionThresholdDays: z.number().int().min(1).max(730),
    reconnectionFeeCentavos: z.number().int().nonnegative().safe(),
  })
  .refine((value) => value.suspensionThresholdDays >= value.gracePeriodDays, {
    message: 'Suspension threshold must be at least the grace period.',
    path: ['suspensionThresholdDays'],
  });
export const suspensionInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  effectiveDate: z.iso.date(),
  notes: z.string().trim().max(1000).optional(),
});
export const reconnectionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestDate: z.iso.date(),
  technician: z.string().trim().min(2).max(200),
  notes: z.string().trim().max(1000).optional(),
});
export const reconnectionCompletionSchema = z.object({
  completionDate: z.iso.date(),
  notes: z.string().trim().max(1000).optional(),
});

export interface DelinquencySettingsDto {
  gracePeriodDays: number;
  suspensionThresholdDays: number;
  reconnectionFeeCentavos: number;
}
export interface ReceivableSummaryDto {
  asOf: string;
  currentCentavos: number;
  overdueCentavos: number;
  totalCentavos: number;
  overdueSubscribers: number;
  followUpAccounts: number;
  suspensionCandidates: number;
  buckets: Record<(typeof agingBuckets)[number], number>;
}
export interface ReceivableDetailDto {
  serviceAccountId: string;
  serviceAccountNumber: string;
  serviceStatus: z.infer<typeof serviceAccountStatusSchema>;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberName: string;
  planId: string;
  planName: string;
  serviceTypeCode: z.infer<typeof serviceTypeCodeSchema>;
  collectionAreaId: string | null;
  collectionAreaName: string | null;
  collectorId: string | null;
  collectorName: string | null;
  monthsUnpaid: number;
  oldestUnpaidInvoice: string;
  oldestDueDate: string;
  lastPaymentAt: string | null;
  currentCentavos: number;
  totalArrearsCentavos: number;
  totalOutstandingCentavos: number;
  agingCentavos: Record<(typeof agingBuckets)[number], number>;
  oldestAgingBucket: z.infer<typeof agingBucketSchema>;
  followUp: boolean;
  suspensionCandidate: boolean;
}
export interface ServiceControlHistoryDto {
  serviceAccountId: string;
  serviceAccountNumber: string;
  status: z.infer<typeof serviceAccountStatusSchema>;
  suspensions: Array<{
    id: string;
    reason: string;
    effectiveDate: string;
    notes: string | null;
    approvedBy: string | null;
  }>;
  reconnections: Array<{
    id: string;
    status: 'REQUESTED' | 'COMPLETED';
    reason: string;
    technician: string;
    requestDate: string;
    completionDate: string | null;
    feeCentavos: number;
    notes: string | null;
    approvedBy: string | null;
  }>;
  events: LifecycleEventDto[];
}

export const reportKinds = [
  'COLLECTIONS',
  'BILLING_COLLECTION',
  'REVENUE',
  'AR_AGING',
  'SUBSCRIBER_MASTER',
  'SUBSCRIBER_SOA',
  'COLLECTOR_PERFORMANCE',
  'ADJUSTMENTS_REVERSALS_VOIDS',
  'USER_ACTIVITY',
  'AUDIT',
] as const;
export const reportKindSchema = z.enum(reportKinds);
export const reportGranularitySchema = z.enum([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'ANNUAL',
]);
export const reportDimensionSchema = z.enum(['PLAN', 'SERVICE', 'AREA']);
const reportFilterShape = {
  from: z.iso.date(),
  to: z.iso.date(),
  asOf: z.iso.date(),
  granularity: reportGranularitySchema.default('MONTHLY'),
  dimension: reportDimensionSchema.default('PLAN'),
  subscriberId: z.uuid().optional(),
};
const validReportRange = <T extends { from: string; to: string }>(value: T) =>
  value.from <= value.to;
export const reportQuerySchema = z
  .object({ ...paginationSchema.shape, ...reportFilterShape })
  .refine(validReportRange, {
    message: 'From date must not be after to date.',
    path: ['to'],
  });
export const reportExportQuerySchema = z
  .object({ ...reportFilterShape, q: paginationSchema.shape.q })
  .refine(validReportRange, {
    message: 'From date must not be after to date.',
    path: ['to'],
  });
export const reportExportFormatSchema = z.enum(['pdf', 'xlsx']);
export const dashboardQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    asOf: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'From date must not be after to date.',
    path: ['to'],
  });

export type ReportKind = z.infer<typeof reportKindSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export interface ReportColumnDto {
  key: string;
  label: string;
  type: 'text' | 'date' | 'integer' | 'money';
}
export interface ReportResultDto {
  kind: ReportKind;
  title: string;
  generatedAt: string;
  filters: Record<string, string>;
  columns: ReportColumnDto[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  page: number;
  pageSize: number;
  total: number;
}
export interface ReportExportDto {
  filename: string;
  mimeType: string;
  dataBase64: string;
}
export interface DashboardDto {
  asOf: string;
  from: string;
  to: string;
  currentReceivableCentavos: number;
  overdueReceivableCentavos: number;
  overdueSubscribers: number;
  followUpAccounts: number;
  billedCentavos: number;
  collectedCentavos: number;
  monthlyTrend: Array<{
    period: string;
    billedCentavos: number;
    collectedCentavos: number;
    differenceCentavos: number;
  }>;
  paymentMethods: Array<{
    method: z.infer<typeof paymentMethodSchema>;
    count: number;
    amountCentavos: number;
  }>;
  aging: Record<(typeof agingBuckets)[number], number>;
  collectors: Array<{
    collector: string;
    collectedCentavos: number;
    remittedCentavos: number;
    differenceCentavos: number;
  }>;
  alerts: Array<{ label: string; count: number }>;
  recentPayments: Array<{
    receiptNumber: string | null;
    subscriberName: string;
    method: z.infer<typeof paymentMethodSchema>;
    amountCentavos: number;
    paymentDate: string;
  }>;
}

export const applicationSettingsInputSchema = z.object({
  backupRetentionCount: z.coerce.number().int().min(1).max(50),
});
export const restoreBackupInputSchema = z.object({
  confirmation: z.string().min(1).max(200),
});
export const backupHistoryQuerySchema = paginationSchema;

export interface ApplicationSettingsDto {
  backupRetentionCount: number;
  updatedAt: string;
}

export interface BackupManifestDto {
  formatVersion: 1;
  applicationVersion: string;
  schemaVersion: string;
  createdAt: string;
  database: { file: string; sizeBytes: number; sha256: string };
  attachments: Array<{ path: string; sizeBytes: number; sha256: string }>;
  rowCounts: Record<string, number>;
}

export interface BackupHistoryDto {
  id: string;
  operation: 'BACKUP' | 'SAFETY_BACKUP' | 'RESTORE';
  status: 'SUCCEEDED' | 'FAILED';
  backupName: string;
  sourceBackupName: string | null;
  message: string;
  completedAt: string;
  available: boolean;
  manifest: BackupManifestDto | null;
}

export interface OperationsReadinessDto {
  databaseReady: boolean;
  attachmentStorageReady: boolean;
  backupStorageReady: boolean;
  postgresToolsReady: boolean;
  restoring: boolean;
}
