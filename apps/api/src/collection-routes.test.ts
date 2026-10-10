import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';
import type { CollectionService } from './collections.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'supervisor',
  fullName: 'Collection Supervisor',
  roles: ['COLLECTION_SUPERVISOR'],
  permissions: ['collection.view', 'collection.reconcile'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
function service() {
  const detail = { id: 'batch', status: 'OPEN', differenceCentavos: 0 };
  return {
    list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
    get: vi.fn(async () => detail),
    create: vi.fn(async () => detail),
    start: vi.fn(async () => ({ ...detail, status: 'IN_PROGRESS' })),
    submit: vi.fn(async () => ({ ...detail, status: 'SUBMITTED' })),
    remit: vi.fn(async () => ({ ...detail, status: 'REMITTED' })),
    reconcile: vi.fn(async () => ({ ...detail, status: 'RECONCILED' })),
    close: vi.fn(async () => ({ ...detail, status: 'CLOSED' })),
  } as unknown as CollectionService;
}
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 6 collection API contract', () => {
  it('requires collection.reconcile for generating a batch', async () => {
    const collections = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      collectionService: collections,
    });
    applications.push(app);
    await app.inject({
      method: 'POST',
      url: '/api/v1/collection-batches',
      headers: { authorization: 'Bearer token' },
      payload: {
        collectorId: '00000000-0000-4000-8000-000000000002',
        collectionAreaId: '00000000-0000-4000-8000-000000000003',
        batchDate: '2026-10-06',
      },
    });
    expect(auth.requirePermission).toHaveBeenCalledWith(
      'token',
      'collection.reconcile',
    );
  });

  it('requires literal confirmation and an explicit difference', async () => {
    const collections = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      collectionService: collections,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/collection-batches/00000000-0000-4000-8000-000000000002/reconcile',
      headers: { authorization: 'Bearer token' },
      payload: { actorConfirmed: false, expectedDifferenceCentavos: 0 },
    });
    expect(response.statusCode).toBe(422);
    expect(collections.reconcile).not.toHaveBeenCalled();
  });

  it('rejects a direct reconciliation call without permission', async () => {
    const denied = {
      requirePermission: vi.fn(async () => {
        throw new AuthError(403, 'Permission denied.');
      }),
    } as unknown as AuthService;
    const collections = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: denied,
      collectionService: collections,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/collection-batches/00000000-0000-4000-8000-000000000002/reconcile',
      headers: { authorization: 'Bearer token' },
      payload: { actorConfirmed: true, expectedDifferenceCentavos: -50_000 },
    });
    expect(response.statusCode).toBe(403);
    expect(collections.reconcile).not.toHaveBeenCalled();
  });

  it('publishes the route-sheet and reconciliation endpoints', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      collectionService: service(),
    });
    applications.push(app);
    const paths = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json().paths;
    expect(paths).toHaveProperty('/api/v1/collection-batches');
    expect(paths).toHaveProperty('/api/v1/collection-batches/{id}');
    expect(paths).toHaveProperty('/api/v1/collection-batches/{id}/remittance');
    expect(paths).toHaveProperty('/api/v1/collection-batches/{id}/reconcile');
    expect(paths).toHaveProperty('/api/v1/collection-batches/{id}/close');
  });
});
