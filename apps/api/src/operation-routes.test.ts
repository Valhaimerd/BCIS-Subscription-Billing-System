import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const owner: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  fullName: 'Development Owner',
  roles: ['OWNER'],
  permissions: ['backup.create', 'backup.restore', 'settings.manage'],
  mustChangePassword: false,
};
const service = {
  isRestoring: vi.fn(() => false),
  readiness: vi.fn(async () => ({})),
  settings: vi.fn(async () => ({})),
  updateSettings: vi.fn(async () => ({})),
  list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
  create: vi.fn(async () => ({})),
  restore: vi.fn(async () => ({})),
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 9 operations API contract', () => {
  it('publishes settings, readiness, backup, and restore endpoints', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: {
        requirePermission: vi.fn(async () => owner),
      } as unknown as AuthService,
      operationService: service,
    } as never);
    applications.push(app);
    const paths = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json().paths;
    expect(paths).toHaveProperty('/api/v1/operations/readiness');
    expect(paths).toHaveProperty('/api/v1/application-settings');
    expect(paths).toHaveProperty('/api/v1/backups');
    expect(paths).toHaveProperty('/api/v1/backups/{id}/restore');
  });

  it('rejects a Cashier calling the backup API directly', async () => {
    const auth = {
      requirePermission: vi.fn(async (_token, permission) => {
        if (permission === 'backup.create')
          throw new AuthError(403, 'Permission denied.');
        return owner;
      }),
    } as unknown as AuthService;
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      operationService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/backups',
      headers: { authorization: 'Bearer cashier-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('validates restore input before starting recovery', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: {
        requirePermission: vi.fn(async () => owner),
      } as unknown as AuthService,
      operationService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/backups/00000000-0000-4000-8000-000000000001/restore',
      headers: { authorization: 'Bearer owner-token' },
      payload: {},
    });
    expect(response.statusCode).toBe(422);
    expect(service.restore).not.toHaveBeenCalled();
  });
});
