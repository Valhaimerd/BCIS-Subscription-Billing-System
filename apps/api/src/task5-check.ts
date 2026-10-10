import {
  billingCycles,
  createDatabaseConnection,
  invoices,
  ledgerEntries,
  paymentAllocations,
  paymentProofs,
  paymentReversals,
  payments,
  receipts,
  serviceAccounts,
  users,
} from '@bcis/database';
import { and, count, countDistinct, eq, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BillingService } from './billing.js';
import { MasterDataService } from './master-data.js';
import { PaymentError, PaymentService } from './payments.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = createDatabaseConnection(databaseUrl);
const billing = new BillingService(database.db);
const masterData = new MasterDataService(database.db);
const attachmentDirectory = resolve(
  import.meta.dirname,
  '../../../',
  process.env.ATTACHMENT_DIRECTORY ?? './storage/attachments',
);
const paymentService = new PaymentService(database.db, attachmentDirectory);
const acceptanceYear = 2027;

type Candidate = { subscriberId: string; rate: number };

try {
  const [actor] = await database.db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  if (!actor) throw new Error('A seeded user is required.');
  const actorId = actor.id;
  for (const periodMonth of [8, 9]) {
    const generated = await billing.generateDrafts(
      { periodYear: acceptanceYear, periodMonth },
      actorId,
    );
    const cycleId = generated.cycleId;
    await billing.finalizeCycle(cycleId, actorId);
  }

  const candidatesResult = await database.db.execute<Candidate>(sql`
    select subscriber_id as "subscriberId", min(current_rate_centavos)::int as rate
    from ${serviceAccounts}
    where status = 'ACTIVE' and account_number like 'SVC-%'
    group by subscriber_id
    having count(*) = 1
    order by subscriber_id
  `);
  const candidates = candidatesResult.rows.map((row) => ({
    subscriberId: row.subscriberId,
    rate: Number(row.rate),
  }));
  const used = new Set<string>();
  const pick = (predicate: (candidate: Candidate) => boolean) => {
    const candidate = candidates.find(
      (item) => !used.has(item.subscriberId) && predicate(item),
    );
    if (!candidate)
      throw new Error('The acceptance dataset needs more candidates.');
    used.add(candidate.subscriberId);
    return candidate;
  };
  const exact = pick(() => true);
  const partial = pick((item) => item.rate > 50_000);
  const advance = pick((item) => item.rate * 3 < 300_000);
  const arrears = pick(() => true);
  const reversal = pick(() => true);
  const gcash = pick(() => true);
  const rejected = pick(() => true);

  async function existing(tag: string) {
    const [row] = await database.db
      .select()
      .from(payments)
      .where(eq(payments.notes, tag));
    return row;
  }
  async function post(
    tag: string,
    subscriberId: string,
    amountCentavos: number,
  ) {
    const prior = await existing(tag);
    if (prior) return prior;
    await paymentService.create(
      { subscriberId, amountCentavos, method: 'CASH', notes: tag },
      actorId,
    );
    const created = await existing(tag);
    if (!created) throw new Error(`${tag} payment was not created.`);
    return created;
  }

  async function setInvoiceBalance(
    subscriberId: string,
    periodMonth: number,
    balanceCentavos: number,
  ) {
    const [invoice] = await database.db
      .select({ id: invoices.id })
      .from(invoices)
      .innerJoin(billingCycles, eq(billingCycles.id, invoices.billingCycleId))
      .where(
        and(
          eq(invoices.subscriberId, subscriberId),
          eq(billingCycles.periodYear, acceptanceYear),
          eq(billingCycles.periodMonth, periodMonth),
        ),
      )
      .limit(1);
    if (!invoice) throw new Error('Acceptance invoice is missing.');
    const detail = await billing.invoice(invoice.id);
    const difference = balanceCentavos - detail.balanceCentavos;
    if (difference)
      await billing.addAdjustment(
        invoice.id,
        {
          amountCentavos: difference,
          reason: `Task 5 acceptance amount for month ${periodMonth}.`,
        },
        actorId,
      );
  }

  // Independent cashier requests exercise receipt numbering concurrently.
  if (!(await existing('TASK5-AT01')))
    await setInvoiceBalance(exact.subscriberId, 8, 99_900);
  if (!(await existing('TASK5-AT04'))) {
    await setInvoiceBalance(arrears.subscriberId, 8, 99_900);
    await setInvoiceBalance(arrears.subscriberId, 9, 99_900);
  }
  const [exactPayment, partialPayment] = await Promise.all([
    post('TASK5-AT01', exact.subscriberId, 99_900),
    post('TASK5-AT02', partial.subscriberId, 50_000),
  ]);
  const advancePayment = await post(
    'TASK5-AT03',
    advance.subscriberId,
    300_000,
  );
  const arrearsPayment = await post(
    'TASK5-AT04',
    arrears.subscriberId,
    120_000,
  );

  const allocations = async (paymentId: string) =>
    database.db
      .select({
        invoiceId: paymentAllocations.invoiceId,
        amountCentavos: paymentAllocations.amountCentavos,
        status: invoices.status,
        dueDate: invoices.dueDate,
      })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, paymentId))
      .orderBy(invoices.dueDate);
  const exactRows = await allocations(exactPayment.id);
  if (exactRows[0]?.amountCentavos !== 99_900 || exactRows[0].status !== 'PAID')
    throw new Error('AT-01 exact payment failed.');
  const partialRows = await allocations(partialPayment.id);
  if (
    partialRows[0]?.amountCentavos !== 50_000 ||
    partialRows[0].status !== 'PARTIALLY_PAID'
  )
    throw new Error('AT-02 partial payment failed.');
  const advanceRows = await allocations(advancePayment.id);
  const advanceAllocated = advanceRows.reduce(
    (total, row) => total + row.amountCentavos,
    0,
  );
  if (advanceAllocated >= 300_000 || advanceAllocated <= 0)
    throw new Error('AT-03 advance credit was not retained correctly.');
  const arrearsRows = await allocations(arrearsPayment.id);
  if (
    arrearsRows[0]?.amountCentavos !== 99_900 ||
    arrearsRows[1]?.amountCentavos !== 20_100 ||
    arrearsRows[0].dueDate >= arrearsRows[1].dueDate
  )
    throw new Error('AT-04 oldest-first allocation failed.');

  let gcashPayment = await existing('TASK5-AT05');
  const proofBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=';
  if (!gcashPayment) {
    const submission = await paymentService.submitGcash(
      {
        subscriberId: gcash.subscriberId,
        amountCentavos: 10_000,
        referenceNumber: 'TASK5-GCASH-UNIQUE',
        senderDetails: 'Synthetic sender 01',
        notes: 'TASK5-AT05',
        proof: {
          filename: 'task5-proof.png',
          mimeType: 'image/png',
          dataBase64: proofBase64,
        },
      },
      actorId,
    );
    await paymentService.decideGcash(
      submission.id,
      { decision: 'APPROVE' },
      actorId,
    );
    gcashPayment = await existing('TASK5-AT05');
  }
  if (!gcashPayment || gcashPayment.status !== 'POSTED')
    throw new Error('Verified GCash was not posted.');
  let duplicateBlocked = false;
  try {
    await paymentService.submitGcash(
      {
        subscriberId: gcash.subscriberId,
        amountCentavos: 10_000,
        referenceNumber: 'TASK5-GCASH-UNIQUE',
        senderDetails: 'Synthetic duplicate',
        proof: {
          filename: 'duplicate.png',
          mimeType: 'image/png',
          dataBase64: proofBase64,
        },
      },
      actorId,
    );
  } catch (error) {
    duplicateBlocked =
      error instanceof PaymentError && error.statusCode === 409;
  }
  if (!duplicateBlocked) throw new Error('AT-05 duplicate GCash was accepted.');

  let racePayment = await existing('TASK5-GCASH-RACE');
  if (!racePayment) {
    const raceInput = {
      subscriberId: rejected.subscriberId,
      amountCentavos: 10_000,
      referenceNumber: 'TASK5-GCASH-RACE-UNIQUE',
      senderDetails: 'Synthetic concurrent sender',
      notes: 'TASK5-GCASH-RACE',
      proof: {
        filename: 'race.png',
        mimeType: 'image/png',
        dataBase64: proofBase64,
      },
    };
    const results = await Promise.allSettled([
      paymentService.submitGcash(raceInput, actorId),
      paymentService.submitGcash(raceInput, actorId),
    ]);
    if (results.filter((result) => result.status === 'fulfilled').length !== 1)
      throw new Error('Concurrent GCash duplicate protection failed.');
    racePayment = await existing('TASK5-GCASH-RACE');
  }
  if (!racePayment) throw new Error('Concurrent GCash winner is missing.');
  if (racePayment.status === 'PENDING_VERIFICATION')
    await paymentService.decideGcash(
      racePayment.id,
      { decision: 'REJECT', reason: 'Synthetic concurrency check complete.' },
      actorId,
    );

  let rejectedPayment = await existing('TASK5-GCASH-REJECT');
  if (!rejectedPayment) {
    const submission = await paymentService.submitGcash(
      {
        subscriberId: rejected.subscriberId,
        amountCentavos: 10_000,
        referenceNumber: 'TASK5-GCASH-REJECTED',
        senderDetails: 'Synthetic sender 02',
        notes: 'TASK5-GCASH-REJECT',
        proof: {
          filename: 'rejected.png',
          mimeType: 'image/png',
          dataBase64: proofBase64,
        },
      },
      actorId,
    );
    await paymentService.decideGcash(
      submission.id,
      { decision: 'REJECT', reason: 'Synthetic proof rejected for testing.' },
      actorId,
    );
    rejectedPayment = await existing('TASK5-GCASH-REJECT');
  }
  if (rejectedPayment?.status !== 'REJECTED')
    throw new Error('GCash rejection was not retained.');

  const [proof] = await database.db
    .select()
    .from(paymentProofs)
    .where(eq(paymentProofs.paymentId, gcashPayment.id));
  if (!proof) throw new Error('Approved GCash proof is missing.');
  const proofPath = resolve(attachmentDirectory, proof.storagePath);
  const missingPath = `${proofPath}.missing-check`;
  await rename(proofPath, missingPath);
  let missingProofRejected = false;
  try {
    await paymentService.proof(proof.id);
  } catch (error) {
    missingProofRejected =
      error instanceof PaymentError && error.statusCode === 404;
  } finally {
    await rename(missingPath, proofPath);
  }
  if (!missingProofRejected)
    throw new Error('Missing proof files are not reported safely.');

  const reversalPayment = await post(
    'TASK5-AT06',
    reversal.subscriberId,
    10_000,
  );
  if (reversalPayment.status === 'POSTED')
    await paymentService.reverse(
      reversalPayment.id,
      'Synthetic reversal acceptance check.',
      actorId,
    );
  const [[reversed], [reversalRow], [voidedReceipt]] = await Promise.all([
    database.db
      .select()
      .from(payments)
      .where(eq(payments.id, reversalPayment.id)),
    database.db
      .select()
      .from(paymentReversals)
      .where(eq(paymentReversals.paymentId, reversalPayment.id)),
    database.db
      .select()
      .from(receipts)
      .where(eq(receipts.paymentId, reversalPayment.id)),
  ]);
  if (
    reversed?.status !== 'REVERSED' ||
    !reversalRow ||
    !voidedReceipt?.voidedAt
  )
    throw new Error('AT-06 reversal history is incomplete.');

  const [exactReceipt] = await database.db
    .select()
    .from(receipts)
    .where(eq(receipts.paymentId, exactPayment.id));
  if (!exactReceipt) throw new Error('AT-01 receipt is missing.');
  let rollbackRejected = false;
  try {
    await database.db.transaction(async (transaction) => {
      await transaction
        .update(payments)
        .set({ amountCentavos: exactPayment.amountCentavos + 1 })
        .where(eq(payments.id, exactPayment.id));
      await transaction.insert(receipts).values({
        paymentId: exactPayment.id,
        receiptNumber: `${exactReceipt.receiptNumber}-DUPLICATE`,
      });
    });
  } catch {
    rollbackRejected = true;
  }
  const [afterRollback] = await database.db
    .select({ amountCentavos: payments.amountCentavos })
    .from(payments)
    .where(eq(payments.id, exactPayment.id));
  if (
    !rollbackRejected ||
    afterRollback?.amountCentavos !== exactPayment.amountCentavos
  )
    throw new Error('Failed payment writes did not roll back atomically.');

  const [receiptSearch, gcashSearch] = await Promise.all([
    masterData.listSubscribers({
      q: exactReceipt.receiptNumber,
      page: 1,
      pageSize: 20,
    }),
    masterData.listSubscribers({
      q: 'TASK5-GCASH-UNIQUE',
      page: 1,
      pageSize: 20,
    }),
  ]);
  if (
    receiptSearch.items[0]?.id !== exactPayment.subscriberId ||
    gcashSearch.items[0]?.id !== gcashPayment.subscriberId
  )
    throw new Error(
      'Receipt or GCash global search did not resolve the subscriber.',
    );

  const [receiptCheck] = await database.db
    .select({ count: count(), distinct: countDistinct(receipts.receiptNumber) })
    .from(receipts);
  if (receiptCheck?.count !== receiptCheck?.distinct)
    throw new Error('Receipt numbers are not unique.');
  const [ledgerCheck] = await database.db
    .select({
      credits: sql<number>`coalesce(sum(${ledgerEntries.creditCentavos}), 0)`,
      debits: sql<number>`coalesce(sum(${ledgerEntries.debitCentavos}), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.paymentId, reversalPayment.id));
  if (
    Number(ledgerCheck?.credits) !== reversalPayment.amountCentavos ||
    Number(ledgerCheck?.debits) !== reversalPayment.amountCentavos
  )
    throw new Error('Reversal ledger entries do not balance.');

  process.stdout.write(
    'Task 5 live checks passed: AT-01 through AT-06, concurrent receipts, proof review, allocation, credit, and reversal.\n',
  );
} finally {
  await database.close();
}
