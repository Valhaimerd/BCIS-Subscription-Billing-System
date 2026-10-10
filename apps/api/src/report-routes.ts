import {
  dashboardQuerySchema,
  reportExportFormatSchema,
  reportExportQuerySchema,
  reportKindSchema,
  reportQuerySchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type AuthService, readBearerToken } from './auth.js';
import type { ReportService } from './reports.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;
const kindParams = z.object({ kind: reportKindSchema });
const exportQuerySchema = {
  type: 'object',
  required: ['format', 'from', 'to', 'asOf'],
  properties: {
    format: { type: 'string', enum: ['pdf', 'xlsx'] },
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    asOf: { type: 'string', format: 'date' },
    granularity: {
      type: 'string',
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL'],
      default: 'MONTHLY',
    },
    dimension: {
      type: 'string',
      enum: ['PLAN', 'SERVICE', 'AREA'],
      default: 'PLAN',
    },
    subscriberId: { type: 'string', format: 'uuid' },
    q: { type: 'string', maxLength: 200, default: '' },
  },
} as const;

export async function registerReportRoutes(
  app: FastifyInstance,
  auth: AuthService,
  reports: ReportService,
) {
  const authorize = (
    authorization: string | undefined,
    permission: 'report.view' | 'report.export' | 'audit.view',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get(
    '/api/v1/dashboard',
    {
      schema: {
        ...protectedRoute,
        tags: ['Reports'],
        summary: 'Load authoritative management dashboard indicators',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'report.view');
      return {
        success: true,
        message: 'Dashboard loaded.',
        data: await reports.dashboard(
          dashboardQuerySchema.parse(request.query),
        ),
      };
    },
  );

  app.get<{ Params: { kind: string } }>(
    '/api/v1/reports/:kind/export',
    {
      schema: {
        ...protectedRoute,
        tags: ['Reports'],
        summary: 'Export the full filtered report as PDF or XLSX',
        querystring: exportQuerySchema,
      },
    },
    async (request) => {
      const { kind } = kindParams.parse(request.params);
      await authorize(request.headers.authorization, 'report.export');
      if (kind === 'AUDIT' || kind === 'USER_ACTIVITY')
        await authorize(request.headers.authorization, 'audit.view');
      const raw = request.query as Record<string, unknown>;
      const format = reportExportFormatSchema.parse(raw.format);
      return {
        success: true,
        message: 'Report export generated.',
        data: await reports.export(
          kind,
          reportExportQuerySchema.parse(raw),
          format,
        ),
      };
    },
  );

  app.get<{ Params: { kind: string } }>(
    '/api/v1/reports/:kind',
    {
      schema: {
        ...protectedRoute,
        tags: ['Reports'],
        summary: 'Preview a validated paginated report result',
      },
    },
    async (request) => {
      const { kind } = kindParams.parse(request.params);
      await authorize(request.headers.authorization, 'report.view');
      if (kind === 'AUDIT' || kind === 'USER_ACTIVITY')
        await authorize(request.headers.authorization, 'audit.view');
      return {
        success: true,
        message: 'Report loaded.',
        data: await reports.report(
          kind,
          reportQuerySchema.parse(request.query),
        ),
      };
    },
  );
}
