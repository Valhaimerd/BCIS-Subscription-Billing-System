import type {
  BillingCycleDto,
  BillingEligibilityDto,
  InvoiceDetailDto,
  InvoiceSummaryDto,
  LedgerEntryDto,
  Paginated,
} from '@bcis/contracts';
import {
  adjustments,
  auditLogs,
  billingCycles,
  invoiceItems,
  invoices,
  ledgerEntries,
  paymentAllocations,
  payments,
  receipts,
  serviceAccounts,
  servicePlans,
  subscribers,
  type DatabaseConnection,
} from '@bcis/database';
import { and, asc, count, desc, eq, ilike, lte, or, sql } from 'drizzle-orm';

import {
  billingPeriod,
  finalizedInvoiceStatus,
  invoiceTotal,
  withRunningBalances,
} from './billing-rules.js';

type Database = DatabaseConnection['db'];

export class BillingError extends Error {
  constructor(
    public readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export class BillingService {
  constructor(private readonly db: Database) {}

  async eligibility(input: {
    periodYear: number;
    periodMonth: number;
  }): Promise<BillingEligibilityDto> {
    const period = billingPeriod(input.periodYear, input.periodMonth, 1);
    const [cycle] = await this.db
      .select()
      .from(billingCycles)
      .where(
        and(
          eq(billingCycles.periodYear, input.periodYear),
          eq(billingCycles.periodMonth, input.periodMonth),
        ),
      );
    const rows = await this.db
      .select({
        status: serviceAccounts.status,
        billingStartDate: serviceAccounts.billingStartDate,
        rate: serviceAccounts.currentRateCentavos,
        invoiceId: invoices.id,
      })
      .from(serviceAccounts)
      .leftJoin(
        invoices,
        and(
          eq(invoices.serviceAccountId, serviceAccounts.id),
          cycle ? eq(invoices.billingCycleId, cycle.id) : sql`false`,
        ),
      );
    const eligible = rows.filter(
      (row) =>
        row.status === 'ACTIVE' && row.billingStartDate <= period.lastDate,
    );
    const remaining = eligible.filter((row) => !row.invoiceId);
    return {
      ...input,
      eligibleServices: eligible.length,
      existingInvoices: eligible.length - remaining.length,
      remainingServices: remaining.length,
      estimatedNewCentavos: remaining.reduce((sum, row) => sum + row.rate, 0),
      inactiveServices: rows.filter((row) => row.status !== 'ACTIVE').length,
      futureStartServices: rows.filter(
        (row) =>
          row.status === 'ACTIVE' && row.billingStartDate > period.lastDate,
      ).length,
      cycleStatus: cycle?.status ?? 'NOT_STARTED',
    };
  }

  async generateDrafts(
    input: { periodYear: number; periodMonth: number },
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const [cycle] = await transaction
        .insert(billingCycles)
        .values({ ...input, createdByUserId: actorUserId })
        .onConflictDoUpdate({
          target: [billingCycles.periodYear, billingCycles.periodMonth],
          set: { updatedAt: new Date() },
        })
        .returning();
      if (!cycle) throw new Error('Billing cycle insert failed.');
      if (cycle.status === 'FINALIZED')
        return { cycleId: cycle.id, created: 0, skipped: 0 };

      const period = billingPeriod(input.periodYear, input.periodMonth, 1);
      const eligible = await transaction
        .select({ account: serviceAccounts, planName: servicePlans.name })
        .from(serviceAccounts)
        .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
        .where(
          and(
            eq(serviceAccounts.status, 'ACTIVE'),
            lte(serviceAccounts.billingStartDate, period.lastDate),
          ),
        );
      let created = 0;
      for (const { account, planName } of eligible) {
        const sequence = await transaction.execute<{ value: string }>(
          sql`select nextval('invoice_number_sequence')::text as value`,
        );
        const sequenceValue = sequence.rows[0]?.value;
        if (!sequenceValue) throw new Error('Invoice number sequence failed.');
        const totalCentavos = invoiceTotal([account.currentRateCentavos]);
        const [invoice] = await transaction
          .insert(invoices)
          .values({
            invoiceNumber: `INV-${input.periodYear}${String(input.periodMonth).padStart(2, '0')}-${sequenceValue.padStart(6, '0')}`,
            billingCycleId: cycle.id,
            subscriberId: account.subscriberId,
            serviceAccountId: account.id,
            serviceAccountNumber: account.accountNumber,
            planName,
            billingPeriodLabel: period.label,
            invoiceDate: period.firstDate,
            dueDate: billingPeriod(
              input.periodYear,
              input.periodMonth,
              account.dueDay,
            ).dueDate,
            subtotalCentavos: totalCentavos,
            totalCentavos,
          })
          .onConflictDoNothing({
            target: [invoices.serviceAccountId, invoices.billingCycleId],
          })
          .returning();
        if (!invoice) continue;
        await transaction.insert(invoiceItems).values({
          invoiceId: invoice.id,
          type: 'SUBSCRIPTION',
          description: `${period.label} ${planName} subscription`,
          amountCentavos: account.currentRateCentavos,
        });
        created += 1;
      }
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'BILLING_DRAFTS_GENERATED',
        entityType: 'billing_cycle',
        entityId: cycle.id,
        newValues: { ...input, created, eligible: eligible.length },
      });
      return {
        cycleId: cycle.id,
        created,
        skipped: eligible.length - created,
      };
    });
  }

  async finalizeCycle(id: string, actorUserId: string) {
    return this.db.transaction(async (transaction) => {
      const [cycle] = await transaction
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.id, id))
        .for('update');
      if (!cycle) throw new BillingError(404, 'Billing cycle not found.');
      if (cycle.status === 'FINALIZED') return { finalized: 0 };
      const drafts = await transaction
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.billingCycleId, id), eq(invoices.status, 'DRAFT')),
        );
      if (!drafts.length)
        throw new BillingError(409, 'There are no draft invoices to finalize.');
      const finalizedAt = new Date();
      for (const invoice of drafts) {
        await transaction.insert(ledgerEntries).values({
          subscriberId: invoice.subscriberId,
          invoiceId: invoice.id,
          entryType: 'INVOICE_DEBIT',
          reference: invoice.invoiceNumber,
          description: `${invoice.billingPeriodLabel} ${invoice.planName}`,
          debitCentavos: invoice.totalCentavos,
          occurredAt: new Date(`${invoice.invoiceDate}T00:00:00.000Z`),
        });
        await transaction
          .update(invoices)
          .set({
            status: finalizedInvoiceStatus(invoice.dueDate, today()),
            finalizedAt,
            updatedAt: finalizedAt,
          })
          .where(eq(invoices.id, invoice.id));
      }
      await transaction
        .update(billingCycles)
        .set({ status: 'FINALIZED', finalizedAt, updatedAt: finalizedAt })
        .where(eq(billingCycles.id, id));
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'BILLING_CYCLE_FINALIZED',
        entityType: 'billing_cycle',
        entityId: id,
        newValues: { finalizedInvoices: drafts.length },
      });
      return { finalized: drafts.length };
    });
  }

  async listCycles(): Promise<BillingCycleDto[]> {
    const rows = await this.db
      .select({
        cycle: billingCycles,
        invoiceCount: count(invoices.id),
        totalCentavos: sql<number>`coalesce(sum(${invoices.totalCentavos}), 0)`,
      })
      .from(billingCycles)
      .leftJoin(invoices, eq(invoices.billingCycleId, billingCycles.id))
      .groupBy(billingCycles.id)
      .orderBy(desc(billingCycles.periodYear), desc(billingCycles.periodMonth));
    return rows.map(({ cycle, invoiceCount, totalCentavos }) => ({
      id: cycle.id,
      periodYear: cycle.periodYear,
      periodMonth: cycle.periodMonth,
      status: cycle.status,
      invoiceCount,
      totalCentavos: Number(totalCentavos),
      finalizedAt: cycle.finalizedAt?.toISOString() ?? null,
    }));
  }

  async listInvoices(query: {
    q: string;
    page: number;
    pageSize: number;
    status?: InvoiceSummaryDto['status'] | undefined;
    subscriberId?: string | undefined;
    billingCycleId?: string | undefined;
  }): Promise<Paginated<InvoiceSummaryDto>> {
    const term = `%${query.q}%`;
    const where = and(
      query.status ? eq(invoices.status, query.status) : undefined,
      query.subscriberId
        ? eq(invoices.subscriberId, query.subscriberId)
        : undefined,
      query.billingCycleId
        ? eq(invoices.billingCycleId, query.billingCycleId)
        : undefined,
      query.q
        ? or(
            ilike(invoices.invoiceNumber, term),
            ilike(invoices.serviceAccountNumber, term),
            ilike(subscribers.accountNumber, term),
            ilike(subscribers.fullName, term),
          )
        : undefined,
    );
    const countRows = await this.db
      .select({ value: count() })
      .from(invoices)
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .where(where);
    const rows = await this.db
      .select({ invoice: invoices, subscriber: subscribers })
      .from(invoices)
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .where(where)
      .orderBy(desc(invoices.invoiceDate), desc(invoices.invoiceNumber))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: await Promise.all(
        rows.map(({ invoice, subscriber }) =>
          this.summary(invoice, subscriber.fullName, subscriber.accountNumber),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: countRows[0]?.value ?? 0,
    };
  }

  async invoice(id: string): Promise<InvoiceDetailDto> {
    const [row] = await this.db
      .select({ invoice: invoices, subscriber: subscribers })
      .from(invoices)
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .where(eq(invoices.id, id));
    if (!row) throw new BillingError(404, 'Invoice not found.');
    const [summary, items, adjustmentRows, allocationRows] = await Promise.all([
      this.summary(
        row.invoice,
        row.subscriber.fullName,
        row.subscriber.accountNumber,
      ),
      this.db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(asc(invoiceItems.createdAt)),
      this.db
        .select()
        .from(adjustments)
        .where(eq(adjustments.invoiceId, id))
        .orderBy(asc(adjustments.createdAt)),
      this.db
        .select({
          allocation: paymentAllocations,
          paymentDate: payments.paymentDate,
          paymentStatus: payments.status,
          receiptNumber: receipts.receiptNumber,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
        .leftJoin(receipts, eq(receipts.paymentId, payments.id))
        .where(eq(paymentAllocations.invoiceId, id))
        .orderBy(asc(paymentAllocations.createdAt)),
    ]);
    return {
      ...summary,
      invoiceDate: row.invoice.invoiceDate,
      finalizedAt: row.invoice.finalizedAt?.toISOString() ?? null,
      voidedAt: row.invoice.voidedAt?.toISOString() ?? null,
      voidReason: row.invoice.voidReason,
      items: items.map(({ id: itemId, type, description, amountCentavos }) => ({
        id: itemId,
        type,
        description,
        amountCentavos,
      })),
      adjustments: adjustmentRows.map(
        ({ id: adjustmentId, amountCentavos, reason, createdAt }) => ({
          id: adjustmentId,
          amountCentavos,
          reason,
          createdAt: createdAt.toISOString(),
        }),
      ),
      allocations: allocationRows.map(
        ({ allocation, paymentDate, paymentStatus, receiptNumber }) => ({
          id: allocation.id,
          amountCentavos: allocation.amountCentavos,
          paymentDate: paymentDate.toISOString(),
          receiptNumber,
          status: paymentStatus,
        }),
      ),
    };
  }

  async addAdjustment(
    id: string,
    input: { amountCentavos: number; reason: string },
    actorUserId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const [invoice] = await transaction
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));
      if (!invoice) throw new BillingError(404, 'Invoice not found.');
      if (invoice.status === 'DRAFT' || invoice.status === 'VOID')
        throw new BillingError(
          409,
          'Only finalized, non-void invoices may be adjusted.',
        );
      const [adjustment] = await transaction
        .insert(adjustments)
        .values({ invoiceId: id, ...input, actorUserId })
        .returning();
      if (!adjustment) throw new Error('Adjustment insert failed.');
      await transaction.insert(ledgerEntries).values({
        subscriberId: invoice.subscriberId,
        adjustmentId: adjustment.id,
        entryType:
          input.amountCentavos > 0 ? 'ADJUSTMENT_DEBIT' : 'ADJUSTMENT_CREDIT',
        reference: invoice.invoiceNumber,
        description: input.reason,
        debitCentavos: Math.max(input.amountCentavos, 0),
        creditCentavos: Math.max(-input.amountCentavos, 0),
      });
      const totalAdjustments = await this.adjustmentTotal(id, transaction);
      if (invoice.totalCentavos + totalAdjustments <= 0)
        await transaction
          .update(invoices)
          .set({ status: 'CREDITED', updatedAt: new Date() })
          .where(eq(invoices.id, id));
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'INVOICE_ADJUSTED',
        entityType: 'invoice',
        entityId: id,
        reason: input.reason,
        newValues: { amountCentavos: input.amountCentavos },
      });
      return { id: adjustment.id };
    });
  }

  async voidInvoice(id: string, reason: string, actorUserId: string) {
    return this.db.transaction(async (transaction) => {
      const [invoice] = await transaction
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));
      if (!invoice) throw new BillingError(404, 'Invoice not found.');
      if (invoice.status === 'DRAFT' || invoice.status === 'VOID')
        throw new BillingError(409, 'This invoice cannot be voided.');
      const balance =
        invoice.totalCentavos +
        (await this.adjustmentTotal(id, transaction)) -
        (await this.allocationTotal(id, transaction));
      if (balance > 0)
        await transaction.insert(ledgerEntries).values({
          subscriberId: invoice.subscriberId,
          invoiceId: id,
          entryType: 'INVOICE_VOID',
          reference: invoice.invoiceNumber,
          description: `Void: ${reason}`,
          creditCentavos: balance,
        });
      const now = new Date();
      await transaction
        .update(invoices)
        .set({
          status: 'VOID',
          voidedAt: now,
          voidReason: reason,
          updatedAt: now,
        })
        .where(eq(invoices.id, id));
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'INVOICE_VOIDED',
        entityType: 'invoice',
        entityId: id,
        reason,
        oldValues: { status: invoice.status },
        newValues: { status: 'VOID' },
      });
      return { id, status: 'VOID' as const };
    });
  }

  async ledger(
    subscriberId: string,
    query: { from?: string | undefined; to?: string | undefined },
  ): Promise<LedgerEntryDto[]> {
    const [subscriber] = await this.db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId));
    if (!subscriber) throw new BillingError(404, 'Subscriber not found.');
    const upper = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.subscriberId, subscriberId),
          upper ? lte(ledgerEntries.occurredAt, upper) : undefined,
        ),
      )
      .orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id));
    const lower = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : undefined;
    return withRunningBalances(rows).flatMap((entry) => {
      if (lower && entry.occurredAt < lower) return [];
      return [
        {
          id: entry.id,
          invoiceId: entry.invoiceId,
          paymentId: entry.paymentId,
          occurredAt: entry.occurredAt.toISOString(),
          reference: entry.reference,
          description: entry.description,
          debitCentavos: entry.debitCentavos,
          creditCentavos: entry.creditCentavos,
          balanceCentavos: entry.balanceCentavos,
        },
      ];
    });
  }

  private async summary(
    invoice: typeof invoices.$inferSelect,
    subscriberName: string,
    subscriberAccountNumber: string,
  ): Promise<InvoiceSummaryDto> {
    const adjustmentCentavos = await this.adjustmentTotal(invoice.id, this.db);
    const allocatedCentavos = await this.allocationTotal(invoice.id, this.db);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      subscriberId: invoice.subscriberId,
      subscriberName,
      subscriberAccountNumber,
      serviceAccountNumber: invoice.serviceAccountNumber,
      planName: invoice.planName,
      billingPeriodLabel: invoice.billingPeriodLabel,
      dueDate: invoice.dueDate,
      totalCentavos: invoice.totalCentavos,
      adjustmentCentavos,
      balanceCentavos:
        invoice.status === 'VOID'
          ? 0
          : invoice.totalCentavos + adjustmentCentavos - allocatedCentavos,
      status: invoice.status,
    };
  }

  private async adjustmentTotal(
    invoiceId: string,
    database: Pick<Database, 'select'>,
  ) {
    const [row] = await database
      .select({
        total: sql<number>`coalesce(sum(${adjustments.amountCentavos}), 0)`,
      })
      .from(adjustments)
      .where(eq(adjustments.invoiceId, invoiceId));
    return Number(row?.total ?? 0);
  }

  private async allocationTotal(
    invoiceId: string,
    database: Pick<Database, 'select'>,
  ) {
    const [row] = await database
      .select({
        total: sql<number>`coalesce(sum(${paymentAllocations.amountCentavos}), 0)`,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(
        and(
          eq(paymentAllocations.invoiceId, invoiceId),
          eq(payments.status, 'POSTED'),
        ),
      );
    return Number(row?.total ?? 0);
  }
}
