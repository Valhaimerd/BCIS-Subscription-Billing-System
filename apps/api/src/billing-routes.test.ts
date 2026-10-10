import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import type { AuthService } from './auth.js';
import { BillingError, type BillingService } from './billing.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  fullName: 'Owner',
  roles: ['OWNER'],
  permissions: ['billing.view', 'billing.generate'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
function service(overrides: Partial<BillingService> = {}) {
  return {
    listCycles: vi.fn(async () => []),
    generateDrafts: vi.fn(async () => ({
      cycleId: 'cycle',
      created: 2,
      skipped: 0,
    })),
    finalizeCycle: vi.fn(async () => ({ finalized: 2 })),
    listInvoices: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })),
    invoice: vi.fn(),
    addAdjustment: vi.fn(),
    voidInvoice: vi.fn(),
    ledger: vi.fn(async () => []),
    ...overrides,
  } as unknown as BillingService;
}
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 4 billing API contract', () => {
  it('normalizes invoice search and enforces billing view permission', async () => {
    const billing = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      billingService: billing,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices?q=INV-2026&page=2&pageSize=10',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(200);
    expect(billing.listInvoices).toHaveBeenCalledWith({
      q: 'INV-2026',
      page: 2,
      pageSize: 10,
    });
    expect(auth.requirePermission).toHaveBeenCalledWith(
      'token',
      'billing.view',
    );
  });

  it('rejects an invalid billing period before generation', async () => {
    const billing = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      billingService: billing,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing-cycles',
      headers: { authorization: 'Bearer token' },
      payload: { periodYear: 2026, periodMonth: 13 },
    });
    expect(response.statusCode).toBe(422);
    expect(billing.generateDrafts).not.toHaveBeenCalled();
  });

  it('returns a stable conflict for forbidden financial transitions', async () => {
    const billing = service({
      voidInvoice: vi.fn(async () => {
        throw new BillingError(409, 'This invoice cannot be voided.');
      }) as never,
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      billingService: billing,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/invoices/00000000-0000-4000-8000-000000000002/void',
      headers: { authorization: 'Bearer token' },
      payload: { reason: 'Duplicate charge' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      success: false,
      message: 'This invoice cannot be voided.',
      errors: {},
    });
  });

  it('publishes all Task 4 routes in OpenAPI', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      billingService: service(),
    });
    applications.push(app);
    const document = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json();
    expect(document.paths).toHaveProperty('/api/v1/billing-cycles');
    expect(document.paths).toHaveProperty(
      '/api/v1/billing-cycles/{id}/finalize',
    );
    expect(document.paths).toHaveProperty('/api/v1/invoices');
    expect(document.paths).toHaveProperty('/api/v1/subscribers/{id}/ledger');
    expect(document.paths['/api/v1/invoices/{id}']).toEqual({
      get: expect.any(Object),
    });
  });
});
