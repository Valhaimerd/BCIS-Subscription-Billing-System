import {
  adjustments,
  billingCycles,
  collectionAreas,
  collectors,
  createDatabaseConnection,
  invoiceItems,
  invoices,
  ledgerEntries,
  payments,
  reconnectionRecords,
  serviceAccounts,
  servicePlans,
  subscribers,
  suspensionRecords,
  users,
} from '@bcis/database';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

import { PaymentService } from './payments.js';
import { ReceivableError, ReceivableService } from './receivables.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);
const receivables = new ReceivableService(database.db);
const paymentService = new PaymentService(
  database.db,
  resolve(
    import.meta.dirname,
    '../../../',
    process.env.ATTACHMENT_DIRECTORY ?? './storage/attachments',
  ),
);
const asOf = '2026-10-31';

try {
  const details = await receivables.list({
    q: '',
    asOf,
    page: 1,
    pageSize: 100,
  });
  const summary = await receivables.summary(asOf);
  const detailCurrent = details.items.reduce(
    (total, row) => total + row.currentCentavos,
    0,
  );
  const detailOverdue = details.items.reduce(
    (total, row) => total + row.totalArrearsCentavos,
    0,
  );
  if (
    detailCurrent !== summary.currentCentavos ||
    detailOverdue !== summary.overdueCentavos ||
    summary.totalCentavos !== detailCurrent + detailOverdue
  )
    throw new Error('Receivable summary does not reconcile to detail.');

  const agingServiceNumbers = new Set(
    Array.from(
      { length: 12 },
      (_, index) => `SVC-${String(index + 51).padStart(5, '0')}-1`,
    ),
  );
  const seeded = details.items.filter((row) =>
    agingServiceNumbers.has(row.serviceAccountNumber),
  );
  const overdueSeeds = seeded.filter((row) => row.totalArrearsCentavos > 0);
  const overdueBuckets = new Set(
    overdueSeeds.map((row) => row.oldestAgingBucket),
  );
  if (
    overdueSeeds.length < 10 ||
    !['1_30', '31_60', '61_90', '90_PLUS'].every((bucket) =>
      overdueBuckets.has(bucket as never),
    )
  )
    throw new Error('Task 7 does not contain ten overdue aging seeds.');

  const seededServiceIds = seeded.map((row) => row.serviceAccountId);
  const seededInvoiceTotals = seededServiceIds.length
    ? await database.db
        .select({
          value: sql<number>`coalesce(sum(${invoices.totalCentavos}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            inArray(invoices.serviceAccountId, seededServiceIds),
            lte(invoices.invoiceDate, asOf),
          ),
        )
    : [];
  const seededDetailTotal = seeded.reduce(
    (total, row) => total + row.totalOutstandingCentavos,
    0,
  );
  if (seededDetailTotal !== Number(seededInvoiceTotals[0]?.value ?? 0))
    throw new Error('Seeded AR does not reconcile to invoice balances.');

  const completedScenarios = await database.db
    .select({ value: sql<number>`count(*)` })
    .from(reconnectionRecords)
    .where(eq(reconnectionRecords.status, 'COMPLETED'));
  if (Number(completedScenarios[0]?.value ?? 0) < 2)
    throw new Error('Two completed service-control scenarios are required.');

  const currentSeed = seeded.find((row) => row.oldestAgingBucket === 'CURRENT');
  if (!currentSeed) throw new Error('Current aging seed missing.');
  let invalidTransitionRejected = false;
  try {
    const [actor] = await database.db
      .select({ id: users.id })
      .from(users)
      .limit(1);
    if (!actor) throw new Error('Seed actor missing.');
    await receivables.suspend(
      currentSeed.serviceAccountId,
      {
        reason: 'Should not suspend a current account.',
        effectiveDate: asOf,
      },
      actor.id,
    );
  } catch (error) {
    invalidTransitionRejected =
      error instanceof ReceivableError && error.statusCode === 409;
  }
  if (!invalidTransitionRejected)
    throw new Error('A non-delinquent service was suspended.');

  const [[actor], [plan], [area], [collector]] = await Promise.all([
    database.db.select({ id: users.id }).from(users).limit(1),
    database.db.select().from(servicePlans).limit(1),
    database.db.select().from(collectionAreas).limit(1),
    database.db.select().from(collectors).limit(1),
  ]);
  if (!actor || !plan || !area || !collector)
    throw new Error('Task 7 control-flow references are missing.');
  const [subscriber] = await database.db
    .insert(subscribers)
    .values({
      accountNumber: 'T7-CONTROL-001',
      fullName: 'Leandro Mendoza',
      collectionAreaId: area.id,
      assignedCollectorId: collector.id,
      notes: 'Account used for suspension and reconnection verification.',
    })
    .onConflictDoUpdate({
      target: subscribers.accountNumber,
      set: {
        fullName: 'Leandro Mendoza',
        notes: 'Account used for suspension and reconnection verification.',
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!subscriber) throw new Error('Task 7 control subscriber missing.');
  const [service] = await database.db
    .insert(serviceAccounts)
    .values({
      accountNumber: 'T7-CONTROL-SVC',
      subscriberId: subscriber.id,
      planId: plan.id,
      assignedCollectorId: collector.id,
      currentRateCentavos: 10_000,
      billingDay: 1,
      dueDay: 15,
      billingStartDate: '2026-01-01',
      activationDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
    })
    .onConflictDoUpdate({
      target: serviceAccounts.accountNumber,
      set: { updatedAt: new Date() },
    })
    .returning();
  if (!service) throw new Error('Task 7 control service missing.');
  const [cycle] = await database.db
    .insert(billingCycles)
    .values({
      periodYear: 2026,
      periodMonth: 6,
      status: 'FINALIZED',
      createdByUserId: actor.id,
      finalizedAt: new Date('2026-06-01T00:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: [billingCycles.periodYear, billingCycles.periodMonth],
      set: { status: 'FINALIZED' },
    })
    .returning();
  if (!cycle) throw new Error('Task 7 control cycle missing.');
  const [invoice] = await database.db
    .insert(invoices)
    .values({
      invoiceNumber: 'T7-CONTROL-INVOICE',
      billingCycleId: cycle.id,
      subscriberId: subscriber.id,
      serviceAccountId: service.id,
      serviceAccountNumber: service.accountNumber,
      planName: plan.name,
      billingPeriodLabel: 'June 2026',
      invoiceDate: '2026-06-01',
      dueDate: '2026-06-15',
      subtotalCentavos: 10_000,
      totalCentavos: 10_000,
      status: 'OVERDUE',
      finalizedAt: new Date('2026-06-01T00:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: invoices.invoiceNumber,
      set: { billingPeriodLabel: 'June 2026', updatedAt: new Date() },
    })
    .returning();
  if (!invoice) throw new Error('Task 7 control invoice missing.');
  const [item] = await database.db
    .select({ id: invoiceItems.id })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .limit(1);
  if (!item)
    await database.db.insert(invoiceItems).values({
      invoiceId: invoice.id,
      type: 'SUBSCRIPTION',
      description: `${plan.name} monthly subscription`,
      amountCentavos: 10_000,
    });
  else
    await database.db
      .update(invoiceItems)
      .set({ description: `${plan.name} monthly subscription` })
      .where(eq(invoiceItems.id, item.id));
  await database.db
    .insert(ledgerEntries)
    .values({
      subscriberId: subscriber.id,
      invoiceId: invoice.id,
      entryType: 'INVOICE_DEBIT',
      reference: invoice.invoiceNumber,
      description: `${plan.name} monthly subscription`,
      debitCentavos: 10_000,
      occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    })
    .onConflictDoNothing();

  let history = await receivables.serviceControlHistory(service.id);
  const completed = history.reconnections.find(
    (record) => record.status === 'COMPLETED',
  );
  if (!completed) {
    if (history.status === 'ACTIVE')
      await receivables.suspend(
        service.id,
        {
          reason: 'Account exceeded the suspension threshold.',
          effectiveDate: asOf,
        },
        actor.id,
      );
    const [posted] = await database.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.subscriberId, subscriber.id),
          eq(payments.notes, 'TASK7-CONTROL-PAYMENT'),
        ),
      )
      .limit(1);
    if (!posted)
      await paymentService.create(
        {
          subscriberId: subscriber.id,
          amountCentavos: 10_000,
          method: 'CASH',
          paymentDate: `${asOf}T10:00:00.000Z`,
          notes: 'TASK7-CONTROL-PAYMENT',
        },
        actor.id,
      );
    const request = await receivables.requestReconnection(
      service.id,
      {
        reason: 'Qualifying payment confirmed.',
        requestDate: asOf,
        technician: 'Daniel Bautista',
      },
      actor.id,
    );
    await receivables.completeReconnection(
      request.id,
      { completionDate: asOf },
      actor.id,
    );
    history = await receivables.serviceControlHistory(service.id);
  }
  if (
    history.status !== 'ACTIVE' ||
    !history.suspensions.length ||
    !history.reconnections.some((record) => record.status === 'COMPLETED') ||
    history.events.filter((event) =>
      ['SUSPENDED', 'ACTIVE'].includes(event.newStatus),
    ).length < 2
  )
    throw new Error('Suspension/reconnection history is incomplete.');
  await database.db
    .update(suspensionRecords)
    .set({ reason: 'Account exceeded the suspension threshold.' })
    .where(eq(suspensionRecords.serviceAccountId, service.id));
  await database.db
    .update(reconnectionRecords)
    .set({
      reason: 'Qualifying payment confirmed.',
      technician: 'Daniel Bautista',
    })
    .where(eq(reconnectionRecords.serviceAccountId, service.id));
  await database.db
    .update(adjustments)
    .set({ reason: 'Reconnection fee: Qualifying payment confirmed.' })
    .where(
      and(
        eq(adjustments.invoiceId, invoice.id),
        eq(
          adjustments.reason,
          'Reconnection fee: Task 7 qualifying payment confirmed.',
        ),
      ),
    );
  const [fee] = await database.db
    .select({ amount: adjustments.amountCentavos })
    .from(adjustments)
    .where(
      and(
        eq(adjustments.invoiceId, invoice.id),
        eq(
          adjustments.reason,
          'Reconnection fee: Qualifying payment confirmed.',
        ),
      ),
    );
  if (fee?.amount !== 50_000)
    throw new Error('The configured reconnection fee was not posted.');

  const beforePayment = await receivables.list({
    q: 'T7-CONTROL-001',
    asOf: '2026-10-30',
    page: 1,
    pageSize: 20,
  });
  if (beforePayment.items[0]?.totalArrearsCentavos !== 10_000)
    throw new Error(
      'Historical asOf incorrectly includes later payment or reconnection fee.',
    );

  process.stdout.write(
    'Task 7 live checks passed: aging seeds, boundary aggregates, historical asOf, invoice reconciliation, transition rejection, and complete suspension/reconnection with fee.\n',
  );
} finally {
  await database.close();
}
