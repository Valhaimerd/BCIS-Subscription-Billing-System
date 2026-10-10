import type {
  DashboardDto,
  ReportColumnDto,
  ReportExportDto,
  ReportKind,
  ReportQuery,
  ReportResultDto,
} from '@bcis/contracts';
import {
  adjustments,
  auditLogs,
  batchAccounts,
  collectionAreas,
  collectionBatches,
  collectorRemittances,
  collectors,
  type DatabaseConnection,
  invoices,
  ledgerEntries,
  paymentAllocations,
  paymentReversals,
  payments,
  receipts,
  serviceAccounts,
  servicePlans,
  serviceTypes,
  subscribers,
  users,
} from '@bcis/database';
import ExcelJS from 'exceljs';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import pdfMake from 'pdfmake';
import type { Content } from 'pdfmake';
import { resolve, sep } from 'node:path';

import { BillingService } from './billing.js';
import { dateBucket, reportFilename, sliceReportRows } from './report-rules.js';
import { ReceivableService } from './receivables.js';

type Database = DatabaseConnection['db'];
type Row = Record<string, string | number | null>;
type ReportFilters = Omit<ReportQuery, 'page' | 'pageSize' | 'q'> & {
  q?: string;
};

export class ReportError extends Error {
  constructor(
    public readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

const money = (value: number) =>
  `PHP ${(value / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) =>
  value === null || value === undefined ? '' : String(value);
const filterReportRows = (rows: Row[], query = '') => {
  const normalized = query.trim().toLowerCase();
  return normalized
    ? rows.filter((row) =>
        Object.values(row).some((value) =>
          text(value).toLowerCase().includes(normalized),
        ),
      )
    : rows;
};
const dateBounds = (from: string, to: string) => ({
  from: new Date(`${from}T00:00:00.000Z`),
  to: new Date(`${to}T23:59:59.999Z`),
});

export class ReportService {
  private readonly billing: BillingService;

  constructor(
    private readonly db: Database,
    private readonly receivables: ReceivableService,
  ) {
    this.billing = new BillingService(db);
  }

  async dashboard(input: {
    from: string;
    to: string;
    asOf: string;
  }): Promise<DashboardDto> {
    const filters: ReportFilters = {
      ...input,
      granularity: 'MONTHLY',
      dimension: 'PLAN',
    };
    const [aging, collections, billingCollection, collectorPerformance] =
      await Promise.all([
        this.receivables.summary(input.asOf),
        this.build('COLLECTIONS', filters),
        this.build('BILLING_COLLECTION', filters),
        this.build('COLLECTOR_PERFORMANCE', filters),
      ]);
    const asOfEnd = new Date(`${input.asOf}T23:59:59.999Z`);
    const recent = await this.db
      .select({
        receiptNumber: receipts.receiptNumber,
        subscriberName: subscribers.fullName,
        method: payments.method,
        amountCentavos: payments.amountCentavos,
        paymentDate: payments.paymentDate,
      })
      .from(payments)
      .innerJoin(subscribers, eq(subscribers.id, payments.subscriberId))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(
        and(eq(payments.status, 'POSTED'), lte(payments.paymentDate, asOfEnd)),
      )
      .orderBy(desc(payments.paymentDate))
      .limit(6);
    return {
      asOf: input.asOf,
      from: input.from,
      to: input.to,
      currentReceivableCentavos: aging.currentCentavos,
      overdueReceivableCentavos: aging.overdueCentavos,
      overdueSubscribers: aging.overdueSubscribers,
      followUpAccounts: aging.followUpAccounts,
      billedCentavos: billingCollection.totals.billedCentavos ?? 0,
      collectedCentavos: collections.totals.amountCentavos ?? 0,
      monthlyTrend: billingCollection.rows.map((row) => ({
        period: text(row.period),
        billedCentavos: number(row.billedCentavos),
        collectedCentavos: number(row.collectedCentavos),
        differenceCentavos: number(row.differenceCentavos),
      })),
      paymentMethods: collections.rows.map((row) => ({
        method: row.method as DashboardDto['paymentMethods'][number]['method'],
        count: number(row.count),
        amountCentavos: number(row.amountCentavos),
      })),
      aging: aging.buckets,
      collectors: collectorPerformance.rows.slice(0, 5).map((row) => ({
        collector: text(row.collector),
        collectedCentavos: number(row.collectedCentavos),
        remittedCentavos: number(row.remittedCentavos),
        differenceCentavos: number(row.differenceCentavos),
      })),
      alerts: [
        { label: 'Accounts for follow-up', count: aging.followUpAccounts },
        {
          label: 'Suspension candidates',
          count: aging.suspensionCandidates,
        },
      ],
      recentPayments: recent.map((row) => ({
        receiptNumber: row.receiptNumber,
        subscriberName: row.subscriberName,
        method: row.method,
        amountCentavos: row.amountCentavos,
        paymentDate: row.paymentDate.toISOString(),
      })),
    };
  }

  async report(kind: ReportKind, query: ReportQuery): Promise<ReportResultDto> {
    const report = await this.build(kind, query);
    const matching = filterReportRows(report.rows, query.q);
    const page = sliceReportRows(matching, query.page, query.pageSize);
    return {
      ...report,
      rows: page.rows,
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  }

  async export(
    kind: ReportKind,
    query: ReportFilters,
    format: 'pdf' | 'xlsx',
  ): Promise<ReportExportDto> {
    const report = await this.build(kind, query);
    const matching = filterReportRows(report.rows, query.q);
    const filteredReport = {
      ...report,
      rows: matching,
      pageSize: matching.length,
      total: matching.length,
    };
    const buffer =
      format === 'pdf'
        ? await this.renderPdf(filteredReport)
        : await this.renderWorkbook(filteredReport);
    return {
      filename: reportFilename(report.title, query.asOf, format),
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dataBase64: buffer.toString('base64'),
    };
  }

  private async build(
    kind: ReportKind,
    filters: ReportFilters,
  ): Promise<ReportResultDto> {
    const generatedAt = new Date().toISOString();
    const result =
      kind === 'COLLECTIONS'
        ? await this.collections(filters)
        : kind === 'BILLING_COLLECTION'
          ? await this.billingCollection(filters)
          : kind === 'REVENUE'
            ? await this.revenue(filters)
            : kind === 'AR_AGING'
              ? await this.aging(filters)
              : kind === 'SUBSCRIBER_MASTER'
                ? await this.subscriberMaster()
                : kind === 'SUBSCRIBER_SOA'
                  ? await this.subscriberStatement(filters)
                  : kind === 'COLLECTOR_PERFORMANCE'
                    ? await this.collectorPerformance(filters)
                    : kind === 'ADJUSTMENTS_REVERSALS_VOIDS'
                      ? await this.corrections(filters)
                      : kind === 'USER_ACTIVITY'
                        ? await this.userActivity(filters)
                        : await this.audit(filters);
    const displayedFilters: Record<string, string> = {
      from: filters.from,
      to: filters.to,
      asOf: filters.asOf,
    };
    if (kind === 'COLLECTIONS' || kind === 'BILLING_COLLECTION')
      displayedFilters.granularity = filters.granularity;
    if (kind === 'REVENUE') displayedFilters.dimension = filters.dimension;
    if (filters.q?.trim()) displayedFilters.search = filters.q.trim();
    return {
      kind,
      generatedAt,
      filters: displayedFilters,
      page: 1,
      pageSize: result.rows.length,
      total: result.rows.length,
      ...result,
    };
  }

  private async collections(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    const asOf = new Date(`${filters.asOf}T23:59:59.999Z`);
    type PaymentRow = {
      method: string;
      paymentDate: Date;
      amountCentavos: number;
    };
    const result = await this.db.execute<PaymentRow>(sql`
      select p.method, p.payment_date as "paymentDate", p.amount_centavos::int as "amountCentavos"
      from ${payments} p
      where p.payment_date between ${from} and ${to}
        and p.payment_date <= ${asOf}
        and (p.status = 'POSTED' or (p.status = 'REVERSED' and not exists (
          select 1 from ${paymentReversals} pr where pr.payment_id = p.id and pr.created_at <= ${asOf}
        )))
      order by p.payment_date, p.method
    `);
    const grouped = new Map<string, Row>();
    for (const payment of result.rows) {
      const period = dateBucket(payment.paymentDate, filters.granularity);
      const key = `${period}:${payment.method}`;
      const row = grouped.get(key) ?? {
        period,
        method: payment.method,
        count: 0,
        amountCentavos: 0,
      };
      row.count = number(row.count) + 1;
      row.amountCentavos =
        number(row.amountCentavos) + number(payment.amountCentavos);
      grouped.set(key, row);
    }
    const rows = [...grouped.values()].sort(
      (left, right) =>
        text(left.period).localeCompare(text(right.period)) ||
        text(left.method).localeCompare(text(right.method)),
    );
    return {
      title: `${filters.granularity[0]}${filters.granularity.slice(1).toLowerCase()} Collection Report`,
      columns: [
        { key: 'period', label: 'Period', type: 'text' },
        { key: 'method', label: 'Method', type: 'text' },
        { key: 'count', label: 'Payments', type: 'integer' },
        { key: 'amountCentavos', label: 'Collected', type: 'money' },
      ] satisfies ReportColumnDto[],
      rows,
      totals: {
        count: rows.reduce((sum, row) => sum + number(row.count), 0),
        amountCentavos: rows.reduce(
          (sum, row) => sum + number(row.amountCentavos),
          0,
        ),
      },
    };
  }

  private async billingCollection(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    const asOf = new Date(`${filters.asOf}T23:59:59.999Z`);
    type BillingRow = {
      invoiceDate: string;
      billedCentavos: number;
    };
    const billed = await this.db.execute<BillingRow>(sql`
      select i.invoice_date as "invoiceDate",
        (i.total_centavos + coalesce((
          select sum(a.amount_centavos) from ${adjustments} a
          join ${ledgerEntries} le on le.adjustment_id = a.id
          where a.invoice_id = i.id and le.occurred_at <= ${asOf}
        ), 0))::int as "billedCentavos"
      from ${invoices} i
      where i.invoice_date between ${filters.from} and ${filters.to}
        and i.finalized_at <= ${asOf}
        and (i.voided_at is null or i.voided_at > ${asOf})
      order by i.invoice_date
    `);
    type CollectionRow = { paymentDate: Date; collectedCentavos: number };
    const collected = await this.db.execute<CollectionRow>(sql`
      select p.payment_date as "paymentDate", p.amount_centavos::int as "collectedCentavos"
      from ${payments} p
      where p.payment_date between ${from} and ${to}
        and p.payment_date <= ${asOf}
        and (p.status = 'POSTED' or (p.status = 'REVERSED' and not exists (
          select 1 from ${paymentReversals} pr where pr.payment_id = p.id and pr.created_at <= ${asOf}
        )))
      order by p.payment_date
    `);
    const grouped = new Map<string, Row>();
    for (const invoice of billed.rows) {
      const period = dateBucket(invoice.invoiceDate, filters.granularity);
      const row = grouped.get(period) ?? {
        period,
        billedCentavos: 0,
        collectedCentavos: 0,
        differenceCentavos: 0,
      };
      row.billedCentavos =
        number(row.billedCentavos) + number(invoice.billedCentavos);
      grouped.set(period, row);
    }
    for (const payment of collected.rows) {
      const period = dateBucket(payment.paymentDate, filters.granularity);
      const row = grouped.get(period) ?? {
        period,
        billedCentavos: 0,
        collectedCentavos: 0,
        differenceCentavos: 0,
      };
      row.collectedCentavos =
        number(row.collectedCentavos) + number(payment.collectedCentavos);
      grouped.set(period, row);
    }
    const rows: Row[] = [...grouped.values()]
      .map((row): Row => ({
        ...row,
        differenceCentavos:
          number(row.billedCentavos) - number(row.collectedCentavos),
      }))
      .sort((left, right) =>
        text(left.period).localeCompare(text(right.period)),
      );
    const billedCentavos = rows.reduce(
      (sum, row) => sum + number(row.billedCentavos),
      0,
    );
    const collectedCentavos = rows.reduce(
      (sum, row) => sum + number(row.collectedCentavos),
      0,
    );
    return {
      title: 'Billing versus Collection Report',
      columns: [
        { key: 'period', label: 'Period', type: 'text' },
        { key: 'billedCentavos', label: 'Billed', type: 'money' },
        { key: 'collectedCentavos', label: 'Collected', type: 'money' },
        { key: 'differenceCentavos', label: 'Difference', type: 'money' },
      ] satisfies ReportColumnDto[],
      rows,
      totals: {
        billedCentavos,
        collectedCentavos,
        differenceCentavos: billedCentavos - collectedCentavos,
      },
    };
  }

  private async revenue(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    const asOf = new Date(`${filters.asOf}T23:59:59.999Z`);
    type RevenueRow = {
      plan: string;
      service: string;
      area: string;
      amountCentavos: number;
    };
    const result = await this.db.execute<RevenueRow>(sql`
      select sp.name as plan, st.name as service, coalesce(ca.name, 'Unassigned') as area,
        pa.amount_centavos::int as "amountCentavos"
      from ${paymentAllocations} pa
      join ${payments} p on p.id = pa.payment_id
      join ${invoices} i on i.id = pa.invoice_id
      join ${serviceAccounts} sa on sa.id = i.service_account_id
      join ${servicePlans} sp on sp.id = sa.plan_id
      join ${serviceTypes} st on st.id = sp.service_type_id
      join ${subscribers} s on s.id = i.subscriber_id
      left join ${collectionAreas} ca on ca.id = s.collection_area_id
      where p.payment_date between ${from} and ${to}
        and pa.created_at <= ${asOf}
        and (p.status = 'POSTED' or (p.status = 'REVERSED' and not exists (
          select 1 from ${paymentReversals} pr where pr.payment_id = p.id and pr.created_at <= ${asOf}
        )))
    `);
    const key = filters.dimension.toLowerCase() as 'plan' | 'service' | 'area';
    const grouped = new Map<string, Row>();
    for (const item of result.rows) {
      const label = item[key];
      const row = grouped.get(label) ?? {
        dimension: filters.dimension,
        label,
        allocatedRevenueCentavos: 0,
      };
      row.allocatedRevenueCentavos =
        number(row.allocatedRevenueCentavos) + number(item.amountCentavos);
      grouped.set(label, row);
    }
    const rows = [...grouped.values()].sort(
      (left, right) =>
        number(right.allocatedRevenueCentavos) -
        number(left.allocatedRevenueCentavos),
    );
    return {
      title: `Revenue by ${filters.dimension.toLowerCase()} Report`,
      columns: [
        { key: 'dimension', label: 'Dimension', type: 'text' },
        { key: 'label', label: filters.dimension, type: 'text' },
        {
          key: 'allocatedRevenueCentavos',
          label: 'Allocated revenue',
          type: 'money',
        },
      ] satisfies ReportColumnDto[],
      rows,
      totals: {
        allocatedRevenueCentavos: rows.reduce(
          (sum, row) => sum + number(row.allocatedRevenueCentavos),
          0,
        ),
      },
    };
  }

  private async aging(filters: ReportFilters) {
    const details = await this.receivables.list({
      asOf: filters.asOf,
      page: 1,
      pageSize: 100_000,
    });
    const summary = await this.receivables.summary(filters.asOf);
    return {
      title: 'Accounts Receivable Aging Report',
      columns: [
        { key: 'subscriber', label: 'Subscriber', type: 'text' },
        { key: 'service', label: 'Service', type: 'text' },
        { key: 'area', label: 'Area', type: 'text' },
        { key: 'collector', label: 'Collector', type: 'text' },
        { key: 'monthsUnpaid', label: 'Months', type: 'integer' },
        { key: 'oldestInvoice', label: 'Oldest invoice', type: 'text' },
        { key: 'bucket', label: 'Age', type: 'text' },
        { key: 'arrearsCentavos', label: 'Arrears', type: 'money' },
      ] satisfies ReportColumnDto[],
      rows: details.items.map((row) => ({
        subscriber: `${row.subscriberAccountNumber} - ${row.subscriberName}`,
        service: row.serviceAccountNumber,
        area: row.collectionAreaName ?? 'Unassigned',
        collector: row.collectorName ?? 'Unassigned',
        monthsUnpaid: row.monthsUnpaid,
        oldestInvoice: row.oldestUnpaidInvoice,
        bucket: row.oldestAgingBucket,
        arrearsCentavos: row.totalArrearsCentavos,
      })),
      totals: {
        currentCentavos: summary.currentCentavos,
        overdueCentavos: summary.overdueCentavos,
        totalCentavos: summary.totalCentavos,
      },
    };
  }

  private async subscriberMaster() {
    const rows = await this.db
      .select({
        accountNumber: subscribers.accountNumber,
        subscriber: subscribers.fullName,
        status: subscribers.status,
        area: collectionAreas.name,
        collector: collectors.fullName,
        serviceCount: sql<number>`count(${serviceAccounts.id})::int`,
      })
      .from(subscribers)
      .leftJoin(
        collectionAreas,
        eq(collectionAreas.id, subscribers.collectionAreaId),
      )
      .leftJoin(collectors, eq(collectors.id, subscribers.assignedCollectorId))
      .leftJoin(
        serviceAccounts,
        eq(serviceAccounts.subscriberId, subscribers.id),
      )
      .groupBy(subscribers.id, collectionAreas.name, collectors.fullName)
      .orderBy(asc(subscribers.accountNumber));
    return {
      title: 'Subscriber Master Report',
      columns: [
        { key: 'accountNumber', label: 'Account', type: 'text' },
        { key: 'subscriber', label: 'Subscriber', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'area', label: 'Area', type: 'text' },
        { key: 'collector', label: 'Collector', type: 'text' },
        { key: 'serviceCount', label: 'Services', type: 'integer' },
      ] satisfies ReportColumnDto[],
      rows: rows.map((row) => ({
        ...row,
        area: row.area ?? 'Unassigned',
        collector: row.collector ?? 'Unassigned',
      })),
      totals: {
        subscribers: rows.length,
        services: rows.reduce((sum, row) => sum + number(row.serviceCount), 0),
      },
    };
  }

  private async subscriberStatement(filters: ReportFilters) {
    if (!filters.subscriberId)
      throw new ReportError(
        409,
        'Subscriber Statement of Account requires a subscriber.',
      );
    const [subscriber] = await this.db
      .select({
        accountNumber: subscribers.accountNumber,
        name: subscribers.fullName,
      })
      .from(subscribers)
      .where(eq(subscribers.id, filters.subscriberId));
    if (!subscriber) throw new ReportError(404, 'Subscriber not found.');
    const entries = await this.billing.ledger(filters.subscriberId, {
      from: filters.from,
      to: filters.to,
    });
    return {
      title: `Subscriber SOA - ${subscriber.accountNumber}`,
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'reference', label: 'Reference', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'debitCentavos', label: 'Debit', type: 'money' },
        { key: 'creditCentavos', label: 'Credit', type: 'money' },
        { key: 'balanceCentavos', label: 'Balance', type: 'money' },
      ] satisfies ReportColumnDto[],
      rows: entries.map((entry) => ({
        date: entry.occurredAt.slice(0, 10),
        reference: entry.reference,
        description: entry.description,
        debitCentavos: entry.debitCentavos,
        creditCentavos: entry.creditCentavos,
        balanceCentavos: entry.balanceCentavos,
      })),
      totals: {
        debitCentavos: entries.reduce(
          (sum, entry) => sum + entry.debitCentavos,
          0,
        ),
        creditCentavos: entries.reduce(
          (sum, entry) => sum + entry.creditCentavos,
          0,
        ),
        balanceCentavos: entries.at(-1)?.balanceCentavos ?? 0,
      },
    };
  }

  private async collectorPerformance(filters: ReportFilters) {
    type BatchRow = {
      collector: string;
      batchId: string;
      accountCount: number;
      expectedCentavos: number;
      collectedCentavos: number;
      remittedCentavos: number;
    };
    const result = await this.db.execute<BatchRow>(sql`
      select c.full_name as collector, cb.id as "batchId",
        (select count(*)::int from ${batchAccounts} ba where ba.batch_id = cb.id) as "accountCount",
        coalesce((select sum(ba.total_due_centavos) from ${batchAccounts} ba where ba.batch_id = cb.id), 0)::int as "expectedCentavos",
        coalesce((select sum(p.amount_centavos) from ${payments} p join ${batchAccounts} ba on ba.id = p.batch_account_id where ba.batch_id = cb.id and p.status = 'POSTED'), 0)::int as "collectedCentavos",
        coalesce((select cr.amount_centavos from ${collectorRemittances} cr where cr.batch_id = cb.id), 0)::int as "remittedCentavos"
      from ${collectionBatches} cb
      join ${collectors} c on c.id = cb.collector_id
      where cb.batch_date between ${filters.from} and ${filters.to}
        and cb.created_at <= ${new Date(`${filters.asOf}T23:59:59.999Z`)}
      order by c.full_name, cb.batch_date
    `);
    const grouped = new Map<string, Row>();
    for (const batch of result.rows) {
      const row = grouped.get(batch.collector) ?? {
        collector: batch.collector,
        batches: 0,
        assignedAccounts: 0,
        expectedCentavos: 0,
        collectedCentavos: 0,
        remittedCentavos: 0,
        differenceCentavos: 0,
      };
      row.batches = number(row.batches) + 1;
      row.assignedAccounts =
        number(row.assignedAccounts) + number(batch.accountCount);
      row.expectedCentavos =
        number(row.expectedCentavos) + number(batch.expectedCentavos);
      row.collectedCentavos =
        number(row.collectedCentavos) + number(batch.collectedCentavos);
      row.remittedCentavos =
        number(row.remittedCentavos) + number(batch.remittedCentavos);
      row.differenceCentavos =
        number(row.remittedCentavos) - number(row.collectedCentavos);
      grouped.set(batch.collector, row);
    }
    const rows = [...grouped.values()].sort(
      (left, right) =>
        number(right.collectedCentavos) - number(left.collectedCentavos),
    );
    return {
      title: 'Collector Remittance and Performance Report',
      columns: [
        { key: 'collector', label: 'Collector', type: 'text' },
        { key: 'batches', label: 'Batches', type: 'integer' },
        { key: 'assignedAccounts', label: 'Assignments', type: 'integer' },
        { key: 'expectedCentavos', label: 'Expected', type: 'money' },
        { key: 'collectedCentavos', label: 'Collected', type: 'money' },
        { key: 'remittedCentavos', label: 'Remitted', type: 'money' },
        { key: 'differenceCentavos', label: 'Difference', type: 'money' },
      ] satisfies ReportColumnDto[],
      rows,
      totals: {
        expectedCentavos: rows.reduce(
          (sum, row) => sum + number(row.expectedCentavos),
          0,
        ),
        collectedCentavos: rows.reduce(
          (sum, row) => sum + number(row.collectedCentavos),
          0,
        ),
        remittedCentavos: rows.reduce(
          (sum, row) => sum + number(row.remittedCentavos),
          0,
        ),
        differenceCentavos: rows.reduce(
          (sum, row) => sum + number(row.differenceCentavos),
          0,
        ),
      },
    };
  }

  private async corrections(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    const rows: Row[] = [];
    const adjustmentRows = await this.db
      .select({
        date: adjustments.createdAt,
        reference: invoices.invoiceNumber,
        subscriber: subscribers.fullName,
        amountCentavos: adjustments.amountCentavos,
        reason: adjustments.reason,
      })
      .from(adjustments)
      .innerJoin(invoices, eq(invoices.id, adjustments.invoiceId))
      .innerJoin(subscribers, eq(subscribers.id, invoices.subscriberId))
      .where(
        and(gte(adjustments.createdAt, from), lte(adjustments.createdAt, to)),
      );
    rows.push(
      ...adjustmentRows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        type: 'ADJUSTMENT',
        reference: row.reference,
        subscriber: row.subscriber,
        amountCentavos: row.amountCentavos,
        reason: row.reason,
      })),
    );
    const reversalRows = await this.db
      .select({
        date: paymentReversals.createdAt,
        reference: receipts.receiptNumber,
        subscriber: subscribers.fullName,
        amountCentavos: payments.amountCentavos,
        reason: paymentReversals.reason,
      })
      .from(paymentReversals)
      .innerJoin(payments, eq(payments.id, paymentReversals.paymentId))
      .innerJoin(subscribers, eq(subscribers.id, payments.subscriberId))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(
        and(
          gte(paymentReversals.createdAt, from),
          lte(paymentReversals.createdAt, to),
        ),
      );
    rows.push(
      ...reversalRows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        type: 'PAYMENT REVERSAL',
        reference: row.reference ?? 'No receipt',
        subscriber: row.subscriber,
        amountCentavos: -row.amountCentavos,
        reason: row.reason,
      })),
    );
    const voidRows = await this.db
      .select({
        date: invoices.voidedAt,
        reference: invoices.invoiceNumber,
        subscriber: subscribers.fullName,
        amountCentavos: invoices.totalCentavos,
        reason: invoices.voidReason,
      })
      .from(invoices)
      .innerJoin(subscribers, eq(subscribers.id, invoices.subscriberId))
      .where(and(gte(invoices.voidedAt, from), lte(invoices.voidedAt, to)));
    rows.push(
      ...voidRows.map((row) => ({
        date: row.date?.toISOString().slice(0, 10) ?? '',
        type: 'VOID INVOICE',
        reference: row.reference,
        subscriber: row.subscriber,
        amountCentavos: -row.amountCentavos,
        reason: row.reason ?? '',
      })),
    );
    rows.sort((left, right) => text(left.date).localeCompare(text(right.date)));
    return {
      title: 'Adjustments, Reversals, and Voids Report',
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'reference', label: 'Reference', type: 'text' },
        { key: 'subscriber', label: 'Subscriber', type: 'text' },
        { key: 'amountCentavos', label: 'Amount', type: 'money' },
        { key: 'reason', label: 'Reason', type: 'text' },
      ] satisfies ReportColumnDto[],
      rows,
      totals: {
        amountCentavos: rows.reduce(
          (sum, row) => sum + number(row.amountCentavos),
          0,
        ),
      },
    };
  }

  private async userActivity(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    type ActivityRow = {
      actor: string;
      action: string;
      count: number;
      lastAt: Date;
    };
    const result = await this.db.execute<ActivityRow>(sql`
      select coalesce(u.full_name, 'System') as actor, al.action,
        count(*)::int as count, max(al.created_at) as "lastAt"
      from ${auditLogs} al
      left join ${users} u on u.id = al.actor_user_id
      where al.created_at between ${from} and ${to}
      group by coalesce(u.full_name, 'System'), al.action
      order by count(*) desc, actor, al.action
    `);
    return {
      title: 'User Activity Report',
      columns: [
        { key: 'actor', label: 'User', type: 'text' },
        { key: 'action', label: 'Action', type: 'text' },
        { key: 'count', label: 'Events', type: 'integer' },
        { key: 'lastAt', label: 'Last event', type: 'date' },
      ] satisfies ReportColumnDto[],
      rows: result.rows.map((row) => ({
        actor: row.actor,
        action: row.action,
        count: number(row.count),
        lastAt: new Date(row.lastAt).toISOString(),
      })),
      totals: {
        events: result.rows.reduce((sum, row) => sum + number(row.count), 0),
      },
    };
  }

  private async audit(filters: ReportFilters) {
    const { from, to } = dateBounds(filters.from, filters.to);
    const rows = await this.db
      .select({
        createdAt: auditLogs.createdAt,
        actor: users.fullName,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        reason: auditLogs.reason,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(gte(auditLogs.createdAt, from), lte(auditLogs.createdAt, to)))
      .orderBy(desc(auditLogs.createdAt));
    return {
      title: 'Audit Trail Report',
      columns: [
        { key: 'date', label: 'Timestamp', type: 'date' },
        { key: 'actor', label: 'Actor', type: 'text' },
        { key: 'action', label: 'Action', type: 'text' },
        { key: 'entity', label: 'Entity', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'text' },
      ] satisfies ReportColumnDto[],
      rows: rows.map((row) => ({
        date: row.createdAt.toISOString(),
        actor: row.actor ?? 'System',
        action: row.action,
        entity: `${row.entityType}${row.entityId ? ` / ${row.entityId}` : ''}`,
        reason: row.reason ?? '',
      })),
      totals: { events: rows.length },
    };
  }

  private displayValue(column: ReportColumnDto, value: unknown) {
    if (column.type === 'money') return money(number(value));
    return text(value);
  }

  private totalLabel(key: string) {
    const label = key
      .replace(/Centavos$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim();
    return `${label[0]?.toUpperCase() ?? ''}${label.slice(1)}`;
  }

  private async renderPdf(report: ReportResultDto): Promise<Buffer> {
    const fontDirectory = resolve(
      import.meta.dirname,
      '../../../node_modules/pdfmake/fonts/Roboto',
    );
    pdfMake.setUrlAccessPolicy(() => false);
    pdfMake.setLocalAccessPolicy((path) =>
      path.startsWith(`${fontDirectory}${sep}`),
    );
    pdfMake.addFonts({
      Roboto: {
        normal: resolve(fontDirectory, 'Roboto-Regular.ttf'),
        bold: resolve(fontDirectory, 'Roboto-Medium.ttf'),
        italics: resolve(fontDirectory, 'Roboto-Italic.ttf'),
        bolditalics: resolve(fontDirectory, 'Roboto-MediumItalic.ttf'),
      },
    });
    const filters = Object.entries(report.filters)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
    const totalLine = Object.entries(report.totals)
      .map(
        ([key, value]) =>
          `${this.totalLabel(key)}: ${key.toLowerCase().includes('centavos') ? money(value) : value}`,
      )
      .join(' | ');
    const body: Content[][] = [
      report.columns.map((column) => ({ text: column.label, bold: true })),
      ...report.rows.map((row) =>
        report.columns.map((column): Content => ({
          text: this.displayValue(column, row[column.key]),
          alignment:
            column.type === 'money' || column.type === 'integer'
              ? 'right'
              : 'left',
        })),
      ),
    ];
    const definition: Parameters<typeof pdfMake.createPdf>[0] = {
      pageOrientation: report.columns.length > 6 ? 'landscape' : 'portrait',
      pageMargins: [28, 32, 28, 32],
      defaultStyle: { font: 'Roboto', fontSize: 8 },
      content: [
        { text: 'BCIS Billing and Collection', bold: true, fontSize: 10 },
        { text: report.title, bold: true, fontSize: 16, margin: [0, 4, 0, 4] },
        { text: filters, color: '#475569', margin: [0, 0, 0, 2] },
        {
          text: `Generated: ${report.generatedAt}`,
          color: '#475569',
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1,
            widths: report.columns.map(() => '*'),
            body,
          },
          layout: 'lightHorizontalLines',
        },
        { text: totalLine, bold: true, margin: [0, 10, 0, 0] },
      ],
      footer: (currentPage: number, pageCount: number) => ({
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        fontSize: 7,
      }),
    };
    return pdfMake.createPdf(definition).getBuffer();
  }

  private async renderWorkbook(report: ReportResultDto) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BCIS Billing and Collection';
    workbook.created = new Date(report.generatedAt);
    const sheet = workbook.addWorksheet('Report', {
      views: [{ state: 'frozen', ySplit: 5 }],
    });
    sheet.addRow([report.title]);
    sheet.addRow([
      Object.entries(report.filters)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | '),
    ]);
    sheet.addRow([`Generated: ${report.generatedAt}`]);
    sheet.addRow([]);
    const header = sheet.addRow(report.columns.map((column) => column.label));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F2747' },
    };
    for (const row of report.rows) {
      const record = sheet.addRow(
        report.columns.map((column) => {
          const value = row[column.key];
          return column.type === 'money' ? number(value) / 100 : value;
        }),
      );
      for (const [index, column] of report.columns.entries()) {
        if (column.type === 'money')
          record.getCell(index + 1).numFmt = '₱#,##0.00;[Red]-₱#,##0.00';
      }
    }
    sheet.addRow([]);
    const totalsHeading = sheet.addRow(['Totals']);
    totalsHeading.font = { bold: true };
    for (const [key, value] of Object.entries(report.totals)) {
      const row = sheet.addRow([
        this.totalLabel(key),
        key.toLowerCase().includes('centavos') ? value / 100 : value,
      ]);
      row.getCell(1).font = { bold: true };
      if (key.toLowerCase().includes('centavos'))
        row.getCell(2).numFmt = '₱#,##0.00;[Red]-₱#,##0.00';
    }
    sheet.columns = report.columns.map((column) => ({
      width: Math.max(14, Math.min(36, column.label.length + 8)),
    }));
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5, column: report.columns.length },
    };
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output);
  }
}
