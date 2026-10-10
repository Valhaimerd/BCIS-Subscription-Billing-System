import {
  billingCycles,
  createDatabaseConnection,
  invoiceItems,
  invoices,
  ledgerEntries,
  serviceAccounts,
  users,
} from '@bcis/database';
import { and, count, countDistinct, eq, lte, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

import { BillingService } from './billing.js';
import { billingPeriod } from './billing-rules.js';
import { MasterDataService } from './master-data.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);
const billing = new BillingService(database.db);
const masterData = new MasterDataService(database.db);
const period = { periodYear: 2027, periodMonth: 10 };

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

try {
  const [actor] = await database.db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  if (!actor) throw new Error('A seeded user is required.');

  const periodEnd = billingPeriod(
    period.periodYear,
    period.periodMonth,
    1,
  ).lastDate;
  const [eligibleRow] = await database.db
    .select({ value: count() })
    .from(serviceAccounts)
    .where(
      and(
        eq(serviceAccounts.status, 'ACTIVE'),
        lte(serviceAccounts.billingStartDate, periodEnd),
      ),
    );
  const eligible = eligibleRow?.value ?? 0;
  if (eligible === 0)
    throw new Error('An eligible service account is required.');

  // Two callers intentionally request the same period at the same time.
  await Promise.all([
    billing.generateDrafts(period, actor.id),
    billing.generateDrafts(period, actor.id),
  ]);
  const [cycle] = await database.db
    .select()
    .from(billingCycles)
    .where(
      and(
        eq(billingCycles.periodYear, period.periodYear),
        eq(billingCycles.periodMonth, period.periodMonth),
      ),
    );
  if (!cycle) throw new Error('The billing cycle was not created.');

  const [afterConcurrent] = await database.db
    .select({
      count: count(),
      services: countDistinct(invoices.serviceAccountId),
    })
    .from(invoices)
    .where(eq(invoices.billingCycleId, cycle.id));
  if (
    !afterConcurrent ||
    afterConcurrent.count !== eligible ||
    afterConcurrent.services !== eligible
  )
    throw new Error(
      'Concurrent billing created missing or duplicate invoices.',
    );

  await billing.generateDrafts(period, actor.id);
  const [afterRepeat] = await database.db
    .select({ value: count() })
    .from(invoices)
    .where(eq(invoices.billingCycleId, cycle.id));
  if (afterRepeat?.value !== eligible)
    throw new Error(
      'AT-11 failed: repeated billing changed the invoice count.',
    );

  const [snapshotMismatch] = await database.db
    .select({ value: count() })
    .from(invoices)
    .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .innerJoin(
      serviceAccounts,
      eq(serviceAccounts.id, invoices.serviceAccountId),
    )
    .where(
      and(
        eq(invoices.billingCycleId, cycle.id),
        sql`${invoiceItems.amountCentavos} <> ${invoices.totalCentavos}`,
      ),
    );
  if ((snapshotMismatch?.value ?? 0) !== 0)
    throw new Error('An invoice total does not match its frozen line item.');

  await billing.finalizeCycle(cycle.id, actor.id);
  await billing.finalizeCycle(cycle.id, actor.id);
  const [reconciliation] = await database.db
    .select({
      invoices: countDistinct(invoices.id),
      ledgerDebits: countDistinct(ledgerEntries.id),
      invoiceTotal: sql<number>`coalesce(sum(${invoices.totalCentavos}), 0)`,
      ledgerTotal: sql<number>`coalesce(sum(${ledgerEntries.debitCentavos}), 0)`,
    })
    .from(invoices)
    .leftJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.invoiceId, invoices.id),
        eq(ledgerEntries.entryType, 'INVOICE_DEBIT'),
      ),
    )
    .where(eq(invoices.billingCycleId, cycle.id));
  if (
    !reconciliation ||
    reconciliation.invoices !== eligible ||
    reconciliation.ledgerDebits !== eligible ||
    Number(reconciliation.invoiceTotal) !== Number(reconciliation.ledgerTotal)
  )
    throw new Error('Finalized invoices and ledger debits do not reconcile.');

  const [sample] = await database.db
    .select()
    .from(invoices)
    .where(eq(invoices.billingCycleId, cycle.id))
    .limit(1);
  if (!sample) throw new Error('A generated invoice is required.');
  let rollbackRejected = false;
  try {
    await database.db.transaction(async (transaction) => {
      await transaction
        .update(invoices)
        .set({ totalCentavos: sample.totalCentavos + 1 })
        .where(eq(invoices.id, sample.id));
      await transaction.insert(ledgerEntries).values({
        subscriberId: sample.subscriberId,
        invoiceId: sample.id,
        entryType: 'INVOICE_DEBIT',
        reference: sample.invoiceNumber,
        description: 'Intentional rollback check',
        debitCentavos: 1,
      });
    });
  } catch (error) {
    rollbackRejected = isUniqueViolation(error);
  }
  const [afterRollback] = await database.db
    .select({ totalCentavos: invoices.totalCentavos })
    .from(invoices)
    .where(eq(invoices.id, sample.id));
  if (
    !rollbackRejected ||
    afterRollback?.totalCentavos !== sample.totalCentavos
  )
    throw new Error('The failed financial write did not roll back atomically.');

  const search = await billing.listInvoices({
    q: sample.invoiceNumber,
    page: 1,
    pageSize: 20,
  });
  if (search.total !== 1 || search.items[0]?.id !== sample.id)
    throw new Error('Invoice-number search did not return the exact invoice.');
  const subscriberSearch = await masterData.listSubscribers({
    q: sample.invoiceNumber,
    page: 1,
    pageSize: 20,
  });
  if (
    subscriberSearch.total !== 1 ||
    subscriberSearch.items[0]?.id !== sample.subscriberId
  )
    throw new Error('Subscriber search did not resolve the invoice number.');
  const statement = await billing.ledger(sample.subscriberId, {});
  if (!statement.some((entry) => entry.reference === sample.invoiceNumber))
    throw new Error('The subscriber ledger is missing the finalized invoice.');

  let duplicateRejected = false;
  try {
    await database.db.insert(invoices).values({
      ...sample,
      id: undefined,
      invoiceNumber: `${sample.invoiceNumber}-BYPASS`,
      createdAt: undefined,
      updatedAt: undefined,
    });
  } catch (error) {
    duplicateRejected = isUniqueViolation(error);
  }
  if (!duplicateRejected)
    throw new Error(
      'The database did not reject a duplicate service-period invoice.',
    );

  process.stdout.write(
    `Task 4 live checks passed: AT-11, ${eligible} invoices, rollback, matching ledger debits, search, and SOA.\n`,
  );
} finally {
  await database.close();
}
