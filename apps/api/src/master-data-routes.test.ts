import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';
import { MasterDataError, type MasterDataService } from './master-data.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  fullName: 'Owner',
  roles: ['OWNER'],
  permissions: ['subscriber.view', 'subscriber.manage', 'service.manage'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
function service(overrides: Partial<MasterDataService> = {}) {
  return {
    references: vi.fn(async () => ({
      serviceTypes: [],
      collectionAreas: [],
      collectors: [],
      plans: [],
    })),
    listPlans: vi.fn(async () => []),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    listSubscribers: vi.fn(async () => ({
      items: [],
      page: 2,
      pageSize: 10,
      total: 25,
    })),
    createSubscriber: vi.fn(),
    profile: vi.fn(),
    activity: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })),
    changeSubscriberStatus: vi.fn(),
    createServiceAccount: vi.fn(),
    changeServiceStatus: vi.fn(),
    ...overrides,
  } as unknown as MasterDataService;
}
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 3 API contract', () => {
  it('authorizes and passes normalized pagination to server search', async () => {
    const masterData = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/subscribers?q=Rivera&page=2&pageSize=10',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(200);
    expect(masterData.listSubscribers).toHaveBeenCalledWith({
      q: 'Rivera',
      page: 2,
      pageSize: 10,
    });
    expect(auth.requirePermission).toHaveBeenCalledWith(
      'token',
      'subscriber.view',
    );
  });

  it('rejects invalid subscriber registration before persistence', async () => {
    const masterData = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subscribers',
      headers: { authorization: 'Bearer token' },
      payload: {
        accountNumber: 'A',
        fullName: '',
        addresses: [],
        contacts: [],
      },
    });
    expect(response.statusCode).toBe(422);
    expect(masterData.createSubscriber).not.toHaveBeenCalled();
  });

  it('returns a stable conflict response for duplicate account numbers', async () => {
    const masterData = service({
      createSubscriber: vi.fn(async () => {
        throw new MasterDataError(
          409,
          'Subscriber account number already exists.',
        );
      }) as never,
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subscribers',
      headers: { authorization: 'Bearer token' },
      payload: {
        accountNumber: 'SUB-900',
        fullName: 'Test Subscriber',
        addresses: [
          { label: 'Home', addressLine: '123 Test Street', isPrimary: true },
        ],
        contacts: [{ type: 'MOBILE', value: '09170000000', isPrimary: true }],
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      'Subscriber account number already exists.',
    );
  });

  it('accepts an optional plan change reason and passes it to audit persistence', async () => {
    const plan = {
      id: '00000000-0000-4000-8000-000000000010',
      serviceTypeCode: 'INTERNET',
      code: 'NET-25',
      name: 'Internet 25',
      priceCentavos: 85000,
      speedMbps: 25,
      channelCount: null,
      description: null,
      isActive: true,
    } as const;
    const masterData = service({
      updatePlan: vi.fn(async () => plan) as never,
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/plans/${plan.id}`,
      headers: { authorization: 'Bearer token' },
      payload: {
        priceCentavos: 85000,
        reason: 'Approved annual rate review',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(masterData.updatePlan).toHaveBeenCalledWith(
      plan.id,
      { priceCentavos: 85000, reason: 'Approved annual rate review' },
      user.id,
    );
  });

  it('rejects a too-short plan change reason before calling the service', async () => {
    const masterData = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/plans/00000000-0000-4000-8000-000000000010',
      headers: { authorization: 'Bearer token' },
      payload: { priceCentavos: 85000, reason: 'ok' },
    });

    expect(response.statusCode).toBe(422);
    expect(masterData.updatePlan).not.toHaveBeenCalled();
  });

  it('documents the Task 3 endpoint surface', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: service(),
    });
    applications.push(app);
    const document = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json();
    expect(document.paths).toHaveProperty('/api/v1/plans');
    expect(document.paths).toHaveProperty('/api/v1/subscribers');
    expect(document.paths).toHaveProperty('/api/v1/subscribers/{id}/activity');
    expect(document.paths).toHaveProperty(
      '/api/v1/subscribers/{id}/service-accounts',
    );
  });

  it('authorizes and normalizes subscriber activity pagination', async () => {
    const masterData = service({
      activity: vi.fn(async () => ({
        items: [],
        page: 2,
        pageSize: 15,
        total: 31,
      })),
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/subscribers/00000000-0000-4000-8000-000000000001/activity?page=2&pageSize=15',
      headers: { authorization: 'Bearer token' },
    });

    expect(response.statusCode).toBe(200);
    expect(masterData.activity).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      { page: 2, pageSize: 15 },
      user.permissions,
    );
    expect(auth.requirePermission).toHaveBeenCalledWith(
      'token',
      'subscriber.view',
    );
  });

  it('does not read subscriber activity when view permission is denied', async () => {
    const denied = {
      requirePermission: vi.fn(async () => {
        throw new AuthError(403, 'Permission denied.');
      }),
    } as unknown as AuthService;
    const masterData = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: denied,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/subscribers/00000000-0000-4000-8000-000000000001/activity',
      headers: { authorization: 'Bearer token' },
    });

    expect(response.statusCode).toBe(403);
    expect(masterData.activity).not.toHaveBeenCalled();
  });

  it('returns the stable not-found response for a missing subscriber activity feed', async () => {
    const masterData = service({
      activity: vi.fn(async () => {
        throw new MasterDataError(404, 'Subscriber not found.');
      }) as never,
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      masterDataService: masterData,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/subscribers/missing/activity',
      headers: { authorization: 'Bearer token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Subscriber not found.');
  });
});
