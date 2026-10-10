import {
  permissionCodes,
  type PermissionCode,
  type RoleCode,
} from '@bcis/contracts';
import {
  createDatabaseConnection,
  billingCycles,
  collectionAreas,
  collectionBatches,
  collectorAreaAssignments,
  collectors,
  delinquencySettings,
  invoiceItems,
  invoices,
  ledgerEntries,
  permissions,
  payments,
  rolePermissions,
  roles,
  reconnectionRecords,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscriberAddresses,
  subscriberContacts,
  subscriberEvents,
  subscribers,
  suspensionRecords,
  userRoles,
  users,
} from '@bcis/database';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

import { hashPassword } from './auth.js';
import { BillingService } from './billing.js';
import { CollectionService } from './collections.js';
import { PaymentService } from './payments.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});

const seedEnvironment = z
  .object({
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    SEED_OWNER_USERNAME: z.string().min(3).default('owner'),
    SEED_OWNER_EMAIL: z.email().default('owner@example.test'),
    SEED_OWNER_PASSWORD: z.string().min(8),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        message: 'The development seed cannot run in production.',
      });
    }
    if (/replace|password/i.test(value.SEED_OWNER_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_OWNER_PASSWORD'],
        message: 'Choose a non-placeholder lab password.',
      });
    }
  })
  .parse(process.env);

const roleDefinitions: Array<{
  code: RoleCode;
  name: string;
  description: string;
  permissions: PermissionCode[];
}> = [
  {
    code: 'OWNER',
    name: 'Owner / Super Admin',
    description: 'Full system administration and recovery access.',
    permissions: [...permissionCodes],
  },
  {
    code: 'ADMINISTRATOR',
    name: 'Administrator',
    description:
      'Manages subscribers, billing, operations, users, and reports.',
    permissions: permissionCodes.filter(
      (code) =>
        !['backup.create', 'backup.restore', 'settings.manage'].includes(code),
    ),
  },
  {
    code: 'CASHIER',
    name: 'Cashier',
    description: 'Searches accounts and records verified payments.',
    permissions: [
      'subscriber.view',
      'billing.view',
      'payment.view',
      'payment.create',
      'payment.verify_gcash',
    ],
  },
  {
    code: 'COLLECTION_SUPERVISOR',
    name: 'Collection Supervisor',
    description: 'Supervises collections, reversals, and reconciliation.',
    permissions: [
      'subscriber.view',
      'billing.view',
      'payment.view',
      'payment.create',
      'payment.reverse',
      'payment.verify_gcash',
      'collection.view',
      'collection.reconcile',
      'receivable.view',
      'receivable.manage',
      'report.view',
      'report.export',
    ],
  },
  {
    code: 'ACCOUNTING_AUDITOR',
    name: 'Accounting / Auditor',
    description: 'Reviews receivables, reports, reversals, and audit history.',
    permissions: [
      'billing.view',
      'payment.view',
      'collection.view',
      'receivable.view',
      'report.view',
      'report.export',
      'audit.view',
    ],
  },
  {
    code: 'TECHNICIAN',
    name: 'Technician',
    description: 'Views subscribers and manages service status.',
    permissions: ['subscriber.view', 'service.view', 'service.manage'],
  },
  {
    code: 'READ_ONLY_VIEWER',
    name: 'Read-only Viewer',
    description: 'Reads operational and financial information without changes.',
    permissions: [
      'subscriber.view',
      'billing.view',
      'payment.view',
      'collection.view',
      'receivable.view',
      'service.view',
      'report.view',
    ],
  },
];

const database = createDatabaseConnection(seedEnvironment.DATABASE_URL);

const subscriberNames = [
  'Maria Santos',
  'Jose Reyes',
  'Ana Cruz',
  'Carlo Mendoza',
  'Liza Garcia',
  'Ramon Bautista',
  'Angela Torres',
  'Paulo Navarro',
  'Teresa Flores',
  'Miguel Ramos',
  'Sofia Villanueva',
  'Daniel Aquino',
  'Cristina Lopez',
  'Roberto Castillo',
  'Jasmine Dela Cruz',
  'Ernesto Mercado',
  'Camille Fernandez',
  'Noel Gonzales',
  'Marissa Valdez',
  'Victor Salazar',
  'Patricia Lim',
  'Anthony Romero',
  'Grace Pascual',
  'Benjamin Tan',
  'Nicole Evangelista',
  'Lorenzo Manalo',
  'Katrina Soriano',
  'Mark Alonzo',
  'Beatriz Santiago',
  'Dennis Cabrera',
  'Irene Dominguez',
  'Samuel Herrera',
  'Clarissa Padilla',
  'Joel Marquez',
  'Vanessa Medina',
  'Oscar de Leon',
  'Rachel Valenzuela',
  'Francis Macapagal',
  'Evelyn Aguilar',
  'Nathaniel Natividad',
  'Diana Rosales',
  'Albert Co',
  'Janine Araneta',
  'Ricardo Guevarra',
  'Melanie Yabut',
  'Arthur Pangilinan',
  'Shiela Zamora',
  'Gabriel Abad',
  'Monica Tolentino',
  'Luis Escobar',
] as const;

const agingSubscriberNames = [
  'Renato de Vera',
  'Elena Pineda',
  'Arnold Sy',
  'Lourdes Chua',
  'Kevin Go',
  'Cecilia Yu',
  'Marvin Ong',
  'Rowena Chua',
  'Jerome Dee',
  'Belinda Uy',
  'Rolando Sison',
  'Imelda Corpuz',
] as const;

const streetNames = [
  'Mabini Street',
  'Rizal Avenue',
  'Bonifacio Street',
  'Luna Street',
  'Del Pilar Street',
  'Jacinto Street',
] as const;
const barangayNames = [
  'Barangay San Roque',
  'Barangay Maligaya',
  'Barangay San Isidro',
  'Barangay Mabuhay',
] as const;

function residentialAddress(index: number, areaName: string) {
  return `${100 + index} ${streetNames[(index - 1) % streetNames.length]}, ${barangayNames[(index - 1) % barangayNames.length]}, ${areaName}`;
}

try {
  for (const code of permissionCodes) {
    await database.db
      .insert(permissions)
      .values({ code, description: code.replaceAll('.', ' ') })
      .onConflictDoUpdate({
        target: permissions.code,
        set: { description: code.replaceAll('.', ' '), updatedAt: new Date() },
      });
  }

  for (const role of roleDefinitions) {
    await database.db
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.code,
        set: {
          name: role.name,
          description: role.description,
          updatedAt: new Date(),
        },
      });
  }

  const storedRoles = await database.db.select().from(roles);
  const storedPermissions = await database.db.select().from(permissions);
  const managedRoleIds = storedRoles
    .filter((role) => roleDefinitions.some(({ code }) => code === role.code))
    .map(({ id }) => id);
  if (managedRoleIds.length) {
    await database.db
      .delete(rolePermissions)
      .where(inArray(rolePermissions.roleId, managedRoleIds));
  }
  for (const definition of roleDefinitions) {
    const role = storedRoles.find(({ code }) => code === definition.code);
    if (!role) throw new Error(`Seed role missing: ${definition.code}`);
    for (const code of definition.permissions) {
      const permission = storedPermissions.find((item) => item.code === code);
      if (!permission) throw new Error(`Seed permission missing: ${code}`);
      await database.db.insert(rolePermissions).values({
        roleId: role.id,
        permissionId: permission.id,
      });
    }
  }

  const username = seedEnvironment.SEED_OWNER_USERNAME.trim().toLowerCase();
  const passwordHash = await hashPassword(seedEnvironment.SEED_OWNER_PASSWORD);
  const [owner] = await database.db
    .insert(users)
    .values({
      username,
      email: seedEnvironment.SEED_OWNER_EMAIL.trim().toLowerCase(),
      fullName: 'Miguel Antonio Reyes',
      passwordHash,
      mustChangePassword: true,
    })
    .onConflictDoUpdate({
      target: users.username,
      set: {
        email: seedEnvironment.SEED_OWNER_EMAIL.trim().toLowerCase(),
        fullName: 'Miguel Antonio Reyes',
        passwordHash,
        isActive: true,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });
  const ownerRole = storedRoles.find(({ code }) => code === 'OWNER');
  if (!ownerRole) throw new Error('Owner role was not seeded.');
  if (!owner) throw new Error('Development owner was not seeded.');
  await database.db.delete(userRoles).where(eq(userRoles.userId, owner.id));
  await database.db.insert(userRoles).values({
    userId: owner.id,
    roleId: ownerRole.id,
  });

  const staffUsers: Array<{
    username: string;
    email: string;
    fullName: string;
    roleCode: RoleCode;
  }> = [
    {
      username: 'administrator',
      email: 'administrator@example.test',
      fullName: 'Patricia Mae Lim',
      roleCode: 'ADMINISTRATOR',
    },
    {
      username: 'cashier',
      email: 'cashier@example.test',
      fullName: 'Angela Marie Cruz',
      roleCode: 'CASHIER',
    },
    {
      username: 'collection.supervisor',
      email: 'collection.supervisor@example.test',
      fullName: 'Roberto Garcia',
      roleCode: 'COLLECTION_SUPERVISOR',
    },
    {
      username: 'auditor',
      email: 'auditor@example.test',
      fullName: 'Teresa Villanueva',
      roleCode: 'ACCOUNTING_AUDITOR',
    },
    {
      username: 'technician',
      email: 'technician@example.test',
      fullName: 'Daniel Bautista',
      roleCode: 'TECHNICIAN',
    },
  ];
  for (const staff of staffUsers) {
    const [user] = await database.db
      .insert(users)
      .values({
        username: staff.username,
        email: staff.email,
        fullName: staff.fullName,
        passwordHash,
        mustChangePassword: true,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          email: staff.email,
          fullName: staff.fullName,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });
    const role = storedRoles.find(({ code }) => code === staff.roleCode);
    if (!user || !role)
      throw new Error(`Staff user role missing: ${staff.roleCode}`);
    await database.db.delete(userRoles).where(eq(userRoles.userId, user.id));
    await database.db.insert(userRoles).values({
      userId: user.id,
      roleId: role.id,
    });
  }

  const typeSeeds = [
    { code: 'INTERNET', name: 'Internet' },
    { code: 'CABLE', name: 'Cable Television' },
    { code: 'COMBO', name: 'Internet + Cable' },
  ];
  for (const item of typeSeeds) {
    await database.db
      .insert(serviceTypes)
      .values(item)
      .onConflictDoUpdate({
        target: serviceTypes.code,
        set: { name: item.name, isActive: true, updatedAt: new Date() },
      });
  }
  const storedTypes = await database.db.select().from(serviceTypes);
  const typeId = (code: string) => {
    const row = storedTypes.find((item) => item.code === code);
    if (!row) throw new Error(`Service type missing: ${code}`);
    return row.id;
  };
  const planSeeds = [
    {
      code: 'NET-25',
      name: 'Internet 25',
      type: 'INTERNET',
      priceCentavos: 79900,
      speedMbps: 25,
      channelCount: null,
    },
    {
      code: 'NET-50',
      name: 'Internet 50',
      type: 'INTERNET',
      priceCentavos: 109900,
      speedMbps: 50,
      channelCount: null,
    },
    {
      code: 'NET-100',
      name: 'Internet 100',
      type: 'INTERNET',
      priceCentavos: 149900,
      speedMbps: 100,
      channelCount: null,
    },
    {
      code: 'TV-BASIC',
      name: 'Cable Basic',
      type: 'CABLE',
      priceCentavos: 55000,
      speedMbps: null,
      channelCount: 60,
    },
    {
      code: 'TV-PLUS',
      name: 'Cable Plus',
      type: 'CABLE',
      priceCentavos: 75000,
      speedMbps: null,
      channelCount: 95,
    },
    {
      code: 'COMBO-25',
      name: 'Combo 25',
      type: 'COMBO',
      priceCentavos: 119900,
      speedMbps: 25,
      channelCount: 60,
    },
    {
      code: 'COMBO-50',
      name: 'Combo 50',
      type: 'COMBO',
      priceCentavos: 159900,
      speedMbps: 50,
      channelCount: 95,
    },
  ];
  for (const item of planSeeds) {
    await database.db
      .insert(servicePlans)
      .values({
        code: item.code,
        name: item.name,
        serviceTypeId: typeId(item.type),
        priceCentavos: item.priceCentavos,
        speedMbps: item.speedMbps,
        channelCount: item.channelCount,
      })
      .onConflictDoUpdate({
        target: servicePlans.code,
        set: {
          name: item.name,
          serviceTypeId: typeId(item.type),
          priceCentavos: item.priceCentavos,
          speedMbps: item.speedMbps,
          channelCount: item.channelCount,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }

  const areaSeeds = [
    { code: 'NORTH', name: 'North District' },
    { code: 'CENTRAL', name: 'Central District' },
    { code: 'SOUTH', name: 'South District' },
  ];
  for (const item of areaSeeds) {
    await database.db
      .insert(collectionAreas)
      .values(item)
      .onConflictDoUpdate({
        target: collectionAreas.code,
        set: { name: item.name, isActive: true, updatedAt: new Date() },
      });
  }
  const collectorSeeds = [
    {
      code: 'COL-001',
      fullName: 'Alexander Rivera',
      contactNumber: '09171234567',
    },
    {
      code: 'COL-002',
      fullName: 'Jaime Santos',
      contactNumber: '09182345678',
    },
  ];
  for (const item of collectorSeeds) {
    await database.db
      .insert(collectors)
      .values(item)
      .onConflictDoUpdate({
        target: collectors.code,
        set: {
          fullName: item.fullName,
          contactNumber: item.contactNumber,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  const storedAreas = await database.db.select().from(collectionAreas);
  const storedCollectors = await database.db.select().from(collectors);
  for (let index = 0; index < storedAreas.length; index += 1) {
    const area = storedAreas[index];
    const collector = storedCollectors[index % storedCollectors.length];
    if (area && collector)
      await database.db
        .insert(collectorAreaAssignments)
        .values({ collectionAreaId: area.id, collectorId: collector.id })
        .onConflictDoNothing();
  }

  const storedPlans = await database.db.select().from(servicePlans);
  for (let index = 1; index <= 50; index += 1) {
    const accountNumber = `SUB-${String(index).padStart(5, '0')}`;
    const fullName = subscriberNames[index - 1];
    const area = storedAreas[(index - 1) % storedAreas.length];
    const collector = storedCollectors[(index - 1) % storedCollectors.length];
    if (!fullName || !area || !collector)
      throw new Error('Seed subscriber reference missing.');
    const [subscriber] = await database.db
      .insert(subscribers)
      .values({
        accountNumber,
        fullName,
        collectionAreaId: area.id,
        assignedCollectorId: collector.id,
        notes: 'Residential subscriber account.',
      })
      .onConflictDoUpdate({
        target: subscribers.accountNumber,
        set: {
          fullName,
          collectionAreaId: area.id,
          assignedCollectorId: collector.id,
          notes: 'Residential subscriber account.',
          updatedAt: new Date(),
        },
      })
      .returning({ id: subscribers.id });
    if (!subscriber) throw new Error('Seed subscriber missing.');
    const existingAddress = await database.db
      .select({ id: subscriberAddresses.id })
      .from(subscriberAddresses)
      .where(eq(subscriberAddresses.subscriberId, subscriber.id));
    const addressLine = residentialAddress(index, area.name);
    if (!existingAddress.length) {
      await database.db.insert(subscriberAddresses).values({
        subscriberId: subscriber.id,
        label: 'Service address',
        addressLine,
        isPrimary: true,
      });
      await database.db.insert(subscriberContacts).values({
        subscriberId: subscriber.id,
        type: 'MOBILE',
        value: `0918${String(index).padStart(7, '0')}`,
        isPrimary: true,
      });
      await database.db.insert(subscriberEvents).values({
        subscriberId: subscriber.id,
        newStatus: 'ACTIVE',
        reason: 'Residential account activated.',
        actorUserId: owner.id,
      });
    } else if (existingAddress[0]) {
      await database.db
        .update(subscriberAddresses)
        .set({ addressLine, updatedAt: new Date() })
        .where(eq(subscriberAddresses.id, existingAddress[0].id));
    }
    await database.db
      .update(subscriberEvents)
      .set({ reason: 'Residential account activated.' })
      .where(
        and(
          eq(subscriberEvents.subscriberId, subscriber.id),
          eq(subscriberEvents.reason, 'Seeded subscriber.'),
        ),
      );
    const serviceCount = index <= 10 ? 2 : 1;
    for (
      let serviceIndex = 1;
      serviceIndex <= serviceCount;
      serviceIndex += 1
    ) {
      const plan = storedPlans[(index + serviceIndex - 2) % storedPlans.length];
      if (!plan) throw new Error('Seed plan missing.');
      const serviceNumber = `SVC-${String(index).padStart(5, '0')}-${serviceIndex}`;
      const [service] = await database.db
        .insert(serviceAccounts)
        .values({
          subscriberId: subscriber.id,
          accountNumber: serviceNumber,
          planId: plan.id,
          assignedCollectorId: collector.id,
          currentRateCentavos: plan.priceCentavos,
          billingDay: ((index - 1) % 28) + 1,
          activationDate: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        })
        .onConflictDoUpdate({
          target: serviceAccounts.accountNumber,
          set: {
            subscriberId: subscriber.id,
            planId: plan.id,
            assignedCollectorId: collector.id,
            billingDay: ((index - 1) % 28) + 1,
            updatedAt: new Date(),
          },
        })
        .returning({ id: serviceAccounts.id });
      if (service) {
        const events = await database.db
          .select({ id: serviceEvents.id })
          .from(serviceEvents)
          .where(eq(serviceEvents.serviceAccountId, service.id));
        if (!events.length)
          await database.db.insert(serviceEvents).values({
            serviceAccountId: service.id,
            newStatus: 'ACTIVE',
            reason: 'Service activated.',
            actorUserId: owner.id,
          });
        await database.db
          .update(serviceEvents)
          .set({ reason: 'Service activated.' })
          .where(
            and(
              eq(serviceEvents.serviceAccountId, service.id),
              eq(serviceEvents.reason, 'Seeded active service.'),
            ),
          );
      }
    }
  }

  const billingService = new BillingService(database.db);
  for (const periodMonth of [8, 9, 10]) {
    const generated = await billingService.generateDrafts(
      { periodYear: 2026, periodMonth },
      owner.id,
    );
    await billingService.finalizeCycle(generated.cycleId, owner.id);
  }

  const legacyLabSubscribers = await database.db
    .select({ id: subscribers.id, accountNumber: subscribers.accountNumber })
    .from(subscribers)
    .where(
      or(
        like(subscribers.accountNumber, 'DEMO-%'),
        like(subscribers.accountNumber, 'SUB-E2E-%'),
      ),
    );
  for (const [index, subscriber] of legacyLabSubscribers.entries()) {
    const suffix = subscriber.accountNumber.replace(/^(DEMO|SUB-E2E)-/, '');
    await database.db
      .update(subscribers)
      .set({
        accountNumber: `SUB-${suffix}`,
        fullName: 'Rafael Villanueva',
        notes: 'Residential subscriber account.',
      })
      .where(eq(subscribers.id, subscriber.id));
    await database.db
      .update(subscriberAddresses)
      .set({
        addressLine: residentialAddress(index + 70, 'Central District'),
        updatedAt: new Date(),
      })
      .where(eq(subscriberAddresses.subscriberId, subscriber.id));
    const legacyServices = await database.db
      .select({
        id: serviceAccounts.id,
        accountNumber: serviceAccounts.accountNumber,
      })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, subscriber.id));
    for (const service of legacyServices) {
      const serviceNumber = service.accountNumber.replace(
        /^(DEMO-SVC|SVC-E2E)-/,
        'SVC-',
      );
      await database.db
        .update(serviceAccounts)
        .set({ accountNumber: serviceNumber })
        .where(eq(serviceAccounts.id, service.id));
    }
  }

  await database.db
    .insert(delinquencySettings)
    .values({
      id: 1,
      gracePeriodDays: 7,
      suspensionThresholdDays: 60,
      reconnectionFeeCentavos: 50_000,
      updatedByUserId: owner.id,
    })
    .onConflictDoNothing();

  const agingSeeds = [
    { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-31' },
    { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-31' },
    { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-15' },
    { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-15' },
    { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-15' },
    { periodYear: 2026, periodMonth: 9, dueDate: '2026-09-15' },
    { periodYear: 2026, periodMonth: 9, dueDate: '2026-09-15' },
    { periodYear: 2026, periodMonth: 9, dueDate: '2026-09-15' },
    { periodYear: 2026, periodMonth: 8, dueDate: '2026-08-15' },
    { periodYear: 2026, periodMonth: 8, dueDate: '2026-08-15' },
    { periodYear: 2026, periodMonth: 7, dueDate: '2026-07-15' },
    { periodYear: 2026, periodMonth: 7, dueDate: '2026-07-15' },
  ];
  const task7Subscribers: Array<{ id: string }> = [];
  for (let index = 0; index < agingSeeds.length; index += 1) {
    const accountNumber = `SUB-${String(index + 51).padStart(5, '0')}`;
    const legacyAccountNumber = `T7-SUB-${String(index + 1).padStart(3, '0')}`;
    const fullName = agingSubscriberNames[index];
    const area = storedAreas[index % storedAreas.length];
    const collector = storedCollectors[index % storedCollectors.length];
    if (!fullName || !area || !collector)
      throw new Error('Task 7 subscriber seed references are missing.');
    const [existingSubscriber] = await database.db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.accountNumber, accountNumber))
      .limit(1);
    if (!existingSubscriber)
      await database.db
        .update(subscribers)
        .set({ accountNumber })
        .where(eq(subscribers.accountNumber, legacyAccountNumber));
    const [subscriber] = await database.db
      .insert(subscribers)
      .values({
        accountNumber,
        fullName,
        collectionAreaId: area.id,
        assignedCollectorId: collector.id,
        notes: 'Residential account included in receivables review.',
      })
      .onConflictDoUpdate({
        target: subscribers.accountNumber,
        set: {
          fullName,
          collectionAreaId: area.id,
          assignedCollectorId: collector.id,
          notes: 'Residential account included in receivables review.',
          updatedAt: new Date(),
        },
      })
      .returning({ id: subscribers.id });
    if (!subscriber) throw new Error('Task 7 subscriber seed missing.');
    const [existingAddress] = await database.db
      .select({ id: subscriberAddresses.id })
      .from(subscriberAddresses)
      .where(eq(subscriberAddresses.subscriberId, subscriber.id))
      .limit(1);
    const addressLine = residentialAddress(index + 51, area.name);
    if (existingAddress)
      await database.db
        .update(subscriberAddresses)
        .set({ addressLine, updatedAt: new Date() })
        .where(eq(subscriberAddresses.id, existingAddress.id));
    else
      await database.db.insert(subscriberAddresses).values({
        subscriberId: subscriber.id,
        label: 'Service address',
        addressLine,
        isPrimary: true,
      });
    task7Subscribers.push(subscriber);
  }
  const agingServices: Array<{
    account: typeof serviceAccounts.$inferSelect;
    plan: typeof servicePlans.$inferSelect;
  }> = [];
  for (let index = 0; index < agingSeeds.length; index += 1) {
    const subscriber = task7Subscribers[index];
    const plan = storedPlans[index % storedPlans.length];
    const collector = storedCollectors[index % storedCollectors.length];
    const accountNumber = `SVC-${String(index + 51).padStart(5, '0')}-1`;
    const legacyAccountNumber = `T7-SVC-${String(index + 1).padStart(3, '0')}`;
    if (!subscriber || !plan || !collector)
      throw new Error('Task 7 service seed references are missing.');
    const [existingService] = await database.db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.accountNumber, accountNumber))
      .limit(1);
    if (!existingService)
      await database.db
        .update(serviceAccounts)
        .set({ accountNumber })
        .where(eq(serviceAccounts.accountNumber, legacyAccountNumber));
    const [account] = await database.db
      .insert(serviceAccounts)
      .values({
        subscriberId: subscriber.id,
        accountNumber,
        planId: plan.id,
        assignedCollectorId: collector.id,
        currentRateCentavos: plan.priceCentavos,
        billingDay: 1,
        dueDay: 15,
        billingStartDate: '2026-01-01',
        activationDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: serviceAccounts.accountNumber,
        set: {
          subscriberId: subscriber.id,
          planId: plan.id,
          assignedCollectorId: collector.id,
          currentRateCentavos: plan.priceCentavos,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!account) throw new Error('Task 7 service seed missing.');
    agingServices.push({ account, plan });
  }
  for (let index = 0; index < agingSeeds.length; index += 1) {
    const seed = agingSeeds[index];
    const row = agingServices[index];
    if (!seed || !row) throw new Error('Task 7 aging seed service missing.');
    const [cycle] = await database.db
      .insert(billingCycles)
      .values({
        periodYear: seed.periodYear,
        periodMonth: seed.periodMonth,
        status: 'FINALIZED',
        createdByUserId: owner.id,
        finalizedAt: new Date('2026-10-01T00:00:00.000Z'),
      })
      .onConflictDoUpdate({
        target: [billingCycles.periodYear, billingCycles.periodMonth],
        set: { status: 'FINALIZED' },
      })
      .returning({ id: billingCycles.id });
    if (!cycle) throw new Error('Task 7 billing cycle seed missing.');
    const invoiceNumber = `INV-${seed.periodYear}${String(seed.periodMonth).padStart(2, '0')}-${String(900_001 + index).padStart(6, '0')}`;
    const billingPeriodLabel = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(seed.periodYear, seed.periodMonth - 1)));
    const description = `${row.plan.name} monthly subscription`;
    const invoiceValues = {
      invoiceNumber,
      billingCycleId: cycle.id,
      subscriberId: row.account.subscriberId,
      serviceAccountId: row.account.id,
      serviceAccountNumber: row.account.accountNumber,
      planName: row.plan.name,
      billingPeriodLabel,
      invoiceDate: `${seed.periodYear}-${String(seed.periodMonth).padStart(2, '0')}-01`,
      dueDate: seed.dueDate,
      subtotalCentavos: row.account.currentRateCentavos,
      totalCentavos: row.account.currentRateCentavos,
      status:
        seed.dueDate < '2026-10-31'
          ? ('OVERDUE' as const)
          : ('UNPAID' as const),
      finalizedAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date(),
    };
    const [existingInvoice] = await database.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.serviceAccountId, row.account.id),
          eq(invoices.billingCycleId, cycle.id),
        ),
      )
      .limit(1);
    const [invoice] = existingInvoice
      ? await database.db
          .update(invoices)
          .set(invoiceValues)
          .where(eq(invoices.id, existingInvoice.id))
          .returning({ id: invoices.id })
      : await database.db
          .insert(invoices)
          .values(invoiceValues)
          .returning({ id: invoices.id });
    if (!invoice) throw new Error('Task 7 invoice seed missing.');
    const [existingItem] = await database.db
      .select({ id: invoiceItems.id })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoice.id))
      .limit(1);
    if (!existingItem)
      await database.db.insert(invoiceItems).values({
        invoiceId: invoice.id,
        type: 'SUBSCRIPTION',
        description,
        amountCentavos: row.account.currentRateCentavos,
      });
    else
      await database.db
        .update(invoiceItems)
        .set({ description, amountCentavos: row.account.currentRateCentavos })
        .where(eq(invoiceItems.id, existingItem.id));
    await database.db
      .insert(ledgerEntries)
      .values({
        subscriberId: row.account.subscriberId,
        invoiceId: invoice.id,
        entryType: 'INVOICE_DEBIT',
        reference: invoiceNumber,
        description,
        debitCentavos: row.account.currentRateCentavos,
        occurredAt: new Date(
          `${seed.periodYear}-${String(seed.periodMonth).padStart(2, '0')}-01T00:00:00.000Z`,
        ),
      })
      .onConflictDoNothing();
    await database.db
      .update(ledgerEntries)
      .set({ reference: invoiceNumber, description })
      .where(eq(ledgerEntries.invoiceId, invoice.id));
  }

  const scenarioServices = agingServices
    .slice(0, 2)
    .map(({ account }) => account);
  for (const [index, service] of scenarioServices.entries()) {
    const reason = [
      'Temporary suspension due to overdue balance.',
      'Service suspended after repeated overdue notices.',
    ][index];
    const reconnectionReason = 'Outstanding balance cleared.';
    const technician = ['Daniel Bautista', 'Marco Dizon'][index];
    if (!reason || !technician)
      throw new Error('Service-control scenario details missing.');
    const [existing] = await database.db
      .select({ id: suspensionRecords.id })
      .from(suspensionRecords)
      .where(eq(suspensionRecords.serviceAccountId, service.id))
      .limit(1);
    if (existing) {
      await database.db
        .update(suspensionRecords)
        .set({ reason, notes: 'Balance settled and service restored.' })
        .where(eq(suspensionRecords.id, existing.id));
      await database.db
        .update(reconnectionRecords)
        .set({
          reason: reconnectionReason,
          technician,
          notes: 'Balance settled and service restored.',
        })
        .where(eq(reconnectionRecords.suspensionRecordId, existing.id));
      await database.db
        .update(serviceEvents)
        .set({ reason })
        .where(
          and(
            eq(serviceEvents.serviceAccountId, service.id),
            eq(serviceEvents.newStatus, 'SUSPENDED'),
          ),
        );
      await database.db
        .update(serviceEvents)
        .set({ reason: reconnectionReason })
        .where(
          and(
            eq(serviceEvents.serviceAccountId, service.id),
            eq(serviceEvents.newStatus, 'ACTIVE'),
          ),
        );
      continue;
    }
    const [suspension] = await database.db
      .insert(suspensionRecords)
      .values({
        serviceAccountId: service.id,
        reason,
        effectiveDate: `2026-${String(8 + index).padStart(2, '0')}-20`,
        notes: 'Balance settled and service restored.',
        approvedByUserId: owner.id,
      })
      .returning();
    if (!suspension) throw new Error('Task 7 suspension scenario missing.');
    await database.db.insert(reconnectionRecords).values({
      serviceAccountId: service.id,
      suspensionRecordId: suspension.id,
      status: 'COMPLETED',
      reason: reconnectionReason,
      technician,
      requestDate: `2026-${String(9 + index).padStart(2, '0')}-01`,
      completionDate: `2026-${String(9 + index).padStart(2, '0')}-02`,
      feeCentavos: 50_000,
      notes: 'Balance settled and service restored.',
      approvedByUserId: owner.id,
      completedByUserId: owner.id,
    });
    await database.db.insert(serviceEvents).values([
      {
        serviceAccountId: service.id,
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        reason,
        actorUserId: owner.id,
        createdAt: new Date(
          `2026-${String(8 + index).padStart(2, '0')}-20T00:00:00.000Z`,
        ),
      },
      {
        serviceAccountId: service.id,
        previousStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
        reason: reconnectionReason,
        actorUserId: owner.id,
        createdAt: new Date(
          `2026-${String(9 + index).padStart(2, '0')}-02T00:00:00.000Z`,
        ),
      },
    ]);
  }

  const paymentService = new PaymentService(
    database.db,
    resolve(process.env.ATTACHMENT_DIRECTORY ?? './storage/attachments'),
  );
  const operationalSubscribers = await database.db
    .select({ id: subscribers.id, accountNumber: subscribers.accountNumber })
    .from(subscribers)
    .where(
      inArray(
        subscribers.accountNumber,
        subscriberNames.map(
          (_, index) => `SUB-${String(index + 1).padStart(5, '0')}`,
        ),
      ),
    );
  const subscriberId = new Map(
    operationalSubscribers.map((subscriber) => [
      subscriber.accountNumber,
      subscriber.id,
    ]),
  );
  const officePaymentSeeds = [
    ['SUB-00001', 189_800, 'CASH', '2026-08-05T09:15:00.000Z'],
    ['SUB-00002', 219_800, 'CASH', '2026-08-06T10:20:00.000Z'],
    ['SUB-00003', 149_900, 'BANK_TRANSFER', '2026-08-08T13:05:00.000Z'],
    ['SUB-00004', 110_000, 'CHEQUE', '2026-08-12T11:40:00.000Z'],
    ['SUB-00005', 75_000, 'OTHER', '2026-08-18T15:10:00.000Z'],
    ['SUB-00006', 239_800, 'CASH', '2026-09-03T08:50:00.000Z'],
    ['SUB-00007', 80_000, 'CASH', '2026-09-05T14:25:00.000Z'],
    ['SUB-00008', 159_900, 'BANK_TRANSFER', '2026-09-09T09:35:00.000Z'],
    ['SUB-00009', 55_000, 'CHEQUE', '2026-09-12T10:45:00.000Z'],
    ['SUB-00010', 300_000, 'CASH', '2026-09-16T16:05:00.000Z'],
    ['SUB-00011', 109_900, 'CASH', '2026-10-01T08:40:00.000Z'],
    ['SUB-00012', 149_900, 'BANK_TRANSFER', '2026-10-02T11:30:00.000Z'],
    ['SUB-00013', 55_000, 'CASH', '2026-10-03T13:15:00.000Z'],
    ['SUB-00014', 75_000, 'CHEQUE', '2026-10-04T09:55:00.000Z'],
    ['SUB-00015', 119_900, 'CASH', '2026-10-05T15:35:00.000Z'],
    ['SUB-00016', 100_000, 'OTHER', '2026-10-06T10:10:00.000Z'],
  ] as const;
  for (const [
    accountNumber,
    amountCentavos,
    method,
    paymentDate,
  ] of officePaymentSeeds) {
    const referenceNumber = `OFFICE-${paymentDate.slice(0, 10).replaceAll('-', '')}-${accountNumber.slice(-2)}`;
    const [existing] = await database.db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.referenceNumber, referenceNumber))
      .limit(1);
    const id = subscriberId.get(accountNumber);
    if (!existing && id)
      await paymentService.create(
        {
          subscriberId: id,
          amountCentavos,
          method,
          paymentDate,
          referenceNumber,
          notes: 'Office payment received and acknowledged.',
        },
        owner.id,
      );
  }

  const proof = {
    filename: 'gcash-payment.png',
    mimeType: 'image/png',
    dataBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  };
  const gcashSeeds = [
    ['SUB-00017', 159_900, 'GCASH-202610-1001', 'APPROVE'],
    ['SUB-00018', 79_900, 'GCASH-202610-1002', 'APPROVE'],
    ['SUB-00019', 109_900, 'GCASH-202610-1003', 'PENDING'],
    ['SUB-00020', 149_900, 'GCASH-202610-1004', 'REJECT'],
  ] as const;
  for (const [
    accountNumber,
    amountCentavos,
    referenceNumber,
    decision,
  ] of gcashSeeds) {
    const id = subscriberId.get(accountNumber);
    if (!id) continue;
    let [payment] = await database.db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(eq(payments.referenceNumber, referenceNumber))
      .limit(1);
    if (!payment) {
      const created = await paymentService.submitGcash(
        {
          subscriberId: id,
          amountCentavos,
          referenceNumber,
          senderDetails: `${subscriberNames[Number(accountNumber.slice(-2)) - 1]} via GCash`,
          notes: 'Online payment submitted for verification.',
          proof,
        },
        owner.id,
      );
      payment = created;
    }
    if (payment.status === 'PENDING_VERIFICATION' && decision === 'APPROVE')
      await paymentService.decideGcash(payment.id, { decision }, owner.id);
    if (payment.status === 'PENDING_VERIFICATION' && decision === 'REJECT')
      await paymentService.decideGcash(
        payment.id,
        {
          decision,
          reason: 'Transaction reference could not be confirmed.',
        },
        owner.id,
      );
  }

  const collectionService = new CollectionService(database.db);
  const assignments = await database.db
    .select({
      collectorId: collectorAreaAssignments.collectorId,
      collectionAreaId: collectorAreaAssignments.collectionAreaId,
    })
    .from(collectorAreaAssignments);
  const batchSeeds = [
    { batchDate: '2026-10-03', target: 'CLOSED', paymentCount: 3 },
    { batchDate: '2026-10-07', target: 'IN_PROGRESS', paymentCount: 2 },
    { batchDate: '2026-10-08', target: 'SUBMITTED', paymentCount: 1 },
  ] as const;
  for (const [index, seed] of batchSeeds.entries()) {
    const assignment = assignments[index];
    if (!assignment) continue;
    let [batch] = await database.db
      .select({ id: collectionBatches.id })
      .from(collectionBatches)
      .where(
        and(
          eq(collectionBatches.collectorId, assignment.collectorId),
          eq(collectionBatches.collectionAreaId, assignment.collectionAreaId),
          eq(collectionBatches.batchDate, seed.batchDate),
        ),
      )
      .limit(1);
    if (!batch) {
      const created = await collectionService.create(
        { ...assignment, batchDate: seed.batchDate },
        owner.id,
      );
      batch = { id: created.id };
    }
    let detail = await collectionService.get(batch.id);
    if (detail.status === 'OPEN')
      detail = await collectionService.start(batch.id, owner.id);
    if (detail.status === 'IN_PROGRESS') {
      for (const [position, account] of detail.accounts
        .filter((candidate) => candidate.totalDueCentavos > 0)
        .slice(0, seed.paymentCount)
        .entries()) {
        const referenceNumber = `COLL-${seed.batchDate.replaceAll('-', '')}-${position + 1}`;
        const [existing] = await database.db
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.referenceNumber, referenceNumber))
          .limit(1);
        if (!existing)
          await paymentService.create(
            {
              subscriberId: account.subscriberId,
              batchAccountId: account.id,
              amountCentavos: Math.min(
                account.totalDueCentavos,
                100_000 + position * 25_000,
              ),
              method: 'CASH',
              paymentDate: `${seed.batchDate}T14:00:00.000Z`,
              referenceNumber,
              notes: 'House-to-house collection.',
            },
            owner.id,
          );
      }
      detail = await collectionService.get(batch.id);
    }
    if (seed.target !== 'IN_PROGRESS' && detail.status === 'IN_PROGRESS')
      detail = await collectionService.submit(batch.id, owner.id);
    if (seed.target === 'CLOSED' && detail.status === 'SUBMITTED')
      detail = await collectionService.remit(
        batch.id,
        {
          amountCentavos: detail.cashCollectedCentavos,
          notes: 'Cash counted and remitted at the office.',
        },
        owner.id,
      );
    if (seed.target === 'CLOSED' && detail.status === 'REMITTED')
      detail = await collectionService.reconcile(
        batch.id,
        detail.differenceCentavos,
        owner.id,
      );
    if (seed.target === 'CLOSED' && detail.status === 'RECONCILED')
      await collectionService.close(
        batch.id,
        detail.differenceCentavos,
        owner.id,
      );
  }

  process.stdout.write(
    'BCIS access control, realistic master data, billing, payments, collections, and receivables seeded.\n',
  );
} finally {
  await database.close();
}
