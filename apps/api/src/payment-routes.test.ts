import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';
import { PaymentError, type PaymentService } from './payments.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'cashier',
  fullName: 'Cashier',
  roles: ['CASHIER'],
  permissions: ['payment.view', 'payment.create', 'payment.verify_gcash'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
function service(overrides: Partial<PaymentService> = {}) {
  return {
    preview: vi.fn(),
    list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
    create: vi.fn(async () => ({ receiptNumber: 'RCPT-005001' })),
    submitGcash: vi.fn(),
    decideGcash: vi.fn(),
    reverse: vi.fn(),
    proof: vi.fn(),
    ...overrides,
  } as unknown as PaymentService;
}
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 5 payment API contract', () => {
  it('rejects non-positive payment amounts before posting', async () => {
    const payments = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      paymentService: payments,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments',
      headers: { authorization: 'Bearer token' },
      payload: {
        subscriberId: '00000000-0000-4000-8000-000000000002',
        amountCentavos: 0,
        method: 'CASH',
      },
    });
    expect(response.statusCode).toBe(422);
    expect(payments.create).not.toHaveBeenCalled();
  });

  it('enforces the payment creation permission', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      paymentService: service(),
    });
    applications.push(app);
    await app.inject({
      method: 'POST',
      url: '/api/v1/payments',
      headers: { authorization: 'Bearer token' },
      payload: {
        subscriberId: '00000000-0000-4000-8000-000000000002',
        amountCentavos: 99_900,
        method: 'CASH',
      },
    });
    expect(auth.requirePermission).toHaveBeenCalledWith(
      'token',
      'payment.create',
    );
  });

  it('returns a stable duplicate-GCash conflict', async () => {
    const payments = service({
      submitGcash: vi.fn(async () => {
        throw new PaymentError(409, 'GCash reference number already exists.');
      }) as never,
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      paymentService: payments,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gcash-submissions',
      headers: { authorization: 'Bearer token' },
      payload: {
        subscriberId: '00000000-0000-4000-8000-000000000002',
        amountCentavos: 99_900,
        referenceNumber: 'DEMO-REF',
        senderDetails: 'Synthetic sender',
        proof: {
          filename: 'proof.png',
          mimeType: 'image/png',
          dataBase64: 'aGVsbG8=',
        },
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('publishes payment, GCash, reversal, and proof routes', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      paymentService: service(),
    });
    applications.push(app);
    const paths = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json().paths;
    expect(paths).toHaveProperty('/api/v1/payments');
    expect(paths).toHaveProperty('/api/v1/gcash-submissions');
    expect(paths).toHaveProperty('/api/v1/payments/{id}/gcash-decision');
    expect(paths).toHaveProperty('/api/v1/payments/{id}/reverse');
    expect(paths['/api/v1/payments/{id}/reverse']).toEqual({
      post: expect.any(Object),
    });
  });

  it('rejects a direct reversal call without payment.reverse', async () => {
    const deniedAuth = {
      requirePermission: vi.fn(async () => {
        throw new AuthError(403, 'Permission denied.');
      }),
    } as unknown as AuthService;
    const payments = service();
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: deniedAuth,
      paymentService: payments,
    });
    applications.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/00000000-0000-4000-8000-000000000002/reverse',
      headers: { authorization: 'Bearer cashier-token' },
      payload: { reason: 'Unauthorized reversal attempt.' },
    });
    expect(response.statusCode).toBe(403);
    expect(payments.reverse).not.toHaveBeenCalled();
  });
});
