import {
  createDatabaseConnection,
  ledgerEntries,
  payments,
} from '@bcis/database';
import ExcelJS from 'exceljs';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ReceivableService } from './receivables.js';
import { MasterDataService } from './master-data.js';
import { ReportService } from './reports.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);
const receivables = new ReceivableService(database.db);
const reports = new ReportService(database.db, receivables);
const filters = {
  from: '2026-08-01',
  to: '2026-10-31',
  asOf: '2026-10-31',
  granularity: 'MONTHLY' as const,
  dimension: 'PLAN' as const,
};

try {
  const [ledgerOwner] = await database.db
    .select({ subscriberId: ledgerEntries.subscriberId })
    .from(ledgerEntries)
    .where(
      and(
        gte(
          ledgerEntries.occurredAt,
          new Date(`${filters.from}T00:00:00.000Z`),
        ),
        lte(ledgerEntries.occurredAt, new Date(`${filters.to}T23:59:59.999Z`)),
      ),
    )
    .groupBy(ledgerEntries.subscriberId)
    .orderBy(sql`count(*) asc`)
    .limit(1);
  if (!ledgerOwner) throw new Error('A subscriber ledger is required.');

  const dashboard = await reports.dashboard(filters);
  const activity = await new MasterDataService(database.db).activity(
    ledgerOwner.subscriberId,
    { page: 1, pageSize: 100 },
    [
      'subscriber.view',
      'service.view',
      'billing.view',
      'payment.view',
      'collection.view',
    ],
  );
  const activityAllowedKeys = [
    'id',
    'occurredAt',
    'category',
    'label',
    'reference',
    'status',
    'amountCentavos',
    'reason',
  ].sort();
  if (
    activity.items.some(
      (item) =>
        JSON.stringify(Object.keys(item).sort()) !==
        JSON.stringify(activityAllowedKeys),
    ) ||
    activity.items.some(
      (item, index) =>
        index > 0 && item.occurredAt > activity.items[index - 1]!.occurredAt,
    ) ||
    activity.items.length > activity.pageSize
  )
    throw new Error(
      'Subscriber activity is not bounded, ordered, or redacted.',
    );

  const aging = await receivables.summary(filters.asOf);
  if (
    dashboard.currentReceivableCentavos !== aging.currentCentavos ||
    dashboard.overdueReceivableCentavos !== aging.overdueCentavos ||
    dashboard.overdueSubscribers !== aging.overdueSubscribers
  )
    throw new Error('Dashboard AR does not reconcile to receivables.');
  const trendPeriods = dashboard.monthlyTrend.map((point) => point.period);
  if (
    new Set(trendPeriods).size !== trendPeriods.length ||
    trendPeriods.some(
      (period, index) => index > 0 && period < trendPeriods[index - 1]!,
    ) ||
    dashboard.monthlyTrend.some((point) =>
      [
        point.billedCentavos,
        point.collectedCentavos,
        point.differenceCentavos,
      ].some((amount) => !Number.isSafeInteger(amount)),
    )
  )
    throw new Error(
      'Dashboard monthly trend is not unique, ordered, and centavo-safe.',
    );

  const collection = await reports.report('COLLECTIONS', {
    ...filters,
    q: '',
    page: 1,
    pageSize: 1,
  });
  const [paymentTotal] = await database.db
    .select({
      amount: sql<number>`coalesce(sum(${payments.amountCentavos}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'POSTED'),
        gte(payments.paymentDate, new Date(`${filters.from}T00:00:00.000Z`)),
        lte(payments.paymentDate, new Date(`${filters.to}T23:59:59.999Z`)),
      ),
    );
  if (collection.totals.amountCentavos !== Number(paymentTotal?.amount ?? 0))
    throw new Error('Collection report does not reconcile to posted payments.');

  const empty = await reports.report('COLLECTIONS', {
    ...filters,
    from: '2000-01-01',
    to: '2000-01-31',
    asOf: '2000-01-31',
    q: '',
    page: 1,
    pageSize: 20,
  });
  if (empty.total !== 0 || empty.totals.amountCentavos !== 0)
    throw new Error('Empty report range is not represented correctly.');

  const outputDirectory = resolve(
    import.meta.dirname,
    '../../../reports-samples',
  );
  await mkdir(outputDirectory, { recursive: true });
  const samples = [
    ['COLLECTIONS', 'monthly-collection', {}],
    ['AR_AGING', 'ar-aging', {}],
    [
      'SUBSCRIBER_SOA',
      'subscriber-soa',
      { subscriberId: ledgerOwner.subscriberId },
    ],
    [
      'COLLECTOR_PERFORMANCE',
      'collector-performance',
      { from: '2099-01-01', to: '2199-12-31', asOf: '2199-12-31' },
    ],
  ] as const;
  for (const [kind, stem, extra] of samples) {
    for (const format of ['pdf', 'xlsx'] as const) {
      const exported = await reports.export(
        kind,
        { ...filters, ...extra },
        format,
      );
      const buffer = Buffer.from(exported.dataBase64, 'base64');
      if (format === 'pdf') {
        if (
          !buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
          !buffer.subarray(-1024).includes(Buffer.from('%%EOF'))
        )
          throw new Error(`${kind} PDF is not structurally complete.`);
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
        const sheet = workbook.getWorksheet('Report');
        if (!sheet || sheet.rowCount < 5)
          throw new Error(`${kind} XLSX cannot be inspected.`);
        if (kind === 'COLLECTIONS' && sheet.rowCount < collection.total + 5)
          throw new Error('XLSX export was incorrectly limited by pagination.');
      }
      await writeFile(resolve(outputDirectory, `${stem}.${format}`), buffer);
    }
  }

  process.stdout.write(
    'Task 8 live checks passed: dashboard/AR and monthly trend checks, subscriber activity bounds/redaction, collection reconciliation, empty range, pagination-independent exports, and eight inspected PDF/XLSX samples.\n',
  );
} finally {
  await database.close();
}
