import {
  batchAccounts,
  collectionBatches,
  collectorAreaAssignments,
  collectorRemittances,
  createDatabaseConnection,
  payments,
  serviceAccounts,
  subscriberAddresses,
  subscribers,
  users,
} from '@bcis/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

import { CollectionError, CollectionService } from './collections.js';
import { PaymentError, PaymentService } from './payments.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);
const collections = new CollectionService(database.db);
const paymentsService = new PaymentService(
  database.db,
  resolve(
    import.meta.dirname,
    '../../../',
    process.env.ATTACHMENT_DIRECTORY ?? './storage/attachments',
  ),
);

try {
  const [[actor], [route]] = await Promise.all([
    database.db.select({ id: users.id }).from(users).limit(1),
    database.db
      .select({
        collectorId: collectorAreaAssignments.collectorId,
        collectionAreaId: collectorAreaAssignments.collectionAreaId,
      })
      .from(collectorAreaAssignments)
      .innerJoin(
        subscribers,
        eq(
          subscribers.collectionAreaId,
          collectorAreaAssignments.collectionAreaId,
        ),
      )
      .innerJoin(
        serviceAccounts,
        eq(serviceAccounts.subscriberId, subscribers.id),
      )
      .where(
        and(
          eq(serviceAccounts.status, 'ACTIVE'),
          eq(subscribers.status, 'ACTIVE'),
          sql`coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId}) = ${collectorAreaAssignments.collectorId}`,
        ),
      )
      .limit(1),
  ]);
  if (!actor || !route)
    throw new Error('Seeded user and collector route data are required.');
  const actorId = actor.id;
  const collectorId = route.collectorId;
  const collectionAreaId = route.collectionAreaId;

  async function ensureBatch(batchDate: string) {
    const [existing] = await database.db
      .select({ id: collectionBatches.id })
      .from(collectionBatches)
      .where(
        and(
          eq(collectionBatches.collectorId, collectorId),
          eq(collectionBatches.collectionAreaId, collectionAreaId),
          eq(collectionBatches.batchDate, batchDate),
        ),
      );
    return existing
      ? collections.get(existing.id)
      : collections.create(
          { collectorId, collectionAreaId, batchDate },
          actorId,
        );
  }

  let balanced = await ensureBatch('2099-10-07');
  if (!balanced.accounts.length)
    throw new Error('The balanced acceptance batch has no route accounts.');

  // A route sheet remains frozen when the source address changes.
  const frozen = balanced.accounts[0]!;
  const [source] = await database.db
    .select({ address: subscriberAddresses })
    .from(subscriberAddresses)
    .where(eq(subscriberAddresses.subscriberId, frozen.subscriberId))
    .limit(1);
  if (!source) throw new Error('The acceptance route needs a source address.');
  try {
    await database.db
      .update(subscriberAddresses)
      .set({ addressLine: 'Temporary Task 6 snapshot check' })
      .where(eq(subscriberAddresses.id, source.address.id));
    const afterEdit = await collections.get(balanced.id);
    if (afterEdit.accounts[0]?.routeAddress !== frozen.routeAddress)
      throw new Error('Issued route-sheet snapshots changed with master data.');
  } finally {
    await database.db
      .update(subscriberAddresses)
      .set({ addressLine: source.address.addressLine })
      .where(eq(subscriberAddresses.id, source.address.id));
  }

  if (balanced.status === 'OPEN') {
    let transitionRejected = false;
    try {
      await collections.submit(balanced.id, actor.id);
    } catch (error) {
      transitionRejected =
        error instanceof CollectionError && error.statusCode === 409;
    }
    if (!transitionRejected)
      throw new Error('Invalid batch state transition was accepted.');
    balanced = await collections.start(balanced.id, actor.id);
  }
  const balancedAccount = balanced.accounts[0]!;
  if (!balancedAccount.paymentId && balanced.status === 'IN_PROGRESS')
    await paymentsService.create(
      {
        subscriberId: balancedAccount.subscriberId,
        batchAccountId: balancedAccount.id,
        amountCentavos: 2_000_000,
        method: 'CASH',
        notes: 'TASK6-AT07',
      },
      actor.id,
    );
  balanced = await collections.get(balanced.id);
  if (balanced.status === 'IN_PROGRESS')
    balanced = await collections.submit(balanced.id, actor.id);
  if (balanced.status === 'SUBMITTED')
    balanced = await collections.remit(
      balanced.id,
      { amountCentavos: 2_000_000, notes: 'TASK6-AT07 balanced remittance' },
      actor.id,
    );
  if (
    balanced.cashCollectedCentavos !== 2_000_000 ||
    balanced.remittedCashCentavos !== 2_000_000 ||
    balanced.differenceCentavos !== 0
  )
    throw new Error('AT-07 balanced remittance totals are incorrect.');
  if (balanced.status === 'REMITTED')
    balanced = await collections.reconcile(balanced.id, 0, actor.id);
  if (balanced.status === 'RECONCILED')
    balanced = await collections.close(balanced.id, 0, actor.id);
  if (balanced.status !== 'CLOSED')
    throw new Error('AT-07 batch did not close after reconciliation.');

  const closedPayment = balanced.accounts.find((account) => account.paymentId);
  if (!closedPayment?.paymentId)
    throw new Error('AT-07 closed batch has no linked payment.');
  let closedReversalRejected = false;
  try {
    await paymentsService.reverse(
      closedPayment.paymentId,
      'TASK6 closed-batch guard',
      actor.id,
    );
  } catch (error) {
    closedReversalRejected =
      error instanceof PaymentError && error.statusCode === 409;
  }
  if (!closedReversalRejected)
    throw new Error('A closed batch payment was allowed to change.');

  // A failed multi-write operation leaves the original remittance untouched.
  const [beforeRollback] = await database.db
    .select()
    .from(collectorRemittances)
    .where(eq(collectorRemittances.batchId, balanced.id));
  let rollbackRejected = false;
  try {
    await database.db.transaction(async (transaction) => {
      await transaction
        .update(collectorRemittances)
        .set({ amountCentavos: 1 })
        .where(eq(collectorRemittances.batchId, balanced.id));
      await transaction.insert(collectorRemittances).values({
        batchId: balanced.id,
        amountCentavos: 1,
        recordedByUserId: actor.id,
      });
    });
  } catch {
    rollbackRejected = true;
  }
  const [afterRollback] = await database.db
    .select()
    .from(collectorRemittances)
    .where(eq(collectorRemittances.batchId, balanced.id));
  if (
    !rollbackRejected ||
    afterRollback?.amountCentavos !== beforeRollback?.amountCentavos
  )
    throw new Error('Remittance transaction rollback failed.');

  let shortage = await ensureBatch('2099-10-08');
  if (!shortage.accounts.length)
    throw new Error('The shortage acceptance batch has no route accounts.');
  if (shortage.status === 'OPEN')
    shortage = await collections.start(shortage.id, actor.id);
  const shortageAccount = shortage.accounts[0]!;
  if (!shortageAccount.paymentId && shortage.status === 'IN_PROGRESS')
    await paymentsService.create(
      {
        subscriberId: shortageAccount.subscriberId,
        batchAccountId: shortageAccount.id,
        amountCentavos: 2_000_000,
        method: 'CASH',
        notes: 'TASK6-AT08',
      },
      actor.id,
    );
  shortage = await collections.get(shortage.id);
  if (shortage.status === 'IN_PROGRESS')
    shortage = await collections.submit(shortage.id, actor.id);
  if (shortage.status === 'SUBMITTED')
    shortage = await collections.remit(
      shortage.id,
      { amountCentavos: 1_950_000, notes: 'TASK6-AT08 shortage' },
      actor.id,
    );
  if (
    shortage.cashCollectedCentavos !== 2_000_000 ||
    shortage.remittedCashCentavos !== 1_950_000 ||
    shortage.differenceCentavos !== -50_000
  )
    throw new Error('AT-08 did not retain the exact visible shortage.');
  if (shortage.status === 'REMITTED') {
    let silentBalanceRejected = false;
    try {
      await collections.reconcile(shortage.id, 0, actor.id);
    } catch (error) {
      silentBalanceRejected =
        error instanceof CollectionError && error.statusCode === 409;
    }
    if (!silentBalanceRejected)
      throw new Error('AT-08 shortage was silently accepted as balanced.');
    shortage = await collections.reconcile(shortage.id, -50_000, actor.id);
  }
  if (shortage.status === 'RECONCILED')
    shortage = await collections.close(shortage.id, -50_000, actor.id);
  if (shortage.status !== 'CLOSED' || shortage.differenceCentavos !== -50_000)
    throw new Error('AT-08 explicit shortage was not preserved on closure.');

  const concurrent = await ensureBatch('2099-10-09');
  let concurrentDetail = concurrent;
  if (concurrentDetail.status === 'OPEN')
    concurrentDetail = await collections.start(concurrentDetail.id, actor.id);
  const raceAccount = concurrentDetail.accounts[0];
  if (!raceAccount) throw new Error('Concurrency batch has no account.');
  if (!raceAccount.paymentId) {
    const outcomes = await Promise.allSettled([
      paymentsService.create(
        {
          subscriberId: raceAccount.subscriberId,
          batchAccountId: raceAccount.id,
          amountCentavos: 10_000,
          method: 'CASH',
          notes: 'TASK6-CONCURRENT-A',
        },
        actor.id,
      ),
      paymentsService.create(
        {
          subscriberId: raceAccount.subscriberId,
          batchAccountId: raceAccount.id,
          amountCentavos: 10_000,
          method: 'CASH',
          notes: 'TASK6-CONCURRENT-B',
        },
        actor.id,
      ),
    ]);
    if (
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length !== 1
    )
      throw new Error('Concurrent collection double-link protection failed.');
  }
  let corrected = await collections.get(concurrentDetail.id);
  const previousPaymentId = corrected.accounts[0]?.paymentId;
  if (!previousPaymentId)
    throw new Error('The correction check needs an active payment.');
  await paymentsService.reverse(
    previousPaymentId,
    'TASK6 replacement check',
    actor.id,
  );
  await paymentsService.create(
    {
      subscriberId: raceAccount.subscriberId,
      batchAccountId: raceAccount.id,
      amountCentavos: 10_000,
      method: 'CASH',
      notes: 'TASK6 corrected replacement',
    },
    actor.id,
  );
  corrected = await collections.get(concurrentDetail.id);
  if (
    !corrected.accounts[0]?.paymentId ||
    corrected.accounts[0].paymentId === previousPaymentId
  )
    throw new Error('A reversed route payment could not be replaced.');

  const [linked] = await database.db
    .select({ value: sql<number>`count(*)` })
    .from(payments)
    .innerJoin(batchAccounts, eq(batchAccounts.id, payments.batchAccountId))
    .where(
      and(
        eq(batchAccounts.id, raceAccount.id),
        inArray(payments.status, ['PENDING_VERIFICATION', 'POSTED']),
      ),
    );
  if (Number(linked?.value) !== 1)
    throw new Error('A route account links to more than one active payment.');

  let gcashBatch = await ensureBatch('2099-10-10');
  if (gcashBatch.status === 'OPEN')
    gcashBatch = await collections.start(gcashBatch.id, actor.id);
  const gcashAccount = gcashBatch.accounts[0];
  if (!gcashAccount) throw new Error('GCash concurrency batch has no account.');
  if (gcashAccount.paymentId) {
    const [existingPayment] = await database.db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, gcashAccount.paymentId));
    if (existingPayment?.status === 'POSTED')
      await paymentsService.reverse(
        gcashAccount.paymentId,
        'TASK6 GCash check reset',
        actor.id,
      );
    else if (existingPayment?.status === 'PENDING_VERIFICATION')
      await paymentsService.decideGcash(
        gcashAccount.paymentId,
        { decision: 'REJECT', reason: 'TASK6 GCash check reset' },
        actor.id,
      );
  }
  const pending = await paymentsService.submitGcash(
    {
      subscriberId: gcashAccount.subscriberId,
      batchAccountId: gcashAccount.id,
      amountCentavos: 10_000,
      referenceNumber: `TASK6-GCASH-${Date.now()}`,
      senderDetails: 'Task 6 automated check',
      proof: {
        filename: 'task6.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from('task6-proof').toString('base64'),
      },
    },
    actor.id,
  );
  const decisions = await Promise.allSettled([
    paymentsService.decideGcash(pending.id, { decision: 'APPROVE' }, actor.id),
    paymentsService.decideGcash(
      pending.id,
      { decision: 'REJECT', reason: 'Concurrent decision check' },
      actor.id,
    ),
  ]);
  if (
    decisions.filter((decision) => decision.status === 'fulfilled').length !== 1
  )
    throw new Error('Concurrent GCash decisions were not serialized.');

  process.stdout.write(
    'Task 6 live checks passed: frozen routes, transitions, AT-07 balanced remittance, AT-08 visible shortage, rollback, closed-batch protection, corrected replacements, and concurrent payment decisions.\n',
  );
} finally {
  await database.close();
}
