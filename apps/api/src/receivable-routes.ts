import {
  delinquencySettingsInputSchema,
  receivableListQuerySchema,
  receivableSummaryQuerySchema,
  reconnectionCompletionSchema,
  reconnectionRequestSchema,
  suspensionInputSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type AuthService, readBearerToken } from './auth.js';
import type { ReceivableService } from './receivables.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;
const idParams = z.object({ id: z.uuid() });

export async function registerReceivableRoutes(
  app: FastifyInstance,
  auth: AuthService,
  receivables: ReceivableService,
) {
  const authorize = (
    authorization: string | undefined,
    permission: 'receivable.view' | 'receivable.manage' | 'settings.manage',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get(
    '/api/v1/receivables/summary',
    {
      schema: {
        ...protectedRoute,
        tags: ['Receivables'],
        summary: 'Derive receivable and aging totals for an explicit date',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'receivable.view');
      const filters = receivableSummaryQuerySchema.parse(request.query);
      return {
        success: true,
        message: 'Receivable summary loaded.',
        data: await receivables.summary(filters),
      };
    },
  );

  app.get(
    '/api/v1/receivables',
    {
      schema: {
        ...protectedRoute,
        tags: ['Receivables'],
        summary: 'Filter and paginate derived outstanding service accounts',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'receivable.view');
      return {
        success: true,
        message: 'Receivable detail loaded.',
        data: await receivables.list(
          receivableListQuerySchema.parse(request.query),
        ),
      };
    },
  );

  app.get(
    '/api/v1/receivable-settings',
    {
      schema: {
        ...protectedRoute,
        tags: ['Receivables'],
        summary: 'Read grace, suspension, and reconnection-fee settings',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'receivable.view');
      return {
        success: true,
        message: 'Delinquency settings loaded.',
        data: await receivables.settings(),
      };
    },
  );

  app.patch(
    '/api/v1/receivable-settings',
    {
      schema: {
        ...protectedRoute,
        tags: ['Receivables'],
        summary: 'Update delinquency settings with an audit event',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'settings.manage',
      );
      return {
        success: true,
        message: 'Delinquency settings updated.',
        data: await receivables.updateSettings(
          delinquencySettingsInputSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/service-accounts/:id/service-control',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service control'],
        summary: 'Read suspension, reconnection, and service-state history',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'receivable.view');
      const { id } = idParams.parse(request.params);
      return {
        success: true,
        message: 'Service-control history loaded.',
        data: await receivables.serviceControlHistory(id),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/service-accounts/:id/suspensions',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service control'],
        summary: 'Approve a threshold-qualified service suspension',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'receivable.manage',
      );
      const { id } = idParams.parse(request.params);
      return reply.status(201).send({
        success: true,
        message: 'Service suspension approved.',
        data: await receivables.suspend(
          id,
          suspensionInputSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/service-accounts/:id/reconnections',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service control'],
        summary: 'Approve a reconnection request after qualifying payment',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'receivable.manage',
      );
      const { id } = idParams.parse(request.params);
      return reply.status(201).send({
        success: true,
        message: 'Reconnection requested.',
        data: await receivables.requestReconnection(
          id,
          reconnectionRequestSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/reconnections/:id/complete',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service control'],
        summary: 'Complete reconnection and post the configured fee',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'receivable.manage',
      );
      const { id } = idParams.parse(request.params);
      return {
        success: true,
        message: 'Reconnection completed.',
        data: await receivables.completeReconnection(
          id,
          reconnectionCompletionSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );
}
