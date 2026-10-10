import {
  healthFailureSchema,
  healthSuccessSchema,
  type RoleCode,
  type SafeUser,
} from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];

const ownerUser: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  fullName: 'Development Owner',
  roles: ['OWNER'],
  permissions: ['user.manage'],
  mustChangePassword: true,
};

function authStub(requirePermission = vi.fn(async () => ownerUser)) {
  return {
    login: vi.fn(async () => ({
      token: 'opaque-token',
      expiresAt: new Date('2026-10-02T08:00:00.000Z'),
      user: ownerUser,
    })),
    current: vi.fn(async () => ({
      expiresAt: new Date('2026-10-02T08:00:00.000Z'),
      locked: false,
      user: ownerUser,
    })),
    logout: vi.fn(async () => undefined),
    lock: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
    requirePermission,
  } as unknown as AuthService;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('authentication API contract', () => {
  it('publishes documented auth responses and bearer authentication', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: authStub(),
    });
    applications.push(app);

    const document = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json();
    expect(document.components.securitySchemes).toHaveProperty('bearerAuth');
    expect(document.paths).toHaveProperty('/api/v1/auth/login');
    expect(document.paths).toHaveProperty('/api/v1/auth/session');
    expect(document.paths).toHaveProperty(
      '/api/v1/administration/access-check',
    );
    expect(document.paths['/api/v1/auth/login'].post.responses).toHaveProperty(
      '200',
    );
  });

  it('rejects a direct protected call without a bearer token', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: authStub(),
    });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/administration/access-check',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      message: 'Authentication is required.',
      errors: {},
    });
  });

  it('returns a safe client error for malformed JSON', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: authStub(),
    });
    applications.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      success: false,
      message: 'The request body is malformed.',
      errors: { request: ['Submit a valid request body and try again.'] },
    });
  });

  it('returns only the safe user shape from an authorized direct call', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: authStub(),
    });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/administration/access-check',
      headers: { authorization: 'Bearer owner-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(ownerUser);
    expect(response.json().data).not.toHaveProperty('passwordHash');
    expect(response.json().data).not.toHaveProperty('accessToken');
    expect(response.body).not.toContain('opaque-token');
  });
});

describe.each<[RoleCode, boolean]>([
  ['OWNER', true],
  ['ADMINISTRATOR', true],
  ['CASHIER', false],
  ['COLLECTION_SUPERVISOR', false],
  ['ACCOUNTING_AUDITOR', false],
  ['TECHNICIAN', false],
  ['READ_ONLY_VIEWER', false],
])('%s direct API boundary', (role, allowed) => {
  it(`${allowed ? 'allows' : 'rejects'} user administration`, async () => {
    const permissionCheck = vi.fn(async () => {
      if (!allowed) {
        throw new AuthError(403, 'You do not have permission for this action.');
      }
      return { ...ownerUser, roles: [role] };
    });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: authStub(permissionCheck),
    });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/administration/access-check',
      headers: { authorization: `Bearer ${role.toLowerCase()}-token` },
    });

    expect(response.statusCode).toBe(allowed ? 200 : 403);
    expect(permissionCheck).toHaveBeenCalledWith(
      `${role.toLowerCase()}-token`,
      'user.manage',
    );
  });
});

describe('health API', () => {
  it('reports liveness without touching the database', async () => {
    const checkReadiness = vi.fn(async () => undefined);
    const app = await createApp({ checkReadiness });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(healthSuccessSchema.parse(response.json()).data.status).toBe('ok');
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL responds', async () => {
    const app = await createApp({ checkReadiness: async () => undefined });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(healthSuccessSchema.parse(response.json()).data.status).toBe('ok');
  });

  it('returns a safe degraded response when PostgreSQL is unavailable', async () => {
    const app = await createApp({
      checkReadiness: async () => {
        throw new Error('sensitive connection detail');
      },
    });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(healthFailureSchema.parse(response.json())).toMatchObject({
      success: false,
      message: 'Database is unavailable.',
      data: { status: 'degraded' },
    });
    expect(response.body).not.toContain('sensitive connection detail');
  });

  it('publishes the health contract in OpenAPI', async () => {
    const app = await createApp({ checkReadiness: async () => undefined });
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json().paths).toHaveProperty('/api/v1/health/live');
    expect(response.json().paths).toHaveProperty('/api/v1/health/ready');
  });
});
