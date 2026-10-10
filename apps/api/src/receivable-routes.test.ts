import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'supervisor',
  fullName: 'Receivables Supervisor',
  roles: ['COLLECTION_SUPERVISOR'],
  permissions: ['receivable.view', 'receivable.manage'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
const service = {
  summary: vi.fn(async () => ({})),
  list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
  settings: vi.fn(async () => ({})),
  updateSettings: vi.fn(async () => ({})),
  suspend: vi.fn(async () => ({})),
  requestReconnection: vi.fn(async () => ({})),
  completeReconnection: vi.fn(async () => ({})),
  serviceControlHistory: vi.fn(async () => ({})),
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 7 receivable API contract', () => {
  it('publishes receivable, settings, and service-control endpoints', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      receivableService: service,
    } as never);
    applications.push(app);
    const paths = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json().paths;
    expect(paths).toHaveProperty('/api/v1/receivables/summary');
    expect(paths).toHaveProperty('/api/v1/receivables');
    expect(paths).toHaveProperty('/api/v1/receivable-settings');
    expect(paths).toHaveProperty('/api/v1/service-accounts/{id}/suspensions');
    expect(paths).toHaveProperty('/api/v1/service-accounts/{id}/reconnections');
    expect(paths).toHaveProperty('/api/v1/reconnections/{id}/complete');
  });

  it('requires receivable.manage for suspension approval', async () => {
    const denied = {
      requirePermission: vi.fn(async () => {
        throw new AuthError(403, 'Permission denied.');
      }),
    } as unknown as AuthService;
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: denied,
      receivableService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/service-accounts/00000000-0000-4000-8000-000000000002/suspensions',
      headers: { authorization: 'Bearer token' },
      payload: {
        reason: 'Account exceeded the suspension threshold.',
        effectiveDate: '2026-10-31',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(service.suspend).not.toHaveBeenCalled();
  });

  it('rejects an invalid historical asOf date before querying', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      receivableService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receivables/summary?asOf=not-a-date',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(422);
    expect(service.summary).not.toHaveBeenCalled();
  });
});
