import type {
  BillingCycleDto,
  CollectionBatchDetailDto,
  CollectionBatchSummaryDto,
  CollectionRoutePreviewDto,
  InvoiceDetailDto,
  InvoiceSummaryDto,
  LedgerEntryDto,
  Paginated,
  PaymentPreviewDto,
  PaymentProofDto,
  PaymentSummaryDto,
  PlanDto,
  SubscriberActivityDto,
  SubscriberActivityQuery,
  ReceivableDetailDto,
  ReceivableSummaryDto,
  DashboardDto,
  ReportKind,
  ReportQuery,
  ReportResultDto,
  ReferenceItemDto,
  SafeUser,
  ServiceControlHistoryDto,
  SubscriberProfileDto,
  SubscriberSummaryDto,
  DelinquencySettingsDto,
  ApplicationSettingsDto,
  BackupHistoryDto,
  OperationsReadinessDto,
  RestorePreviewDto,
} from '@bcis/contracts';

export interface ReferenceData {
  serviceTypes: ReferenceItemDto[];
  collectionAreas: ReferenceItemDto[];
  collectors: ReferenceItemDto[];
  plans: PlanDto[];
}

export interface DesktopSession {
  expiresAt: string;
  locked: boolean;
  user: SafeUser;
}

export interface DesktopApi {
  platform: string;
  version: string;
  auth: {
    current: () => Promise<DesktopSession | null>;
    login: (credentials: {
      username: string;
      password: string;
    }) => Promise<DesktopSession>;
    logout: () => Promise<void>;
    lock: () => Promise<DesktopSession>;
    unlock: (password: string) => Promise<DesktopSession>;
  };
  masterData: {
    references: () => Promise<ReferenceData>;
    listPlans: () => Promise<PlanDto[]>;
    createPlan: (input: Record<string, unknown>) => Promise<PlanDto>;
    updatePlan: (
      id: string,
      input: Record<string, unknown>,
    ) => Promise<PlanDto>;
    listSubscribers: (query: {
      q: string;
      page: number;
      pageSize: number;
    }) => Promise<Paginated<SubscriberSummaryDto>>;
    getSubscriber: (id: string) => Promise<SubscriberProfileDto>;
    activity: (
      subscriberId: string,
      query: SubscriberActivityQuery,
    ) => Promise<Paginated<SubscriberActivityDto>>;
    createSubscriber: (
      input: Record<string, unknown>,
    ) => Promise<SubscriberProfileDto>;
    changeSubscriberStatus: (
      id: string,
      status: string,
      reason: string,
    ) => Promise<SubscriberProfileDto>;
    createServiceAccount: (
      subscriberId: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  billing: {
    listCycles: () => Promise<BillingCycleDto[]>;
    eligibility: (
      periodYear: number,
      periodMonth: number,
    ) => Promise<import('@bcis/contracts').BillingEligibilityDto>;
    generate: (
      periodYear: number,
      periodMonth: number,
    ) => Promise<{ cycleId: string; created: number; skipped: number }>;
    finalize: (cycleId: string) => Promise<{ finalized: number }>;
    listInvoices: (query: {
      q: string;
      page: number;
      pageSize: number;
      subscriberId?: string;
      billingCycleId?: string;
    }) => Promise<Paginated<InvoiceSummaryDto>>;
    getInvoice: (id: string) => Promise<InvoiceDetailDto>;
    addAdjustment: (
      id: string,
      amountCentavos: number,
      reason: string,
    ) => Promise<unknown>;
    voidInvoice: (id: string, reason: string) => Promise<unknown>;
    ledger: (
      subscriberId: string,
      from?: string,
      to?: string,
    ) => Promise<LedgerEntryDto[]>;
  };
  payments: {
    get: (id: string) => Promise<PaymentSummaryDto>;
    preview: (
      subscriberId: string,
      amountCentavos: number,
    ) => Promise<PaymentPreviewDto>;
    list: (query: {
      q: string;
      page: number;
      pageSize: number;
      status?: string;
      subscriberId?: string;
    }) => Promise<Paginated<PaymentSummaryDto>>;
    create: (input: Record<string, unknown>) => Promise<unknown>;
    submitGcash: (input: Record<string, unknown>) => Promise<unknown>;
    decideGcash: (
      id: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    reverse: (id: string, reason: string) => Promise<unknown>;
    proof: (id: string) => Promise<PaymentProofDto>;
  };
  collections: {
    list: (query: {
      q: string;
      page: number;
      pageSize: number;
      status?: string;
    }) => Promise<Paginated<CollectionBatchSummaryDto>>;
    get: (id: string) => Promise<CollectionBatchDetailDto>;
    preview: (input: {
      collectorId: string;
      collectionAreaId: string;
      batchDate: string;
    }) => Promise<CollectionRoutePreviewDto>;
    create: (
      input: Record<string, unknown>,
    ) => Promise<CollectionBatchDetailDto>;
    start: (id: string) => Promise<CollectionBatchDetailDto>;
    submit: (id: string) => Promise<CollectionBatchDetailDto>;
    remit: (
      id: string,
      amountCentavos: number,
      notes?: string,
    ) => Promise<CollectionBatchDetailDto>;
    reconcile: (
      id: string,
      differenceCentavos: number,
    ) => Promise<CollectionBatchDetailDto>;
    close: (
      id: string,
      differenceCentavos: number,
    ) => Promise<CollectionBatchDetailDto>;
  };
  receivables: {
    summary: (
      query: string | Record<string, unknown>,
    ) => Promise<ReceivableSummaryDto>;
    list: (
      query: Record<string, unknown>,
    ) => Promise<Paginated<ReceivableDetailDto>>;
    settings: () => Promise<DelinquencySettingsDto>;
    updateSettings: (
      input: Record<string, unknown>,
    ) => Promise<DelinquencySettingsDto>;
    history: (serviceAccountId: string) => Promise<ServiceControlHistoryDto>;
    suspend: (
      serviceAccountId: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    requestReconnection: (
      serviceAccountId: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    completeReconnection: (
      id: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  reports: {
    dashboard: (query: {
      from: string;
      to: string;
      asOf: string;
    }) => Promise<DashboardDto>;
    preview: (kind: ReportKind, query: ReportQuery) => Promise<ReportResultDto>;
    export: (
      kind: ReportKind,
      query: Omit<ReportQuery, 'page' | 'pageSize'>,
      format: 'pdf' | 'xlsx',
    ) => Promise<{ saved: boolean; filename: string | null }>;
  };
  operations: {
    readiness: () => Promise<OperationsReadinessDto>;
    settings: () => Promise<ApplicationSettingsDto>;
    updateSettings: (
      backupRetentionCount: number,
    ) => Promise<ApplicationSettingsDto>;
    listBackups: (
      page: number,
      pageSize: number,
    ) => Promise<Paginated<BackupHistoryDto>>;
    createBackup: () => Promise<BackupHistoryDto>;
    previewRestore: (id: string) => Promise<RestorePreviewDto>;
    restoreBackup: (
      id: string,
      confirmation: string,
    ) => Promise<BackupHistoryDto>;
  };
}
