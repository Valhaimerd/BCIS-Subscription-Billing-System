import type {
  CollectionBatchDetailDto,
  CollectionBatchSummaryDto,
  Paginated,
} from '@bcis/contracts';
import {
  auditLogs,
  batchAccounts,
  collectionAreas,
  collectionBatches,
  collectorAreaAssignments,
  collectorRemittances,
  collectors,
  payments,
  serviceAccounts,
  subscriberAddresses,
  subscribers,
  type DatabaseConnection,
} from '@bcis/database';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';

import { canTransition, collectionTotals } from './collection-rules.js';

type Database = DatabaseConnection['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type BatchStatus = typeof collectionBatches.$inferSelect.status;

export class CollectionError extends Error {
  constructor(
    public readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function isUniqueViolation(error: unknown) {
  const cause =
    error instanceof Error && 'cause' in error ? error.cause : error;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505'
  );
}

export class CollectionService {
  constructor(private readonly db: Database) {}

  async create(
    input: { collectorId: string; collectionAreaId: string; batchDate: string },
    actorUserId: string,
  ) {
    try {
      return await this.db.transaction(async (transaction) => {
        const [assignment] = await transaction
          .select()
          .from(collectorAreaAssignments)
          .where(
            and(
              eq(collectorAreaAssignments.collectorId, input.collectorId),
              eq(
                collectorAreaAssignments.collectionAreaId,
                input.collectionAreaId,
              ),
            ),
          );
        if (!assignment)
          throw new CollectionError(
            409,
            'The collector is not assigned to this collection area.',
          );

        const [batch] = await transaction
          .insert(collectionBatches)
          .values({ ...input, createdByUserId: actorUserId })
          .returning();
        if (!batch) throw new Error('Collection batch insert failed.');

        const firstOfMonth = `${input.batchDate.slice(0, 7)}-01`;
        const routeRows = await transaction
          .select({
            subscriberId: subscribers.id,
            subscriberAccountNumber: subscribers.accountNumber,
            subscriberName: subscribers.fullName,
            serviceAccountId: serviceAccounts.id,
            serviceAccountNumber: serviceAccounts.accountNumber,
            routeAddress: sql<string>`coalesce(${subscriberAddresses.addressLine}, (select sa.address_line from subscriber_addresses sa where sa.subscriber_id = ${subscribers.id} order by sa.is_primary desc, sa.created_at asc limit 1), 'Address not recorded')`,
            currentBillCentavos: sql<number>`coalesce((select sum(greatest(i.total_centavos + coalesce((select sum(a.amount_centavos) from adjustments a where a.invoice_id = i.id), 0) - coalesce((select sum(pa.amount_centavos) from payment_allocations pa join payments p on p.id = pa.payment_id where pa.invoice_id = i.id and p.status = 'POSTED'), 0), 0)) from invoices i where i.service_account_id = ${serviceAccounts.id} and i.status not in ('DRAFT', 'VOID', 'CREDITED', 'PAID') and i.invoice_date >= ${firstOfMonth} and i.invoice_date <= ${input.batchDate}), 0)`,
            arrearsCentavos: sql<number>`coalesce((select sum(greatest(i.total_centavos + coalesce((select sum(a.amount_centavos) from adjustments a where a.invoice_id = i.id), 0) - coalesce((select sum(pa.amount_centavos) from payment_allocations pa join payments p on p.id = pa.payment_id where pa.invoice_id = i.id and p.status = 'POSTED'), 0), 0)) from invoices i where i.service_account_id = ${serviceAccounts.id} and i.status not in ('DRAFT', 'VOID', 'CREDITED', 'PAID') and i.invoice_date < ${firstOfMonth}), 0)`,
          })
          .from(serviceAccounts)
          .innerJoin(
            subscribers,
            eq(subscribers.id, serviceAccounts.subscriberId),
          )
          .leftJoin(
            subscriberAddresses,
            eq(subscriberAddresses.id, serviceAccounts.installationAddressId),
          )
          .where(
            and(
              eq(serviceAccounts.status, 'ACTIVE'),
              eq(subscribers.status, 'ACTIVE'),
              eq(subscribers.collectionAreaId, input.collectionAreaId),
              sql`coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId}) = ${input.collectorId}`,
            ),
          )
          .orderBy(
            asc(subscribers.accountNumber),
            asc(serviceAccounts.accountNumber),
          );

        if (routeRows.length)
          await transaction.insert(batchAccounts).values(
            routeRows.map((row) => ({
              ...row,
              batchId: batch.id,
              currentBillCentavos: Number(row.currentBillCentavos),
              arrearsCentavos: Number(row.arrearsCentavos),
              totalDueCentavos:
                Number(row.currentBillCentavos) + Number(row.arrearsCentavos),
            })),
          );
        await transaction.insert(auditLogs).values({
          actorUserId,
          action: 'COLLECTION_BATCH_CREATED',
          entityType: 'collection_batch',
          entityId: batch.id,
          newValues: { ...input, accountCount: routeRows.length },
        });
        return this.detail(batch.id, transaction);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new CollectionError(
          409,
          'A batch already exists for this collector, area, and date.',
        );
      throw error;
    }
  }

  async list(query: {
    q: string;
    page: number;
    pageSize: number;
    status?: BatchStatus | undefined;
  }): Promise<Paginated<CollectionBatchSummaryDto>> {
    const term = `%${query.q}%`;
    const where = and(
      query.status ? eq(collectionBatches.status, query.status) : undefined,
      query.q
        ? or(
            ilike(collectors.fullName, term),
            ilike(collectionAreas.name, term),
          )
        : undefined,
    );
    const [totalRows, rows] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(collectionBatches)
        .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
        .innerJoin(
          collectionAreas,
          eq(collectionAreas.id, collectionBatches.collectionAreaId),
        )
        .where(where),
      this.db
        .select({ id: collectionBatches.id })
        .from(collectionBatches)
        .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
        .innerJoin(
          collectionAreas,
          eq(collectionAreas.id, collectionBatches.collectionAreaId),
        )
        .where(where)
        .orderBy(
          desc(collectionBatches.batchDate),
          desc(collectionBatches.createdAt),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ]);
    return {
      items: await Promise.all(rows.map(({ id }) => this.summary(id, this.db))),
      page: query.page,
      pageSize: query.pageSize,
      total: totalRows[0]?.value ?? 0,
    };
  }

  async get(id: string) {
    return this.detail(id, this.db);
  }

  async start(id: string, actorUserId: string) {
    return this.move(id, 'IN_PROGRESS', actorUserId);
  }

  async submit(id: string, actorUserId: string) {
    return this.db.transaction(async (transaction) => {
      await this.lockAndRequire(id, 'IN_PROGRESS', transaction);
      const [pending] = await transaction
        .select({ value: count() })
        .from(payments)
        .innerJoin(batchAccounts, eq(batchAccounts.id, payments.batchAccountId))
        .where(
          and(
            eq(batchAccounts.batchId, id),
            eq(payments.status, 'PENDING_VERIFICATION'),
          ),
        );
      if ((pending?.value ?? 0) > 0)
        throw new CollectionError(
          409,
          'Resolve pending GCash proofs before submitting the batch.',
        );
      await this.updateStatus(id, 'SUBMITTED', actorUserId, transaction);
      return this.detail(id, transaction);
    });
  }

  async remit(
    id: string,
    input: { amountCentavos: number; notes?: string | undefined },
    actorUserId: string,
  ) {
    try {
      return await this.db.transaction(async (transaction) => {
        await this.lockAndRequire(id, 'SUBMITTED', transaction);
        await transaction.insert(collectorRemittances).values({
          batchId: id,
          ...input,
          recordedByUserId: actorUserId,
        });
        await this.updateStatus(id, 'REMITTED', actorUserId, transaction);
        return this.detail(id, transaction);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new CollectionError(409, 'This batch already has a remittance.');
      throw error;
    }
  }

  async reconcile(
    id: string,
    expectedDifferenceCentavos: number,
    actorUserId: string,
  ) {
    return this.confirmDifference(
      id,
      'REMITTED',
      'RECONCILED',
      expectedDifferenceCentavos,
      actorUserId,
    );
  }

  async close(
    id: string,
    expectedDifferenceCentavos: number,
    actorUserId: string,
  ) {
    return this.confirmDifference(
      id,
      'RECONCILED',
      'CLOSED',
      expectedDifferenceCentavos,
      actorUserId,
    );
  }

  private async confirmDifference(
    id: string,
    from: BatchStatus,
    to: BatchStatus,
    expectedDifferenceCentavos: number,
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      await this.lockAndRequire(id, from, transaction);
      const before = await this.detail(id, transaction);
      if (before.differenceCentavos !== expectedDifferenceCentavos)
        throw new CollectionError(
          409,
          'The remittance difference changed. Review and confirm the current value.',
        );
      await this.updateStatus(id, to, actorUserId, transaction, {
        differenceCentavos: before.differenceCentavos,
      });
      return this.detail(id, transaction);
    });
  }

  private async move(
    id: string,
    to: BatchStatus,
    actorUserId: string,
    supplied?: Transaction,
  ) {
    const operation = async (transaction: Transaction) => {
      const batch = await this.lock(id, transaction);
      if (!canTransition(batch.status, to))
        throw new CollectionError(
          409,
          `A ${batch.status} batch cannot move to ${to}.`,
        );
      await this.updateStatus(id, to, actorUserId, transaction);
      return this.detail(id, transaction);
    };
    return supplied ? operation(supplied) : this.db.transaction(operation);
  }

  private async lockAndRequire(
    id: string,
    expected: BatchStatus,
    transaction: Transaction,
  ) {
    const batch = await this.lock(id, transaction);
    if (batch.status !== expected)
      throw new CollectionError(
        409,
        `This action requires a ${expected} batch.`,
      );
    return batch;
  }

  private async lock(id: string, transaction: Transaction) {
    const [batch] = await transaction
      .select()
      .from(collectionBatches)
      .where(eq(collectionBatches.id, id))
      .for('update');
    if (!batch) throw new CollectionError(404, 'Collection batch not found.');
    return batch;
  }

  private async updateStatus(
    id: string,
    status: BatchStatus,
    actorUserId: string,
    transaction: Transaction,
    evidence?: { differenceCentavos: number },
  ) {
    const now = new Date();
    const times = {
      IN_PROGRESS: { startedAt: now },
      SUBMITTED: { submittedAt: now },
      REMITTED: { remittedAt: now },
      RECONCILED: { reconciledAt: now, reconciledByUserId: actorUserId },
      CLOSED: { closedAt: now },
    }[status as Exclude<BatchStatus, 'OPEN'>];
    await transaction
      .update(collectionBatches)
      .set({ status, updatedAt: now, ...times })
      .where(eq(collectionBatches.id, id));
    await transaction.insert(auditLogs).values({
      actorUserId,
      action: `COLLECTION_BATCH_${status}`,
      entityType: 'collection_batch',
      entityId: id,
      newValues: { status, ...evidence },
    });
  }

  private async detail(
    id: string,
    database: Pick<Database, 'select'>,
  ): Promise<CollectionBatchDetailDto> {
    const summary = await this.summary(id, database);
    const rows = await database
      .select({ account: batchAccounts, payment: payments })
      .from(batchAccounts)
      .leftJoin(
        payments,
        and(
          eq(payments.batchAccountId, batchAccounts.id),
          inArray(payments.status, ['PENDING_VERIFICATION', 'POSTED']),
        ),
      )
      .where(eq(batchAccounts.batchId, id))
      .orderBy(
        asc(batchAccounts.subscriberAccountNumber),
        asc(batchAccounts.serviceAccountNumber),
      );
    return {
      ...summary,
      accounts: rows.map(({ account, payment }) => ({
        id: account.id,
        subscriberId: account.subscriberId,
        subscriberAccountNumber: account.subscriberAccountNumber,
        subscriberName: account.subscriberName,
        serviceAccountNumber: account.serviceAccountNumber,
        routeAddress: account.routeAddress,
        currentBillCentavos: account.currentBillCentavos,
        arrearsCentavos: account.arrearsCentavos,
        totalDueCentavos: account.totalDueCentavos,
        paymentId: payment?.id ?? null,
        paymentMethod: payment?.method ?? null,
        paymentAmountCentavos:
          payment?.status === 'POSTED' ? payment.amountCentavos : 0,
      })),
    };
  }

  private async summary(
    id: string,
    database: Pick<Database, 'select'>,
  ): Promise<CollectionBatchSummaryDto> {
    const [row] = await database
      .select({
        batch: collectionBatches,
        collectorName: collectors.fullName,
        areaName: collectionAreas.name,
        accountCount: sql<number>`(select count(*) from batch_accounts ba where ba.batch_id = ${collectionBatches.id})`,
        expected: sql<number>`coalesce((select sum(ba.total_due_centavos) from batch_accounts ba where ba.batch_id = ${collectionBatches.id}), 0)`,
        cash: sql<number>`coalesce((select sum(p.amount_centavos) from payments p join batch_accounts ba on ba.id = p.batch_account_id where ba.batch_id = ${collectionBatches.id} and p.status = 'POSTED' and p.method = 'CASH'), 0)`,
        nonCash: sql<number>`coalesce((select sum(p.amount_centavos) from payments p join batch_accounts ba on ba.id = p.batch_account_id where ba.batch_id = ${collectionBatches.id} and p.status = 'POSTED' and p.method <> 'CASH'), 0)`,
        covered: sql<number>`coalesce((select sum(least(ba.total_due_centavos, coalesce((select p.amount_centavos from payments p where p.batch_account_id = ba.id and p.status = 'POSTED'), 0))) from batch_accounts ba where ba.batch_id = ${collectionBatches.id}), 0)`,
        remitted: sql<number>`coalesce((select cr.amount_centavos from collector_remittances cr where cr.batch_id = ${collectionBatches.id}), 0)`,
      })
      .from(collectionBatches)
      .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .innerJoin(
        collectionAreas,
        eq(collectionAreas.id, collectionBatches.collectionAreaId),
      )
      .where(eq(collectionBatches.id, id));
    if (!row) throw new CollectionError(404, 'Collection batch not found.');
    return {
      id: row.batch.id,
      collectorId: row.batch.collectorId,
      collectorName: row.collectorName,
      collectionAreaId: row.batch.collectionAreaId,
      collectionAreaName: row.areaName,
      batchDate: row.batch.batchDate,
      status: row.batch.status,
      accountCount: Number(row.accountCount),
      ...collectionTotals(
        Number(row.expected),
        Number(row.cash),
        Number(row.nonCash),
        Number(row.remitted),
        Number(row.covered),
      ),
    };
  }
}
