import type {
  PaymentPreviewDto,
  PaymentSummaryDto,
  Paginated,
} from '@bcis/contracts';
import {
  auditLogs,
  batchAccounts,
  collectionBatches,
  invoiceStatus,
  invoices,
  ledgerEntries,
  paymentAllocations,
  paymentProofs,
  paymentReversals,
  payments,
  receipts,
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
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { allocateOldest } from './payment-rules.js';
import { canMutateCollectionPayment } from './collection-rules.js';

type Database = DatabaseConnection['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class PaymentError extends Error {
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

function uniqueConstraint(error: unknown) {
  const cause =
    error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'constraint' in cause
    ? String(cause.constraint)
    : '';
}

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly attachmentDirectory: string,
  ) {}

  async preview(subscriberId: string, amountCentavos: number) {
    const [subscriber] = await this.db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId));
    if (!subscriber) throw new PaymentError(404, 'Subscriber not found.');
    const open = await this.openInvoices(subscriberId, this.db);
    const allocation = allocateOldest(open, amountCentavos);
    const proposed = allocation.allocations.map(
      ({ invoice, amountCentavos }) => ({
        ...invoice,
        proposedCentavos: amountCentavos,
      }),
    );
    return {
      subscriberId,
      fingerprint: this.fingerprint(subscriberId, amountCentavos, open),
      balanceCentavos: open.reduce(
        (total, invoice) => total + invoice.balanceCentavos,
        0,
      ),
      invoices: proposed,
      unallocatedCreditCentavos: allocation.creditCentavos,
    } satisfies PaymentPreviewDto;
  }

  async create(
    input: {
      subscriberId: string;
      idempotencyKey?: string | undefined;
      previewFingerprint?: string | undefined;
      batchAccountId?: string | undefined;
      amountCentavos: number;
      method: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
      paymentDate?: string | undefined;
      referenceNumber?: string | undefined;
      notes?: string | undefined;
    },
    actorUserId: string,
  ) {
    if (input.method === 'GCASH')
      throw new PaymentError(409, 'GCash payments require proof verification.');
    if (input.idempotencyKey) {
      const existing = await this.existingRequest(
        input.idempotencyKey,
        input,
        actorUserId,
      );
      if (existing) return existing;
    }
    try {
      return await this.db.transaction(async (transaction) => {
        await this.lockCollectionLink(
          input.batchAccountId,
          input.subscriberId,
          transaction,
        );
        await transaction
          .select({ id: subscribers.id })
          .from(subscribers)
          .where(eq(subscribers.id, input.subscriberId))
          .for('update');
        if (input.previewFingerprint) {
          const open = await this.openInvoices(input.subscriberId, transaction);
          if (
            this.fingerprint(input.subscriberId, input.amountCentavos, open) !==
            input.previewFingerprint
          )
            throw new PaymentError(
              409,
              'The invoice balance changed. Review the allocation again before posting.',
            );
        }
        const [payment] = await transaction
          .insert(payments)
          .values({
            subscriberId: input.subscriberId,
            batchAccountId: input.batchAccountId,
            amountCentavos: input.amountCentavos,
            method: input.method,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            status: 'POSTED',
            paymentDate: input.paymentDate
              ? new Date(input.paymentDate)
              : new Date(),
            postedByUserId: actorUserId,
          })
          .returning();
        if (!payment) throw new Error('Payment insert failed.');
        return this.post(payment, actorUserId, transaction);
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const existing = await this.existingRequest(
          input.idempotencyKey,
          input,
          actorUserId,
        );
        if (existing) return existing;
      }
      if (isUniqueViolation(error))
        throw new PaymentError(
          409,
          'This route account already has a linked payment.',
        );
      throw error;
    }
  }

  private fingerprint(
    subscriberId: string,
    amountCentavos: number,
    open: Array<{
      id: string;
      invoiceNumber: string;
      dueDate: string;
      balanceCentavos: number;
    }>,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          subscriberId,
          amountCentavos,
          invoices: open.map(
            ({ id, invoiceNumber, dueDate, balanceCentavos }) => ({
              id,
              invoiceNumber,
              dueDate,
              balanceCentavos,
            }),
          ),
        }),
      )
      .digest('hex');
  }

  private async existingRequest(
    key: string,
    input: {
      subscriberId: string;
      amountCentavos: number;
      method: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
      referenceNumber?: string | undefined;
    },
    actorUserId: string,
  ) {
    const [row] = await this.db
      .select({
        id: payments.id,
        subscriberId: payments.subscriberId,
        method: payments.method,
        referenceNumber: payments.referenceNumber,
        postedByUserId: payments.postedByUserId,
        amountCentavos: payments.amountCentavos,
        receiptNumber: receipts.receiptNumber,
      })
      .from(payments)
      .innerJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(eq(payments.idempotencyKey, key));
    if (!row) return null;
    if (
      row.postedByUserId !== actorUserId ||
      row.subscriberId !== input.subscriberId ||
      row.amountCentavos !== input.amountCentavos ||
      row.method !== input.method ||
      row.referenceNumber !== (input.referenceNumber ?? null)
    )
      throw new PaymentError(409, 'This payment request key was already used.');
    const allocations = await this.db
      .select({ amountCentavos: paymentAllocations.amountCentavos })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, row.id));
    const allocatedCentavos = allocations.reduce(
      (total, item) => total + item.amountCentavos,
      0,
    );
    return {
      id: row.id,
      receiptNumber: row.receiptNumber,
      allocatedCentavos,
      creditCentavos: row.amountCentavos - allocatedCentavos,
    };
  }

  async submitGcash(
    input: {
      subscriberId: string;
      batchAccountId?: string | undefined;
      amountCentavos: number;
      referenceNumber: string;
      senderDetails: string;
      notes?: string | undefined;
      proof: { filename: string; mimeType: string; dataBase64: string };
    },
    actorUserId: string,
  ) {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const expected = extensions[input.proof.mimeType];
    const supplied = extname(input.proof.filename).toLowerCase();
    if (
      !expected ||
      (supplied !== expected && !(expected === '.jpg' && supplied === '.jpeg'))
    )
      throw new PaymentError(
        409,
        'Proof file type does not match its extension.',
      );
    const bytes = Buffer.from(input.proof.dataBase64, 'base64');
    if (bytes.length === 0 || bytes.length > 5_000_000)
      throw new PaymentError(409, 'Proof image must be no larger than 5 MB.');
    const id = randomUUID();
    const relativePath = `gcash/${id}${expected}`;
    const root = resolve(this.attachmentDirectory);
    const fullPath = resolve(root, relativePath);
    if (!fullPath.startsWith(`${root}${sep}`))
      throw new PaymentError(409, 'Proof storage path is invalid.');
    await mkdir(resolve(root, 'gcash'), { recursive: true });
    await writeFile(fullPath, bytes, { flag: 'wx' });
    try {
      const [payment] = await this.db.transaction(async (transaction) => {
        await this.lockCollectionLink(
          input.batchAccountId,
          input.subscriberId,
          transaction,
        );
        const [created] = await transaction
          .insert(payments)
          .values({
            id,
            subscriberId: input.subscriberId,
            batchAccountId: input.batchAccountId,
            amountCentavos: input.amountCentavos,
            method: 'GCASH',
            status: 'PENDING_VERIFICATION',
            referenceNumber: input.referenceNumber,
            senderDetails: input.senderDetails,
            notes: input.notes,
            postedByUserId: actorUserId,
          })
          .returning();
        if (!created) throw new Error('GCash submission failed.');
        await transaction.insert(paymentProofs).values({
          paymentId: created.id,
          originalFilename: input.proof.filename,
          mimeType: input.proof.mimeType,
          sizeBytes: bytes.length,
          storagePath: relativePath,
          checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        });
        await transaction.insert(auditLogs).values({
          actorUserId,
          action: 'GCASH_PROOF_SUBMITTED',
          entityType: 'payment',
          entityId: created.id,
          newValues: { referenceNumber: input.referenceNumber },
        });
        return [created];
      });
      return { id: payment!.id, status: payment!.status };
    } catch (error) {
      await rm(fullPath, { force: true });
      if (isUniqueViolation(error))
        throw new PaymentError(
          409,
          uniqueConstraint(error) === 'payments_batch_account_unique'
            ? 'This route account already has a linked payment.'
            : 'GCash reference number already exists.',
        );
      throw error;
    }
  }

  async decideGcash(
    id: string,
    input: { decision: 'APPROVE' } | { decision: 'REJECT'; reason: string },
    actorUserId: string,
  ) {
    try {
      return await this.db.transaction(async (transaction) => {
        const payment = await this.lockPaymentForMutation(id, transaction);
        if (
          payment.method !== 'GCASH' ||
          payment.status !== 'PENDING_VERIFICATION'
        )
          throw new PaymentError(
            409,
            'This GCash submission is no longer pending.',
          );
        const now = new Date();
        if (input.decision === 'REJECT') {
          await transaction
            .update(payments)
            .set({
              status: 'REJECTED',
              rejectedReason: input.reason,
              verifiedByUserId: actorUserId,
              verifiedAt: now,
              updatedAt: now,
            })
            .where(eq(payments.id, id));
          await transaction.insert(auditLogs).values({
            actorUserId,
            action: 'GCASH_REJECTED',
            entityType: 'payment',
            entityId: id,
            reason: input.reason,
          });
          return { id, status: 'REJECTED' as const };
        }
        await transaction
          .update(payments)
          .set({
            status: 'POSTED',
            verifiedByUserId: actorUserId,
            verifiedAt: now,
            updatedAt: now,
          })
          .where(eq(payments.id, id));
        return this.post(
          { ...payment, status: 'POSTED' },
          actorUserId,
          transaction,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new PaymentError(409, 'GCash reference number already exists.');
      throw error;
    }
  }

  async reverse(id: string, reason: string, actorUserId: string) {
    return this.db.transaction(async (transaction) => {
      const payment = await this.lockPaymentForMutation(id, transaction);
      if (payment.status !== 'POSTED')
        throw new PaymentError(409, 'Only a posted payment may be reversed.');
      const [receipt] = await transaction
        .select()
        .from(receipts)
        .where(eq(receipts.paymentId, id));
      if (!receipt) throw new Error('Posted payment receipt is missing.');
      const [reversal] = await transaction
        .insert(paymentReversals)
        .values({ paymentId: id, reason, actorUserId })
        .returning();
      if (!reversal) throw new Error('Payment reversal failed.');
      const now = new Date();
      await transaction
        .update(payments)
        .set({ status: 'REVERSED', updatedAt: now })
        .where(eq(payments.id, id));
      await transaction
        .update(receipts)
        .set({ voidedAt: now })
        .where(eq(receipts.id, receipt.id));
      await transaction.insert(ledgerEntries).values({
        subscriberId: payment.subscriberId,
        paymentId: id,
        paymentReversalId: reversal.id,
        entryType: 'PAYMENT_REVERSAL_DEBIT',
        reference: receipt.receiptNumber,
        description: `Payment reversal: ${reason}`,
        debitCentavos: payment.amountCentavos,
      });
      const allocations = await transaction
        .select({ invoiceId: paymentAllocations.invoiceId })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, id));
      await this.refreshInvoices(
        allocations.map((item) => item.invoiceId),
        transaction,
      );
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'PAYMENT_REVERSED',
        entityType: 'payment',
        entityId: id,
        reason,
        oldValues: { status: 'POSTED' },
        newValues: { status: 'REVERSED' },
      });
      return { id, status: 'REVERSED' as const };
    });
  }

  async list(query: {
    q: string;
    page: number;
    pageSize: number;
    status?: PaymentSummaryDto['status'] | undefined;
    subscriberId?: string | undefined;
  }): Promise<Paginated<PaymentSummaryDto>> {
    const term = `%${query.q}%`;
    const where = and(
      query.status ? eq(payments.status, query.status) : undefined,
      query.subscriberId
        ? eq(payments.subscriberId, query.subscriberId)
        : undefined,
      query.q
        ? or(
            ilike(payments.referenceNumber, term),
            ilike(subscribers.accountNumber, term),
            ilike(subscribers.fullName, term),
            sql`exists (select 1 from receipts r where r.payment_id = ${payments.id} and r.receipt_number ilike ${term})`,
          )
        : undefined,
    );
    const [totalRow, rows] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(payments)
        .innerJoin(subscribers, eq(subscribers.id, payments.subscriberId))
        .where(where),
      this.db
        .select({ payment: payments, subscriber: subscribers })
        .from(payments)
        .innerJoin(subscribers, eq(subscribers.id, payments.subscriberId))
        .where(where)
        .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ]);
    return {
      items: await Promise.all(
        rows.map(({ payment, subscriber }) =>
          this.summary(payment, subscriber.fullName, subscriber.accountNumber),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: totalRow[0]?.value ?? 0,
    };
  }

  async get(id: string): Promise<PaymentSummaryDto> {
    const [row] = await this.db
      .select({ payment: payments, subscriber: subscribers })
      .from(payments)
      .innerJoin(subscribers, eq(subscribers.id, payments.subscriberId))
      .where(eq(payments.id, id));
    if (!row) throw new PaymentError(404, 'Payment not found.');
    return this.summary(
      row.payment,
      row.subscriber.fullName,
      row.subscriber.accountNumber,
    );
  }

  async proof(id: string) {
    const [proof] = await this.db
      .select()
      .from(paymentProofs)
      .where(eq(paymentProofs.id, id));
    if (!proof) throw new PaymentError(404, 'Payment proof not found.');
    const root = resolve(this.attachmentDirectory);
    const fullPath = resolve(root, proof.storagePath);
    if (!fullPath.startsWith(`${root}${sep}`))
      throw new PaymentError(404, 'Payment proof is unavailable.');
    let bytes: Buffer;
    try {
      bytes = await readFile(fullPath);
    } catch {
      throw new PaymentError(404, 'Payment proof file is unavailable.');
    }
    if (
      createHash('sha256').update(bytes).digest('hex') !== proof.checksumSha256
    )
      throw new PaymentError(409, 'Payment proof integrity check failed.');
    return {
      id: proof.id,
      filename: proof.originalFilename,
      mimeType: proof.mimeType,
      dataBase64: bytes.toString('base64'),
    };
  }

  private async post(
    payment: typeof payments.$inferSelect,
    actorUserId: string,
    transaction: Transaction,
  ) {
    await transaction
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.id, payment.subscriberId))
      .for('update');
    const sequence = await transaction.execute<{ value: string }>(
      sql`select nextval('receipt_number_sequence')::text as value`,
    );
    const value = sequence.rows[0]?.value;
    if (!value) throw new Error('Receipt number sequence failed.');
    const receiptNumber = `RCPT-${value.padStart(6, '0')}`;
    const [receipt] = await transaction
      .insert(receipts)
      .values({ paymentId: payment.id, receiptNumber })
      .returning();
    if (!receipt) throw new Error('Receipt insert failed.');
    const open = await this.openInvoices(payment.subscriberId, transaction);
    const allocation = allocateOldest(open, payment.amountCentavos);
    const affected: string[] = [];
    for (const { invoice, amountCentavos } of allocation.allocations) {
      if (amountCentavos <= 0) break;
      await transaction.insert(paymentAllocations).values({
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCentavos,
      });
      affected.push(invoice.id);
    }
    await transaction.insert(ledgerEntries).values({
      subscriberId: payment.subscriberId,
      paymentId: payment.id,
      entryType: 'PAYMENT_CREDIT',
      reference: receiptNumber,
      description: `${payment.method.replace('_', ' ')} payment`,
      creditCentavos: payment.amountCentavos,
      occurredAt: payment.paymentDate,
    });
    await this.refreshInvoices(affected, transaction);
    await transaction.insert(auditLogs).values({
      actorUserId,
      action: 'PAYMENT_POSTED',
      entityType: 'payment',
      entityId: payment.id,
      newValues: {
        amountCentavos: payment.amountCentavos,
        method: payment.method,
        receiptNumber,
        unallocatedCreditCentavos: allocation.creditCentavos,
      },
    });
    return {
      id: payment.id,
      receiptNumber,
      allocatedCentavos: payment.amountCentavos - allocation.creditCentavos,
      creditCentavos: allocation.creditCentavos,
    };
  }

  private async lockCollectionLink(
    batchAccountId: string | undefined,
    subscriberId: string,
    transaction: Transaction,
  ) {
    if (!batchAccountId) return;
    const [account] = await transaction
      .select()
      .from(batchAccounts)
      .where(eq(batchAccounts.id, batchAccountId));
    if (!account) throw new PaymentError(404, 'Route account not found.');
    if (account.subscriberId !== subscriberId)
      throw new PaymentError(
        409,
        'The route account does not belong to this subscriber.',
      );
    const [batch] = await transaction
      .select()
      .from(collectionBatches)
      .where(eq(collectionBatches.id, account.batchId))
      .for('update');
    if (!batch) throw new PaymentError(404, 'Collection batch not found.');
    if (!canMutateCollectionPayment(batch.status))
      throw new PaymentError(
        409,
        'Collections may only be posted to an in-progress batch.',
      );
  }

  private async lockPaymentForMutation(id: string, transaction: Transaction) {
    const [candidate] = await transaction
      .select({
        subscriberId: payments.subscriberId,
        batchAccountId: payments.batchAccountId,
      })
      .from(payments)
      .where(eq(payments.id, id));
    if (!candidate) throw new PaymentError(404, 'Payment not found.');
    await this.lockCollectionLink(
      candidate.batchAccountId ?? undefined,
      candidate.subscriberId,
      transaction,
    );
    const [payment] = await transaction
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .for('update');
    if (!payment) throw new PaymentError(404, 'Payment not found.');
    return payment;
  }

  private async openInvoices(
    subscriberId: string,
    database: Pick<Database, 'select'>,
  ) {
    const rows = await database
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriberId, subscriberId),
          inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']),
        ),
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber));
    const result = [];
    for (const invoice of rows) {
      const [amounts] = await database
        .select({
          adjustments: sql<number>`coalesce((select sum(a.amount_centavos) from adjustments a where a.invoice_id = ${invoice.id}), 0)`,
          allocated: sql<number>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa join payments p on p.id = pa.payment_id where pa.invoice_id = ${invoice.id} and p.status = 'POSTED'), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.id, invoice.id));
      const balanceCentavos = Math.max(
        0,
        invoice.totalCentavos +
          Number(amounts?.adjustments ?? 0) -
          Number(amounts?.allocated ?? 0),
      );
      if (balanceCentavos > 0)
        result.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          balanceCentavos,
        });
    }
    return result;
  }

  private async refreshInvoices(ids: string[], transaction: Transaction) {
    for (const id of [...new Set(ids)]) {
      const [invoice] = await transaction
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));
      if (!invoice || invoice.status === 'VOID') continue;
      const [values] = await transaction
        .select({
          adjustments: sql<number>`coalesce((select sum(a.amount_centavos) from adjustments a where a.invoice_id = ${id}), 0)`,
          allocated: sql<number>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa join payments p on p.id = pa.payment_id where pa.invoice_id = ${id} and p.status = 'POSTED'), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.id, id));
      const due = invoice.totalCentavos + Number(values?.adjustments ?? 0);
      const allocated = Number(values?.allocated ?? 0);
      const status: (typeof invoiceStatus.enumValues)[number] =
        due <= 0
          ? 'CREDITED'
          : allocated >= due
            ? 'PAID'
            : allocated > 0
              ? 'PARTIALLY_PAID'
              : invoice.dueDate < new Date().toISOString().slice(0, 10)
                ? 'OVERDUE'
                : 'UNPAID';
      await transaction
        .update(invoices)
        .set({ status, updatedAt: new Date() })
        .where(eq(invoices.id, id));
    }
  }

  private async summary(
    payment: typeof payments.$inferSelect,
    subscriberName: string,
    subscriberAccountNumber: string,
  ): Promise<PaymentSummaryDto> {
    const [values] = await this.db
      .select({
        allocated: sql<number>`coalesce(sum(${paymentAllocations.amountCentavos}), 0)`,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, payment.id));
    const [[receipt], [proof], [reversal]] = await Promise.all([
      this.db.select().from(receipts).where(eq(receipts.paymentId, payment.id)),
      this.db
        .select()
        .from(paymentProofs)
        .where(eq(paymentProofs.paymentId, payment.id)),
      this.db
        .select()
        .from(paymentReversals)
        .where(eq(paymentReversals.paymentId, payment.id)),
    ]);
    const allocatedCentavos = Number(values?.allocated ?? 0);
    return {
      id: payment.id,
      subscriberId: payment.subscriberId,
      subscriberName,
      subscriberAccountNumber,
      amountCentavos: payment.amountCentavos,
      allocatedCentavos,
      creditCentavos:
        payment.status === 'POSTED'
          ? Math.max(0, payment.amountCentavos - allocatedCentavos)
          : 0,
      method: payment.method,
      status: payment.status,
      referenceNumber: payment.referenceNumber,
      senderDetails: payment.senderDetails,
      notes: payment.notes,
      paymentDate: payment.paymentDate.toISOString(),
      receiptNumber: receipt?.receiptNumber ?? null,
      receiptVoidedAt: receipt?.voidedAt?.toISOString() ?? null,
      proofId: proof?.id ?? null,
      proofFilename: proof?.originalFilename ?? null,
      rejectedReason: payment.rejectedReason,
      reversedReason: reversal?.reason ?? null,
    };
  }
}
