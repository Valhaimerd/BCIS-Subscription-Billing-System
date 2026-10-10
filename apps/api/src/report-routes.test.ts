import type { SafeUser } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { AuthError, type AuthService } from './auth.js';

const applications: Awaited<ReturnType<typeof createApp>>[] = [];
const user: SafeUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'auditor',
  fullName: 'Report Auditor',
  roles: ['ACCOUNTING_AUDITOR'],
  permissions: ['report.view', 'report.export'],
  mustChangePassword: false,
};
const auth = {
  requirePermission: vi.fn(async () => user),
} as unknown as AuthService;
const service = {
  dashboard: vi.fn(async () => ({})),
  report: vi.fn(async () => ({ rows: [] })),
  export: vi.fn(async () => ({
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    dataBase64: 'JVBERi0=',
  })),
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('Task 8 report API contract', () => {
  it('publishes dashboard, report preview, and report export endpoints', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      reportService: service,
    } as never);
    applications.push(app);
    const paths = (
      await app.inject({ method: 'GET', url: '/docs/json' })
    ).json().paths;
    expect(paths).toHaveProperty('/api/v1/dashboard');
    expect(paths).toHaveProperty('/api/v1/reports/{kind}');
    expect(paths).toHaveProperty('/api/v1/reports/{kind}/export');
    expect(
      paths['/api/v1/reports/{kind}/export'].get.parameters,
    ).toContainEqual(
      expect.objectContaining({ name: 'q', in: 'query', required: false }),
    );
  });

  it('accepts search text for full report exports', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      reportService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/COLLECTIONS/export?format=pdf&from=2026-10-01&to=2026-10-31&asOf=2026-10-31&granularity=MONTHLY&dimension=PLAN&q=North%20District',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(200);
    expect(service.export).toHaveBeenCalledWith(
      'COLLECTIONS',
      expect.objectContaining({ q: 'North District' }),
      'pdf',
    );
  });

  it('requires report.export instead of report.view for file generation', async () => {
    const denied = {
      requirePermission: vi.fn(async (_token, permission) => {
        if (permission === 'report.export')
          throw new AuthError(403, 'Permission denied.');
        return user;
      }),
    } as unknown as AuthService;
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: denied,
      reportService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/COLLECTIONS/export?format=pdf&from=2026-10-01&to=2026-10-31&asOf=2026-10-31&granularity=MONTHLY&dimension=PLAN',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(403);
    expect(service.export).not.toHaveBeenCalled();
  });

  it('returns the monthly billing and collection series from the dashboard', async () => {
    const monthlyTrend = [
      {
        period: '2026-09',
        billedCentavos: 12345,
        collectedCentavos: 10123,
        differenceCentavos: 2222,
      },
    ];
    service.dashboard.mockResolvedValueOnce({ monthlyTrend });
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      reportService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?from=2026-09-01&to=2026-09-30&asOf=2026-09-30',
      headers: { authorization: 'Bearer token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.monthlyTrend).toEqual(monthlyTrend);
    expect(service.dashboard).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      asOf: '2026-09-30',
    });
  });

  it('checks report.view before calling the dashboard service', async () => {
    const denied = {
      requirePermission: vi.fn(async () => {
        throw new AuthError(403, 'Permission denied.');
      }),
    } as unknown as AuthService;
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: denied,
      reportService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?from=2026-09-01&to=2026-09-30&asOf=2026-09-30',
      headers: { authorization: 'Bearer token' },
    });

    expect(response.statusCode).toBe(403);
    expect(service.dashboard).not.toHaveBeenCalled();
  });

  it('rejects an inverted report date range before querying', async () => {
    const app = await createApp({
      checkReadiness: async () => undefined,
      authService: auth,
      reportService: service,
    } as never);
    applications.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/COLLECTIONS?from=2026-11-01&to=2026-10-31&asOf=2026-10-31&page=1&pageSize=20',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(422);
    expect(service.report).not.toHaveBeenCalled();
  });
});
