import { createDatabaseConnection } from '@bcis/database';
import { sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const database = createDatabaseConnection(databaseUrl);
const evidenceDirectory = resolve(
  import.meta.dirname,
  '../../../evidence/task10',
);

type ScalarRow = { value: string | number };

async function scalar(query: ReturnType<typeof sql>) {
  const result = await database.db.execute<ScalarRow>(query);
  return Number(result.rows[0]?.value ?? 0);
}

try {
  const metrics = {
    users: await scalar(sql`select count(*) as value from users`),
    representedRoles: await scalar(sql`
      select count(distinct r.code) as value
      from users u
      join user_roles ur on ur.user_id = u.id
      join roles r on r.id = ur.role_id
    `),
    plans: await scalar(sql`select count(*) as value from service_plans`),
    internetPlans: await scalar(sql`
      select count(*) as value from service_plans p
      join service_types t on t.id = p.service_type_id
      where t.code = 'INTERNET'
    `),
    cablePlans: await scalar(sql`
      select count(*) as value from service_plans p
      join service_types t on t.id = p.service_type_id
      where t.code = 'CABLE'
    `),
    comboPlans: await scalar(sql`
      select count(*) as value from service_plans p
      join service_types t on t.id = p.service_type_id
      where t.code = 'COMBO'
    `),
    subscribers: await scalar(sql`select count(*) as value from subscribers`),
    services: await scalar(sql`select count(*) as value from service_accounts`),
    collectors: await scalar(sql`select count(*) as value from collectors`),
    areas: await scalar(sql`select count(*) as value from collection_areas`),
    billingMonths: await scalar(sql`
      select count(distinct (period_year, period_month)) as value
      from billing_cycles
      where status = 'FINALIZED'
    `),
    cashPayments: await scalar(sql`
      select count(*) as value from payments
      where method = 'CASH' and status in ('POSTED', 'REVERSED')
    `),
    gcashPayments: await scalar(sql`
      select count(*) as value from payments
      where method = 'GCASH' and status in ('POSTED', 'REVERSED')
    `),
    acceptancePaymentCases: await scalar(sql`
      select count(*) as value from payments
      where notes in ('TASK5-AT01', 'TASK5-AT02', 'TASK5-AT03', 'TASK5-AT04')
    `),
    overdueAccounts: await scalar(sql`
      select count(distinct subscriber_id) as value from invoices
      where status = 'OVERDUE'
    `),
    reversals: await scalar(
      sql`select count(*) as value from payment_reversals`,
    ),
    suspensions: await scalar(
      sql`select count(*) as value from suspension_records`,
    ),
    completedReconnections: await scalar(sql`
      select count(*) as value from reconnection_records
      where status = 'COMPLETED'
    `),
  };

  const requirements = [
    ['users', metrics.users, 5],
    ['represented roles', metrics.representedRoles, 4],
    ['plans', metrics.plans, 7],
    ['Internet plans', metrics.internetPlans, 3],
    ['Cable plans', metrics.cablePlans, 2],
    ['Combo plans', metrics.comboPlans, 2],
    ['subscribers', metrics.subscribers, 50],
    ['service accounts', metrics.services, 60],
    ['collectors', metrics.collectors, 2],
    ['collection areas', metrics.areas, 3],
    ['finalized billing months', metrics.billingMonths, 3],
    ['Cash payments', metrics.cashPayments, 1],
    ['GCash payments', metrics.gcashPayments, 1],
    [
      'exact/partial/advance/oldest-first cases',
      metrics.acceptancePaymentCases,
      4,
    ],
    ['overdue accounts', metrics.overdueAccounts, 10],
    ['payment reversals', metrics.reversals, 1],
    ['suspensions', metrics.suspensions, 2],
    ['completed reconnections', metrics.completedReconnections, 2],
  ].map(([name, actual, minimum]) => ({
    name: String(name),
    actual: Number(actual),
    minimum: Number(minimum),
    passed: Number(actual) >= Number(minimum),
  }));

  const reconciliation = {
    postedPaymentLedgerMismatches: await scalar(sql`
      select count(*) as value
      from payments p
      left join ledger_entries l
        on l.payment_id = p.id and l.entry_type = 'PAYMENT_CREDIT'
      where p.status = 'POSTED'
      group by p.id, p.amount_centavos
      having coalesce(sum(l.credit_centavos), 0) <> p.amount_centavos
    `),
    paymentOverallocations: await scalar(sql`
      select count(*) as value
      from payments p
      left join payment_allocations a on a.payment_id = p.id
      group by p.id, p.amount_centavos
      having coalesce(sum(a.amount_centavos), 0) > p.amount_centavos
    `),
    reversalLedgerMismatches: await scalar(sql`
      select count(*) as value
      from payments p
      join payment_reversals r on r.payment_id = p.id
      left join ledger_entries l on l.payment_id = p.id
      group by p.id, p.amount_centavos
      having coalesce(sum(l.credit_centavos), 0) <> p.amount_centavos
         or coalesce(sum(l.debit_centavos), 0) <> p.amount_centavos
    `),
    duplicateInvoiceGroups: await scalar(sql`
      select count(*) as value from (
        select service_account_id, billing_cycle_id
        from invoices
        group by service_account_id, billing_cycle_id
        having count(*) > 1
      ) duplicates
    `),
    duplicateReceiptGroups: await scalar(sql`
      select count(*) as value from (
        select receipt_number from receipts
        group by receipt_number having count(*) > 1
      ) duplicates
    `),
    duplicateGcashGroups: await scalar(sql`
      select count(*) as value from (
        select reference_number from payments
        where method = 'GCASH' and reference_number is not null
        group by reference_number having count(*) > 1
      ) duplicates
    `),
  };

  const reconciliationChecks = Object.entries(reconciliation).map(
    ([name, actual]) => ({ name, actual, expected: 0, passed: actual === 0 }),
  );
  const passed =
    requirements.every((item) => item.passed) &&
    reconciliationChecks.every((item) => item.passed);
  const result = {
    checkedAt: new Date().toISOString(),
    passed,
    dataset: { metrics, requirements },
    financialReconciliation: reconciliationChecks,
  };

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'dataset-and-reconciliation.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  if (!passed) {
    const failed = [...requirements, ...reconciliationChecks]
      .filter((item) => !item.passed)
      .map((item) => item.name)
      .join(', ');
    throw new Error(`Task 10 audit failed: ${failed}`);
  }
  process.stdout.write(
    `Task 10 dataset and reconciliation audit passed: ${requirements.length} dataset requirements and ${reconciliationChecks.length} financial guards.\n`,
  );
} finally {
  await database.close();
}
