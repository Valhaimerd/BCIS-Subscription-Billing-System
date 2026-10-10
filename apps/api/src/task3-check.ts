import {
  collectionAreas,
  collectors,
  createDatabaseConnection,
  serviceAccounts,
  servicePlans,
  subscribers,
} from '@bcis/database';
import { count, eq } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);

try {
  const tableCounts = Object.fromEntries(
    await Promise.all(
      [
        ['subscribers', subscribers, 50],
        ['service accounts', serviceAccounts, 60],
        ['plans', servicePlans, 7],
        ['collectors', collectors, 2],
        ['areas', collectionAreas, 3],
      ].map(async ([label, table, minimum]) => {
        const [row] = await database.db
          .select({ value: count() })
          .from(table as typeof subscribers);
        if (!row || row.value < Number(minimum))
          throw new Error(`${label} seed minimum was not met.`);
        return [label, row.value];
      }),
    ),
  );

  const [sample] = await database.db.select().from(serviceAccounts).limit(1);
  if (!sample) throw new Error('A sample service account is required.');
  const originalRate = sample.currentRateCentavos;
  await database.db
    .transaction(async (transaction) => {
      await transaction
        .update(servicePlans)
        .set({ priceCentavos: originalRate + 12_345 })
        .where(eq(servicePlans.id, sample.planId));
      const [unchanged] = await transaction
        .select()
        .from(serviceAccounts)
        .where(eq(serviceAccounts.id, sample.id));
      if (unchanged?.currentRateCentavos !== originalRate)
        throw new Error(
          'A plan change rewrote a historical service-account rate.',
        );
      throw new Error('EXPECTED_ROLLBACK');
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== 'EXPECTED_ROLLBACK')
        throw error;
    });

  const [sampleSubscriber] = await database.db
    .select()
    .from(subscribers)
    .limit(1);
  if (!sampleSubscriber) throw new Error('A sample subscriber is required.');
  let duplicateRejected = false;
  try {
    await database.db.insert(subscribers).values({
      accountNumber: sampleSubscriber.accountNumber,
      fullName: 'Duplicate constraint check',
    });
  } catch (error) {
    const cause =
      error instanceof Error && 'cause' in error ? error.cause : error;
    duplicateRejected =
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === '23505';
  }
  if (!duplicateRejected)
    throw new Error('Duplicate subscriber numbers were not rejected.');

  process.stdout.write(
    `Task 3 live checks passed: ${JSON.stringify(tableCounts)}; uniqueness and historical rate preserved.\n`,
  );
} finally {
  await database.close();
}
