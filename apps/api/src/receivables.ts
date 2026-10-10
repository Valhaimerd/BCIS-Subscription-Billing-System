import type {
  DelinquencySettingsDto,
  Paginated,
  ReceivableDetailDto,
  ReceivableSummaryDto,
  ServiceControlHistoryDto,
} from '@bcis/contracts';
import {
  adjustments,
  auditLogs,
  collectionAreas,
  collectors,
  delinquencySettings,
  invoices,
  ledgerEntries,
  payments,
  reconnectionRecords,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscribers,
  suspensionRecords,
  users,
  type DatabaseConnection,
} from '@bcis/database';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import {
  agingBucket,
  agingTotals,
  applySubscriberCredit,
  canRequestReconnection,
  canSuspend,
  daysPastDue,
  isSuspensionCandidate,
  orderReceivablesForFollowUp,
  type AgingBucket,
} from './receivable-rules.js';

type Database = DatabaseConnection['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class ReceivableError extends Error {
  constructor(
    public readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

interface ReceivableQuery {
  asOf: string;
  q?: string | undefined;
  collectorId?: string | undefined;
  areaId?: string | undefined;
  planId?: string | undefined;
  serviceTypeCode?: 'INTERNET' | 'CABLE' | 'COMBO' | undefined;
  agingBucket?: AgingBucket | undefined;
  queue?: 'ACT_TODAY' | 'DUE_SOON' | 'ALL' | undefined;
}

function caseQueue(row: ReceivableDetailDto, asOf: string) {
  if (
    (row.serviceStatus === 'SUSPENDED' && row.totalArrearsCentavos === 0) ||
    row.followUp ||
    row.suspensionCandidate
  )
    return 'ACT_TODAY';
  const daysUntilDue = Math.round(
    (Date.parse(`${row.oldestDueDate}T00:00:00Z`) -
      Date.parse(`${asOf}T00:00:00Z`)) /
      86_400_000,
  );
  return daysUntilDue <= 7 ? 'DUE_SOON' : 'ALL';
}

export class ReceivableService {
  constructor(private readonly db: Database) {}

  async summary(
    input: string | ReceivableQuery,
  ): Promise<ReceivableSummaryDto> {
    const query = typeof input === 'string' ? { asOf: input } : input;
    const { asOf } = query;
    const rows = await this.derive(query, this.db);
    const buckets: ReceivableSummaryDto['buckets'] = {
      CURRENT: 0,
      '1_30': 0,
      '31_60': 0,
      '61_90': 0,
      '90_PLUS': 0,
    };
    const bucketCounts: ReceivableSummaryDto['bucketCounts'] = {
      CURRENT: 0,
      '1_30': 0,
      '31_60': 0,
      '61_90': 0,
      '90_PLUS': 0,
    };
    const caseCounts = { actToday: 0, dueSoon: 0, all: rows.length };
    for (const row of rows) {
      for (const bucket of Object.keys(buckets) as AgingBucket[]) {
        buckets[bucket] += row.agingCentavos[bucket];
        if (row.agingCentavos[bucket] > 0) bucketCounts[bucket] += 1;
      }
      const queue = caseQueue(row, asOf);
      if (queue === 'ACT_TODAY') caseCounts.actToday += 1;
      if (queue === 'DUE_SOON') caseCounts.dueSoon += 1;
    }
    const currentCentavos = rows.reduce(
      (total, row) => total + row.currentCentavos,
      0,
    );
    const overdueCentavos = rows.reduce(
      (total, row) => total + row.totalArrearsCentavos,
      0,
    );
    return {
      asOf,
      currentCentavos,
      overdueCentavos,
      totalCentavos: currentCentavos + overdueCentavos,
      overdueSubscribers: new Set(
        rows
          .filter((row) => row.totalArrearsCentavos > 0)
          .map((row) => row.subscriberId),
      ).size,
      followUpAccounts: rows.filter((row) => row.followUp).length,
      suspensionCandidates: rows.filter((row) => row.suspensionCandidate)
        .length,
      buckets,
      bucketCounts,
      caseCounts,
    };
  }

  async list(
    query: ReceivableQuery & { page: number; pageSize: number },
  ): Promise<Paginated<ReceivableDetailDto>> {
    const rows = (await this.derive(query, this.db)).filter(
      (row) =>
        !query.queue ||
        query.queue === 'ALL' ||
        caseQueue(row, query.asOf) === query.queue,
    );
    return {
      items: rows.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
    };
  }

  async settings(): Promise<DelinquencySettingsDto> {
    return this.readSettings(this.db);
  }

  async updateSettings(
    input: DelinquencySettingsDto,
    actorUserId: string,
  ): Promise<DelinquencySettingsDto> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .insert(delinquencySettings)
        .values({ id: 1, ...input, updatedByUserId: actorUserId })
        .onConflictDoUpdate({
          target: delinquencySettings.id,
          set: {
            ...input,
            updatedByUserId: actorUserId,
            updatedAt: new Date(),
          },
        });
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'DELINQUENCY_SETTINGS_UPDATED',
        entityType: 'delinquency_settings',
        entityId: '1',
        newValues: input,
      });
    });
    return input;
  }

  async suspend(
    serviceAccountId: string,
    input: {
      reason: string;
      effectiveDate: string;
      notes?: string | undefined;
    },
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const account = await this.lockService(serviceAccountId, transaction);
      const settings = await this.readSettings(transaction);
      const receivable = (
        await this.derive({ asOf: input.effectiveDate }, transaction)
      ).find((row) => row.serviceAccountId === serviceAccountId);
      if (!canSuspend(account.status, receivable?.suspensionCandidate ?? false))
        throw new ReceivableError(
          409,
          'Only an active service account beyond the suspension threshold may be suspended.',
        );
      const [record] = await transaction
        .insert(suspensionRecords)
        .values({
          serviceAccountId,
          ...input,
          approvedByUserId: actorUserId,
        })
        .returning();
      if (!record) throw new Error('Suspension record insert failed.');
      await transaction
        .update(serviceAccounts)
        .set({ status: 'SUSPENDED', updatedAt: new Date() })
        .where(eq(serviceAccounts.id, serviceAccountId));
      await transaction.insert(serviceEvents).values({
        serviceAccountId,
        previousStatus: account.status,
        newStatus: 'SUSPENDED',
        reason: input.reason,
        actorUserId,
      });
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'SERVICE_SUSPENSION_APPROVED',
        entityType: 'suspension_record',
        entityId: record.id,
        reason: input.reason,
        newValues: { effectiveDate: input.effectiveDate, settings },
      });
      return { id: record.id, serviceAccountId, status: 'SUSPENDED' as const };
    });
  }

  async requestReconnection(
    serviceAccountId: string,
    input: {
      reason: string;
      requestDate: string;
      technician: string;
      notes?: string | undefined;
    },
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const account = await this.lockService(serviceAccountId, transaction);
      const receivable = (
        await this.derive({ asOf: input.requestDate }, transaction)
      ).find((row) => row.serviceAccountId === serviceAccountId);
      if (
        !canRequestReconnection(
          account.status,
          receivable?.totalArrearsCentavos ?? 0,
        )
      )
        throw new ReceivableError(
          409,
          'Reconnection requires a suspended service with no overdue balance.',
        );
      const [suspension] = await transaction
        .select({ id: suspensionRecords.id })
        .from(suspensionRecords)
        .where(eq(suspensionRecords.serviceAccountId, serviceAccountId))
        .orderBy(desc(suspensionRecords.effectiveDate))
        .limit(1);
      if (!suspension)
        throw new ReceivableError(409, 'The service has no suspension record.');
      const settings = await this.readSettings(transaction);
      const [record] = await transaction
        .insert(reconnectionRecords)
        .values({
          serviceAccountId,
          suspensionRecordId: suspension.id,
          ...input,
          feeCentavos: settings.reconnectionFeeCentavos,
          approvedByUserId: actorUserId,
        })
        .returning();
      if (!record) throw new Error('Reconnection record insert failed.');
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'SERVICE_RECONNECTION_APPROVED',
        entityType: 'reconnection_record',
        entityId: record.id,
        reason: input.reason,
        newValues: {
          requestDate: input.requestDate,
          technician: input.technician,
          feeCentavos: record.feeCentavos,
        },
      });
      return record;
    });
  }

  async completeReconnection(
    id: string,
    input: { completionDate: string; notes?: string | undefined },
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(reconnectionRecords)
        .where(eq(reconnectionRecords.id, id));
      if (!candidate)
        throw new ReceivableError(404, 'Reconnection record not found.');
      const account = await this.lockService(
        candidate.serviceAccountId,
        transaction,
      );
      const [record] = await transaction
        .select()
        .from(reconnectionRecords)
        .where(eq(reconnectionRecords.id, id))
        .for('update');
      if (!record)
        throw new ReceivableError(404, 'Reconnection record not found.');
      if (record.status !== 'REQUESTED' || account.status !== 'SUSPENDED')
        throw new ReceivableError(
          409,
          'This reconnection cannot be completed.',
        );
      if (input.completionDate < record.requestDate)
        throw new ReceivableError(
          409,
          'Completion date cannot precede the request date.',
        );
      if (record.feeCentavos > 0)
        await this.postReconnectionFee(
          record,
          input.completionDate,
          actorUserId,
          transaction,
        );
      const now = new Date();
      await transaction
        .update(reconnectionRecords)
        .set({
          status: 'COMPLETED',
          completionDate: input.completionDate,
          notes: input.notes ?? record.notes,
          completedByUserId: actorUserId,
          updatedAt: now,
        })
        .where(eq(reconnectionRecords.id, id));
      await transaction
        .update(serviceAccounts)
        .set({ status: 'ACTIVE', updatedAt: now })
        .where(eq(serviceAccounts.id, account.id));
      await transaction.insert(serviceEvents).values({
        serviceAccountId: account.id,
        previousStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
        reason: record.reason,
        actorUserId,
      });
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'SERVICE_RECONNECTION_COMPLETED',
        entityType: 'reconnection_record',
        entityId: id,
        reason: record.reason,
        newValues: {
          completionDate: input.completionDate,
          feeCentavos: record.feeCentavos,
        },
      });
      return { id, serviceAccountId: account.id, status: 'COMPLETED' as const };
    });
  }

  async serviceControlHistory(
    serviceAccountId: string,
  ): Promise<ServiceControlHistoryDto> {
    const [account] = await this.db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, serviceAccountId));
    if (!account) throw new ReceivableError(404, 'Service account not found.');
    const [suspensions, reconnections, events] = await Promise.all([
      this.db
        .select()
        .from(suspensionRecords)
        .where(eq(suspensionRecords.serviceAccountId, serviceAccountId))
        .orderBy(desc(suspensionRecords.effectiveDate)),
      this.db
        .select()
        .from(reconnectionRecords)
        .where(eq(reconnectionRecords.serviceAccountId, serviceAccountId))
        .orderBy(desc(reconnectionRecords.requestDate)),
      this.db
        .select()
        .from(serviceEvents)
        .where(eq(serviceEvents.serviceAccountId, serviceAccountId))
        .orderBy(desc(serviceEvents.createdAt)),
    ]);
    const userIds = [
      ...suspensions.map((record) => record.approvedByUserId),
      ...reconnections.map((record) => record.approvedByUserId),
    ].filter((value): value is string => Boolean(value));
    const actorRows = userIds.length
      ? await this.db
          .select({ id: users.id, name: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const actorNames = new Map(
      actorRows.map((actor) => [actor.id, actor.name]),
    );
    return {
      serviceAccountId,
      serviceAccountNumber: account.accountNumber,
      status: account.status,
      suspensions: suspensions.map((record) => ({
        id: record.id,
        reason: record.reason,
        effectiveDate: record.effectiveDate,
        notes: record.notes,
        approvedBy: record.approvedByUserId
          ? (actorNames.get(record.approvedByUserId) ?? null)
          : null,
      })),
      reconnections: reconnections.map((record) => ({
        id: record.id,
        status: record.status,
        reason: record.reason,
        technician: record.technician,
        requestDate: record.requestDate,
        completionDate: record.completionDate,
        feeCentavos: record.feeCentavos,
        notes: record.notes,
        approvedBy: record.approvedByUserId
          ? (actorNames.get(record.approvedByUserId) ?? null)
          : null,
      })),
      events: events.map((event) => ({
        id: event.id,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private async derive(
    query: ReceivableQuery,
    database: Pick<Database, 'select'>,
  ): Promise<ReceivableDetailDto[]> {
    const asOfEnd = new Date(`${query.asOf}T23:59:59.999Z`);
    const rawInvoices = await database
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        dueDate: invoices.dueDate,
        totalCentavos: invoices.totalCentavos,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberName: subscribers.fullName,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.accountNumber,
        serviceStatus: serviceAccounts.status,
        planId: servicePlans.id,
        planName: servicePlans.name,
        serviceTypeCode: serviceTypes.code,
        collectionAreaId: collectionAreas.id,
        collectionAreaName: collectionAreas.name,
        collectorId: collectors.id,
        collectorName: collectors.fullName,
        adjustments: sql<number>`coalesce((select sum(a.amount_centavos) from adjustments a join ledger_entries le on le.adjustment_id = a.id where a.invoice_id = ${invoices.id} and le.occurred_at <= ${asOfEnd}), 0)`,
        allocations: sql<number>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa join payments p on p.id = pa.payment_id where pa.invoice_id = ${invoices.id} and pa.created_at <= ${asOfEnd} and p.payment_date <= ${asOfEnd} and (p.status = 'POSTED' or (p.status = 'REVERSED' and not exists (select 1 from payment_reversals pr where pr.payment_id = p.id and pr.created_at <= ${asOfEnd})))), 0)`,
        lastPaymentAt: sql<Date | null>`(select max(p.payment_date) from payments p where p.subscriber_id = ${subscribers.id} and p.payment_date <= ${asOfEnd} and (p.status = 'POSTED' or (p.status = 'REVERSED' and not exists (select 1 from payment_reversals pr where pr.payment_id = p.id and pr.created_at <= ${asOfEnd}))))`,
      })
      .from(invoices)
      .innerJoin(subscribers, eq(subscribers.id, invoices.subscriberId))
      .innerJoin(
        serviceAccounts,
        eq(serviceAccounts.id, invoices.serviceAccountId),
      )
      .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
      .innerJoin(serviceTypes, eq(serviceTypes.id, servicePlans.serviceTypeId))
      .leftJoin(
        collectionAreas,
        eq(collectionAreas.id, subscribers.collectionAreaId),
      )
      .leftJoin(
        collectors,
        sql`${collectors.id} = coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId})`,
      )
      .where(
        and(
          lte(invoices.invoiceDate, query.asOf),
          lte(invoices.finalizedAt, asOfEnd),
          or(isNull(invoices.voidedAt), gt(invoices.voidedAt, asOfEnd)),
        ),
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber));

    const creditRows = await database
      .select({
        subscriberId: payments.subscriberId,
        paymentId: payments.id,
        amountCentavos: payments.amountCentavos,
        allocatedCentavos: sql<number>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa where pa.payment_id = ${payments.id} and pa.created_at <= ${asOfEnd}), 0)`,
      })
      .from(payments)
      .where(
        and(
          lte(payments.paymentDate, asOfEnd),
          or(
            eq(payments.status, 'POSTED'),
            and(
              eq(payments.status, 'REVERSED'),
              sql`not exists (select 1 from payment_reversals pr where pr.payment_id = ${payments.id} and pr.created_at <= ${asOfEnd})`,
            ),
          ),
        ),
      );
    const credits = new Map<string, number>();
    for (const payment of creditRows)
      credits.set(
        payment.subscriberId,
        (credits.get(payment.subscriberId) ?? 0) +
          Math.max(
            0,
            payment.amountCentavos - Number(payment.allocatedCentavos),
          ),
      );

    const bySubscriber = new Map<string, typeof rawInvoices>();
    for (const invoice of rawInvoices) {
      const balanceCentavos = Math.max(
        0,
        invoice.totalCentavos +
          Number(invoice.adjustments) -
          Number(invoice.allocations),
      );
      if (!balanceCentavos) continue;
      const rows = bySubscriber.get(invoice.subscriberId) ?? [];
      rows.push({ ...invoice, totalCentavos: balanceCentavos });
      bySubscriber.set(invoice.subscriberId, rows);
    }

    const adjusted = [...bySubscriber.entries()].flatMap(
      ([subscriberId, invoiceRows]) =>
        applySubscriberCredit(
          invoiceRows.map((invoice) => ({
            ...invoice,
            balanceCentavos: invoice.totalCentavos,
          })),
          credits.get(subscriberId) ?? 0,
        ).filter((invoice) => invoice.balanceCentavos > 0),
    );
    const settings = await this.readSettings(database);
    const grouped = new Map<string, typeof adjusted>();
    for (const invoice of adjusted) {
      const rows = grouped.get(invoice.serviceAccountId) ?? [];
      rows.push(invoice);
      grouped.set(invoice.serviceAccountId, rows);
    }
    const normalizedQuery = query.q?.trim().toLowerCase() ?? '';
    const settledSuspended =
      query.asOf ===
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
        ? await database
            .select({
              serviceAccountId: serviceAccounts.id,
              serviceAccountNumber: serviceAccounts.accountNumber,
              subscriberId: subscribers.id,
              subscriberAccountNumber: subscribers.accountNumber,
              subscriberName: subscribers.fullName,
              planId: servicePlans.id,
              planName: servicePlans.name,
              serviceTypeCode: serviceTypes.code,
              collectionAreaId: collectionAreas.id,
              collectionAreaName: collectionAreas.name,
              collectorId: collectors.id,
              collectorName: collectors.fullName,
              lastPaymentAt: sql<Date | null>`(select max(p.payment_date) from payments p where p.subscriber_id = ${subscribers.id} and p.status = 'POSTED')`,
            })
            .from(serviceAccounts)
            .innerJoin(
              subscribers,
              eq(subscribers.id, serviceAccounts.subscriberId),
            )
            .innerJoin(
              servicePlans,
              eq(servicePlans.id, serviceAccounts.planId),
            )
            .innerJoin(
              serviceTypes,
              eq(serviceTypes.id, servicePlans.serviceTypeId),
            )
            .leftJoin(
              collectionAreas,
              eq(collectionAreas.id, subscribers.collectionAreaId),
            )
            .leftJoin(
              collectors,
              sql`${collectors.id} = coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId})`,
            )
            .where(eq(serviceAccounts.status, 'SUSPENDED'))
        : [];
    const outstandingRows = [...grouped.values()]
      .map((invoiceRows): ReceivableDetailDto => {
        const first = invoiceRows[0]!;
        const overdue = invoiceRows.filter(
          (invoice) => daysPastDue(invoice.dueDate, query.asOf) > 0,
        );
        const oldest = overdue[0] ?? first;
        const currentCentavos = invoiceRows
          .filter((invoice) => daysPastDue(invoice.dueDate, query.asOf) === 0)
          .reduce((total, invoice) => total + invoice.balanceCentavos, 0);
        const totalArrearsCentavos = overdue.reduce(
          (total, invoice) => total + invoice.balanceCentavos,
          0,
        );
        const suspensionCandidate =
          overdue.length > 0 &&
          isSuspensionCandidate(oldest.dueDate, query.asOf, settings);
        const agingCentavos = agingTotals(invoiceRows, query.asOf);
        return {
          serviceAccountId: first.serviceAccountId,
          serviceAccountNumber: first.serviceAccountNumber,
          serviceStatus: first.serviceStatus,
          subscriberId: first.subscriberId,
          subscriberAccountNumber: first.subscriberAccountNumber,
          subscriberName: first.subscriberName,
          planId: first.planId,
          planName: first.planName,
          serviceTypeCode:
            first.serviceTypeCode as ReceivableDetailDto['serviceTypeCode'],
          collectionAreaId: first.collectionAreaId,
          collectionAreaName: first.collectionAreaName,
          collectorId: first.collectorId,
          collectorName: first.collectorName,
          monthsUnpaid: overdue.length,
          oldestUnpaidInvoice: oldest.invoiceNumber,
          oldestUnpaidInvoiceId: oldest.invoiceId,
          oldestDueDate: oldest.dueDate,
          lastPaymentAt: first.lastPaymentAt
            ? new Date(first.lastPaymentAt).toISOString()
            : null,
          currentCentavos,
          totalArrearsCentavos,
          totalOutstandingCentavos: currentCentavos + totalArrearsCentavos,
          agingCentavos,
          oldestAgingBucket: agingBucket(oldest.dueDate, query.asOf),
          followUp:
            overdue.length > 0 &&
            daysPastDue(oldest.dueDate, query.asOf) > settings.gracePeriodDays,
          suspensionCandidate,
        };
      })
      .filter(
        (row) =>
          (!normalizedQuery ||
            [
              row.subscriberName,
              row.subscriberAccountNumber,
              row.serviceAccountNumber,
            ].some((value) => value.toLowerCase().includes(normalizedQuery))) &&
          (!query.collectorId || row.collectorId === query.collectorId) &&
          (!query.areaId || row.collectionAreaId === query.areaId) &&
          (!query.planId || row.planId === query.planId) &&
          (!query.serviceTypeCode ||
            row.serviceTypeCode === query.serviceTypeCode) &&
          (!query.agingBucket || row.oldestAgingBucket === query.agingBucket),
      );
    const existing = new Set(grouped.keys());
    const zeros: ReceivableDetailDto[] = settledSuspended
      .filter((row) => !existing.has(row.serviceAccountId))
      .map((row) => ({
        serviceAccountId: row.serviceAccountId,
        serviceAccountNumber: row.serviceAccountNumber,
        serviceStatus: 'SUSPENDED' as const,
        subscriberId: row.subscriberId,
        subscriberAccountNumber: row.subscriberAccountNumber,
        subscriberName: row.subscriberName,
        planId: row.planId,
        planName: row.planName,
        serviceTypeCode:
          row.serviceTypeCode as ReceivableDetailDto['serviceTypeCode'],
        collectionAreaId: row.collectionAreaId,
        collectionAreaName: row.collectionAreaName,
        collectorId: row.collectorId,
        collectorName: row.collectorName,
        monthsUnpaid: 0,
        oldestUnpaidInvoice: 'No unpaid invoice',
        oldestDueDate: query.asOf,
        lastPaymentAt: row.lastPaymentAt
          ? new Date(row.lastPaymentAt).toISOString()
          : null,
        currentCentavos: 0,
        totalArrearsCentavos: 0,
        totalOutstandingCentavos: 0,
        agingCentavos: {
          CURRENT: 0,
          '1_30': 0,
          '31_60': 0,
          '61_90': 0,
          '90_PLUS': 0,
        },
        oldestAgingBucket: 'CURRENT' as const,
        followUp: false,
        suspensionCandidate: false,
      }))
      .filter(
        (row) =>
          (!normalizedQuery ||
            [
              row.subscriberName,
              row.subscriberAccountNumber,
              row.serviceAccountNumber,
            ].some((value) => value.toLowerCase().includes(normalizedQuery))) &&
          (!query.collectorId || row.collectorId === query.collectorId) &&
          (!query.areaId || row.collectionAreaId === query.areaId) &&
          (!query.planId || row.planId === query.planId) &&
          (!query.serviceTypeCode ||
            row.serviceTypeCode === query.serviceTypeCode) &&
          (!query.agingBucket || query.agingBucket === 'CURRENT'),
      );
    return orderReceivablesForFollowUp([...outstandingRows, ...zeros]).sort(
      (left, right) =>
        Number(
          right.serviceStatus === 'SUSPENDED' &&
            right.totalArrearsCentavos === 0,
        ) -
        Number(
          left.serviceStatus === 'SUSPENDED' && left.totalArrearsCentavos === 0,
        ),
    );
  }

  private async readSettings(
    database: Pick<Database, 'select'>,
  ): Promise<DelinquencySettingsDto> {
    const [settings] = await database
      .select()
      .from(delinquencySettings)
      .where(eq(delinquencySettings.id, 1));
    return settings
      ? {
          gracePeriodDays: settings.gracePeriodDays,
          suspensionThresholdDays: settings.suspensionThresholdDays,
          reconnectionFeeCentavos: settings.reconnectionFeeCentavos,
        }
      : {
          gracePeriodDays: 7,
          suspensionThresholdDays: 60,
          reconnectionFeeCentavos: 0,
        };
  }

  private async lockService(id: string, transaction: Transaction) {
    const [account] = await transaction
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id))
      .for('update');
    if (!account) throw new ReceivableError(404, 'Service account not found.');
    return account;
  }

  private async postReconnectionFee(
    record: typeof reconnectionRecords.$inferSelect,
    completionDate: string,
    actorUserId: string,
    transaction: Transaction,
  ) {
    const [invoice] = await transaction
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.serviceAccountId, record.serviceAccountId),
          sql`${invoices.status} <> 'DRAFT'`,
          or(isNull(invoices.voidedAt), gt(invoices.voidedAt, new Date())),
        ),
      )
      .orderBy(desc(invoices.invoiceDate))
      .limit(1)
      .for('update');
    if (!invoice)
      throw new ReceivableError(
        409,
        'A finalized invoice is required to post the reconnection fee.',
      );
    const reason = `Reconnection fee: ${record.reason}`;
    const [adjustment] = await transaction
      .insert(adjustments)
      .values({
        invoiceId: invoice.id,
        amountCentavos: record.feeCentavos,
        reason,
        actorUserId,
      })
      .returning();
    if (!adjustment) throw new Error('Reconnection fee insert failed.');
    await transaction.insert(ledgerEntries).values({
      subscriberId: invoice.subscriberId,
      adjustmentId: adjustment.id,
      entryType: 'ADJUSTMENT_DEBIT',
      reference: invoice.invoiceNumber,
      description: reason,
      debitCentavos: record.feeCentavos,
      occurredAt: new Date(`${completionDate}T12:00:00.000Z`),
    });
    await transaction
      .update(invoices)
      .set({
        status: invoice.dueDate < completionDate ? 'OVERDUE' : 'UNPAID',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));
  }
}
