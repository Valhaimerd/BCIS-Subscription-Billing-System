import type {
  Paginated,
  PlanDto,
  SubscriberActivityDto,
  SubscriberActivityQuery,
  PermissionCode,
  SubscriberProfileDto,
  SubscriberSummaryDto,
} from '@bcis/contracts';
import {
  auditLogs,
  collectionAreas,
  collectors,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscriberAddresses,
  subscriberContacts,
  subscriberEvents,
  subscribers,
  type DatabaseConnection,
} from '@bcis/database';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import type {
  changeServiceStatusSchema,
  changeSubscriberStatusSchema,
  createPlanSchema,
  createServiceAccountSchema,
  createSubscriberSchema,
  updatePlanSchema,
} from '@bcis/contracts';
import type { z } from 'zod';

type Database = DatabaseConnection['db'];
type CreatePlan = z.infer<typeof createPlanSchema>;
type UpdatePlan = z.infer<typeof updatePlanSchema>;
type CreateSubscriber = z.infer<typeof createSubscriberSchema>;
type CreateServiceAccount = z.infer<typeof createServiceAccountSchema>;
type SubscriberStatusChange = z.infer<typeof changeSubscriberStatusSchema>;
type ServiceStatusChange = z.infer<typeof changeServiceStatusSchema>;

export class MasterDataError extends Error {
  constructor(
    public readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && isUniqueViolation(error.cause);
}

export class MasterDataService {
  constructor(private readonly db: Database) {}

  async references() {
    const [types, areas, collectorRows, plans] = await Promise.all([
      this.db
        .select()
        .from(serviceTypes)
        .where(eq(serviceTypes.isActive, true))
        .orderBy(asc(serviceTypes.name)),
      this.db
        .select()
        .from(collectionAreas)
        .where(eq(collectionAreas.isActive, true))
        .orderBy(asc(collectionAreas.name)),
      this.db
        .select()
        .from(collectors)
        .where(eq(collectors.isActive, true))
        .orderBy(asc(collectors.fullName)),
      this.listPlans(),
    ]);
    return {
      serviceTypes: types.map(({ id, code, name }) => ({ id, code, name })),
      collectionAreas: areas.map(({ id, code, name }) => ({ id, code, name })),
      collectors: collectorRows.map(({ id, code, fullName }) => ({
        id,
        code,
        name: fullName,
      })),
      plans,
    };
  }

  async listPlans(): Promise<PlanDto[]> {
    const rows = await this.db
      .select({ plan: servicePlans, typeCode: serviceTypes.code })
      .from(servicePlans)
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
      .orderBy(asc(servicePlans.name));
    return rows.map(({ plan, typeCode }) => ({
      id: plan.id,
      serviceTypeCode: typeCode as PlanDto['serviceTypeCode'],
      code: plan.code,
      name: plan.name,
      priceCentavos: plan.priceCentavos,
      speedMbps: plan.speedMbps,
      channelCount: plan.channelCount,
      description: plan.description,
      isActive: plan.isActive,
    }));
  }

  async createPlan(input: CreatePlan, actorUserId: string): Promise<PlanDto> {
    const [type] = await this.db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.code, input.serviceTypeCode));
    if (!type) throw new MasterDataError(404, 'Service type not found.');
    try {
      const [created] = await this.db
        .insert(servicePlans)
        .values({
          serviceTypeId: type.id,
          code: input.code.toUpperCase(),
          name: input.name,
          priceCentavos: input.priceCentavos,
          speedMbps: input.speedMbps ?? null,
          channelCount: input.channelCount ?? null,
          description: input.description ?? null,
        })
        .returning();
      if (!created) throw new Error('Plan insert failed.');
      await this.audit(
        actorUserId,
        'PLAN_CREATED',
        'service_plan',
        created.id,
        { code: created.code },
      );
      return { ...created, serviceTypeCode: input.serviceTypeCode };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new MasterDataError(409, 'Plan code already exists.');
      throw error;
    }
  }

  async updatePlan(
    id: string,
    input: UpdatePlan,
    actorUserId: string,
  ): Promise<PlanDto> {
    const { reason, ...changes } = input;
    const [current] = await this.db
      .select({ plan: servicePlans, typeCode: serviceTypes.code })
      .from(servicePlans)
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
      .where(eq(servicePlans.id, id));
    if (!current) throw new MasterDataError(404, 'Plan not found.');
    const [updated] = await this.db
      .update(servicePlans)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(servicePlans.id, id))
      .returning();
    if (!updated) throw new MasterDataError(404, 'Plan not found.');
    await this.audit(
      actorUserId,
      'PLAN_UPDATED',
      'service_plan',
      id,
      changes,
      reason,
    );
    return {
      ...updated,
      serviceTypeCode: current.typeCode as PlanDto['serviceTypeCode'],
    };
  }

  async listSubscribers(query: {
    q: string;
    page: number;
    pageSize: number;
  }): Promise<Paginated<SubscriberSummaryDto>> {
    const term = `%${query.q}%`;
    const matches = query.q
      ? or(
          ilike(subscribers.accountNumber, term),
          ilike(subscribers.fullName, term),
          sql`exists (select 1 from subscriber_contacts c where c.subscriber_id = ${subscribers.id} and c.value ilike ${term})`,
          sql`exists (select 1 from subscriber_addresses a where a.subscriber_id = ${subscribers.id} and a.address_line ilike ${term})`,
          sql`exists (select 1 from service_accounts s where s.subscriber_id = ${subscribers.id} and s.account_number ilike ${term})`,
          sql`exists (select 1 from invoices i where i.subscriber_id = ${subscribers.id} and i.invoice_number ilike ${term})`,
          sql`exists (select 1 from payments p left join receipts r on r.payment_id = p.id where p.subscriber_id = ${subscribers.id} and (p.reference_number ilike ${term} or r.receipt_number ilike ${term}))`,
        )
      : undefined;
    const countRows = await this.db
      .select({ value: count() })
      .from(subscribers)
      .where(matches);
    const total = countRows[0]?.value ?? 0;
    const rows = await this.db
      .select()
      .from(subscribers)
      .where(matches)
      .orderBy(asc(subscribers.accountNumber))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const summaries = await Promise.all(
      rows.map((row) => this.summary(row.id)),
    );
    return {
      items: summaries,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createSubscriber(
    input: CreateSubscriber,
    actorUserId: string,
  ): Promise<SubscriberProfileDto> {
    try {
      const id = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(subscribers)
          .values({
            accountNumber: input.accountNumber.toUpperCase(),
            fullName: input.fullName,
            collectionAreaId: input.collectionAreaId ?? null,
            assignedCollectorId: input.assignedCollectorId ?? null,
            notes: input.notes ?? null,
            defaultBillingDay: input.defaultBillingDay,
            defaultDueDay: input.defaultDueDay,
          })
          .returning({ id: subscribers.id });
        if (!created) throw new Error('Subscriber insert failed.');
        await tx.insert(subscriberAddresses).values(
          input.addresses.map((address, index) => ({
            ...address,
            subscriberId: created.id,
            isPrimary:
              address.isPrimary ||
              (!input.addresses.some((item) => item.isPrimary) && index === 0),
          })),
        );
        await tx.insert(subscriberContacts).values(
          input.contacts.map((contact, index) => ({
            ...contact,
            subscriberId: created.id,
            isPrimary:
              contact.isPrimary ||
              (!input.contacts.some((item) => item.isPrimary) && index === 0),
          })),
        );
        await tx.insert(subscriberEvents).values({
          subscriberId: created.id,
          newStatus: 'ACTIVE',
          reason: 'Subscriber registered.',
          actorUserId,
        });
        await tx.insert(auditLogs).values({
          actorUserId,
          action: 'SUBSCRIBER_CREATED',
          entityType: 'subscriber',
          entityId: created.id,
          newValues: { accountNumber: input.accountNumber.toUpperCase() },
        });
        return created.id;
      });
      return this.profile(id);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new MasterDataError(
          409,
          'Subscriber account number already exists.',
        );
      throw error;
    }
  }

  async profile(id: string): Promise<SubscriberProfileDto> {
    const [subscriber] = await this.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, id));
    if (!subscriber) throw new MasterDataError(404, 'Subscriber not found.');
    const [addresses, contacts, services, events, area, collector] =
      await Promise.all([
        this.db
          .select()
          .from(subscriberAddresses)
          .where(eq(subscriberAddresses.subscriberId, id))
          .orderBy(desc(subscriberAddresses.isPrimary)),
        this.db
          .select()
          .from(subscriberContacts)
          .where(eq(subscriberContacts.subscriberId, id))
          .orderBy(desc(subscriberContacts.isPrimary)),
        this.db
          .select({
            account: serviceAccounts,
            planName: servicePlans.name,
            typeCode: serviceTypes.code,
          })
          .from(serviceAccounts)
          .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
          .innerJoin(
            serviceTypes,
            eq(servicePlans.serviceTypeId, serviceTypes.id),
          )
          .where(eq(serviceAccounts.subscriberId, id))
          .orderBy(asc(serviceAccounts.accountNumber)),
        this.db
          .select()
          .from(subscriberEvents)
          .where(eq(subscriberEvents.subscriberId, id))
          .orderBy(desc(subscriberEvents.createdAt)),
        subscriber.collectionAreaId
          ? this.db
              .select()
              .from(collectionAreas)
              .where(eq(collectionAreas.id, subscriber.collectionAreaId))
          : [],
        subscriber.assignedCollectorId
          ? this.db
              .select()
              .from(collectors)
              .where(eq(collectors.id, subscriber.assignedCollectorId))
          : [],
      ]);
    return {
      id: subscriber.id,
      accountNumber: subscriber.accountNumber,
      fullName: subscriber.fullName,
      status: subscriber.status,
      notes: subscriber.notes,
      primaryContact:
        contacts.find((item) => item.isPrimary)?.value ??
        contacts[0]?.value ??
        null,
      primaryAddress:
        addresses.find((item) => item.isPrimary)?.addressLine ??
        addresses[0]?.addressLine ??
        null,
      serviceCount: services.length,
      collectionArea: area[0]
        ? { id: area[0].id, code: area[0].code, name: area[0].name }
        : null,
      assignedCollector: collector[0]
        ? {
            id: collector[0].id,
            code: collector[0].code,
            name: collector[0].fullName,
          }
        : null,
      addresses: addresses.map(
        ({ id: addressId, label, addressLine, isPrimary }) => ({
          id: addressId,
          label,
          addressLine,
          isPrimary,
        }),
      ),
      contacts: contacts.map(({ id: contactId, type, value, isPrimary }) => ({
        id: contactId,
        type,
        value,
        isPrimary,
      })),
      serviceAccounts: services.map(({ account, planName, typeCode }) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        planId: account.planId,
        planName,
        serviceTypeCode: typeCode as PlanDto['serviceTypeCode'],
        currentRateCentavos: account.currentRateCentavos,
        billingDay: account.billingDay,
        dueDay: account.dueDay,
        billingStartDate: account.billingStartDate,
        status: account.status,
        activationDate: account.activationDate?.toISOString() ?? null,
      })),
      events: events.map((event) => ({
        id: event.id,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async activity(
    subscriberId: string,
    query: SubscriberActivityQuery,
    permissions: readonly PermissionCode[],
  ): Promise<Paginated<SubscriberActivityDto>> {
    const [subscriber] = await this.db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId));
    if (!subscriber) throw new MasterDataError(404, 'Subscriber not found.');

    const activityRows = sql`
      select 'subscriber:' || se.id::text as id, se.created_at as "occurredAt",
        'SUBSCRIBER'::text as category,
        ('Subscriber status changed to ' || se.new_status::text) as label,
        null::text as reference, se.new_status::text as status,
        null::bigint as "amountCentavos", se.reason as reason
      from subscriber_events se where se.subscriber_id = ${subscriberId}
      union all
      select 'service:' || ev.id::text, ev.created_at,
        'SERVICE'::text, ('Service status changed to ' || ev.new_status::text),
        sa.account_number, ev.new_status::text, null::bigint, ev.reason
      from service_events ev join service_accounts sa on sa.id = ev.service_account_id
      where sa.subscriber_id = ${subscriberId}
      union all
      select 'invoice:' || i.id::text, coalesce(i.finalized_at, i.created_at),
        'BILLING'::text, 'Invoice issued'::text, i.invoice_number,
        i.status::text, i.total_centavos, i.void_reason
      from invoices i where i.subscriber_id = ${subscriberId} and i.status <> 'DRAFT'
      union all
      select 'adjustment:' || a.id::text, a.created_at,
        'BILLING'::text, 'Invoice adjustment'::text, i.invoice_number,
        null::text, a.amount_centavos, a.reason
      from adjustments a join invoices i on i.id = a.invoice_id
      where i.subscriber_id = ${subscriberId}
      union all
      select 'payment:' || p.id::text, p.payment_date,
        'PAYMENT'::text, 'Payment recorded'::text,
        coalesce(r.receipt_number, p.reference_number), p.status::text,
        p.amount_centavos, p.rejected_reason
      from payments p left join receipts r on r.payment_id = p.id
      where p.subscriber_id = ${subscriberId}
      union all
      select 'reversal:' || rev.id::text, rev.created_at,
        'PAYMENT'::text, 'Payment reversed'::text,
        coalesce(r.receipt_number, p.reference_number), 'REVERSED'::text,
        p.amount_centavos, rev.reason
      from payment_reversals rev join payments p on p.id = rev.payment_id
      left join receipts r on r.payment_id = p.id
      where p.subscriber_id = ${subscriberId}
      union all
      select 'collection:' || ba.id::text, ba.created_at,
        'COLLECTION'::text, 'Added to collection route'::text,
        cb.batch_date::text, cb.status::text, ba.total_due_centavos,
        null::text
      from batch_accounts ba join collection_batches cb on cb.id = ba.batch_id
      where ba.subscriber_id = ${subscriberId}
    `;
    const offset = (query.page - 1) * query.pageSize;
    const permittedCategories = [
      'SUBSCRIBER',
      ...(permissions.includes('service.view') ? ['SERVICE'] : []),
      ...(permissions.includes('billing.view') ? ['BILLING'] : []),
      ...(permissions.includes('payment.view') ? ['PAYMENT'] : []),
      ...(permissions.includes('collection.view') ? ['COLLECTION'] : []),
    ];
    const allowedCategorySql = sql.join(
      permittedCategories.map((category) => sql`${category}`),
      sql`, `,
    );
    const [rows, countRows] = await Promise.all([
      this.db.execute(sql`
        select * from (${activityRows}) as activity
        where activity.category in (${allowedCategorySql})
        order by activity."occurredAt" desc, activity.id desc
        limit ${query.pageSize} offset ${offset}
      `),
      this.db.execute(sql`
        select count(*)::int as total from (${activityRows}) as activity
        where activity.category in (${allowedCategorySql})
      `),
    ]);
    return {
      items: rows.rows.map((row) => ({
        id: String(row.id),
        occurredAt: new Date(String(row.occurredAt)).toISOString(),
        category: String(row.category) as SubscriberActivityDto['category'],
        label: String(row.label),
        reference: row.reference === null ? null : String(row.reference),
        status: row.status === null ? null : String(row.status),
        amountCentavos:
          row.amountCentavos === null ? null : Number(row.amountCentavos),
        reason: row.reason === null ? null : String(row.reason),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(countRows.rows[0]?.total ?? 0),
    };
  }

  async changeSubscriberStatus(
    id: string,
    input: SubscriberStatusChange,
    actorUserId: string,
  ) {
    const [current] = await this.db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, id));
    if (!current) throw new MasterDataError(404, 'Subscriber not found.');
    if (current.status === input.status) return this.profile(id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(subscribers)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(subscribers.id, id));
      await tx.insert(subscriberEvents).values({
        subscriberId: id,
        previousStatus: current.status,
        newStatus: input.status,
        reason: input.reason,
        actorUserId,
      });
      await tx.insert(auditLogs).values({
        actorUserId,
        action: 'SUBSCRIBER_STATUS_CHANGED',
        entityType: 'subscriber',
        entityId: id,
        reason: input.reason,
        oldValues: { status: current.status },
        newValues: { status: input.status },
      });
    });
    return this.profile(id);
  }

  async createServiceAccount(
    subscriberId: string,
    input: CreateServiceAccount,
    actorUserId: string,
  ) {
    const [subscriber, plan] = await Promise.all([
      this.db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, subscriberId))
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(servicePlans)
        .where(
          and(
            eq(servicePlans.id, input.planId),
            eq(servicePlans.isActive, true),
          ),
        )
        .then((rows) => rows[0]),
    ]);
    if (!subscriber) throw new MasterDataError(404, 'Subscriber not found.');
    if (subscriber.status === 'ARCHIVED')
      throw new MasterDataError(
        409,
        'Archived subscribers cannot receive a new service account.',
      );
    if (!plan) throw new MasterDataError(404, 'Active plan not found.');
    try {
      const [created] = await this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(serviceAccounts)
          .values({
            subscriberId,
            accountNumber: input.accountNumber.toUpperCase(),
            planId: input.planId,
            installationAddressId: input.installationAddressId ?? null,
            assignedCollectorId: input.assignedCollectorId ?? null,
            billingDay: input.billingDay,
            dueDay: input.dueDay,
            billingStartDate: input.billingStartDate,
            activationDate: input.activationDate
              ? new Date(input.activationDate)
              : null,
            status: input.status,
            currentRateCentavos: plan.priceCentavos,
          })
          .returning();
        const account = rows[0];
        if (!account) throw new Error('Service account insert failed.');
        await tx.insert(serviceEvents).values({
          serviceAccountId: account.id,
          newStatus: account.status,
          reason: 'Service account created.',
          actorUserId,
        });
        await tx.insert(auditLogs).values({
          actorUserId,
          action: 'SERVICE_ACCOUNT_CREATED',
          entityType: 'service_account',
          entityId: account.id,
          newValues: {
            accountNumber: account.accountNumber,
            currentRateCentavos: account.currentRateCentavos,
          },
        });
        return rows;
      });
      return created;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new MasterDataError(
          409,
          'Service account number already exists.',
        );
      throw error;
    }
  }

  async changeServiceStatus(
    id: string,
    input: ServiceStatusChange,
    actorUserId: string,
  ) {
    const [current] = await this.db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id));
    if (!current) throw new MasterDataError(404, 'Service account not found.');
    await this.db.transaction(async (tx) => {
      await tx
        .update(serviceAccounts)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(serviceAccounts.id, id));
      await tx.insert(serviceEvents).values({
        serviceAccountId: id,
        previousStatus: current.status,
        newStatus: input.status,
        reason: input.reason,
        actorUserId,
      });
      await tx.insert(auditLogs).values({
        actorUserId,
        action: 'SERVICE_STATUS_CHANGED',
        entityType: 'service_account',
        entityId: id,
        reason: input.reason,
        oldValues: { status: current.status },
        newValues: { status: input.status },
      });
    });
    return { id, status: input.status };
  }

  private async summary(id: string): Promise<SubscriberSummaryDto> {
    const profile = await this.profile(id);
    return {
      id: profile.id,
      accountNumber: profile.accountNumber,
      fullName: profile.fullName,
      status: profile.status,
      primaryContact: profile.primaryContact,
      primaryAddress: profile.primaryAddress,
      serviceCount: profile.serviceCount,
    };
  }

  private async audit(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    newValues: Record<string, unknown>,
    reason?: string,
  ) {
    await this.db.insert(auditLogs).values({
      actorUserId,
      action,
      entityType,
      entityId,
      newValues,
      ...(reason ? { reason } : {}),
    });
  }
}
