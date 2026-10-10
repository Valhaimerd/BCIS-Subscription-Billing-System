import {
  applicationSettingsInputSchema,
  backupHistoryQuerySchema,
  restoreBackupInputSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type AuthService, readBearerToken } from './auth.js';
import type { OperationService } from './operations.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;
const idParams = z.object({ id: z.uuid() });

export async function registerOperationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  operations: OperationService,
) {
  const authorize = async (
    authorization: string | undefined,
    permission: 'backup.create' | 'backup.restore' | 'settings.manage',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get(
    '/api/v1/operations/readiness',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'Check operational storage and PostgreSQL backup tools',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'backup.create');
      return {
        success: true,
        message: 'Operational readiness checked.',
        data: await operations.readiness(),
      };
    },
  );

  app.get(
    '/api/v1/application-settings',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'Read backup retention settings',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'settings.manage');
      return {
        success: true,
        message: 'Application settings loaded.',
        data: await operations.settings(),
      };
    },
  );

  app.patch(
    '/api/v1/application-settings',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'Update backup retention settings',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'settings.manage',
      );
      const input = applicationSettingsInputSchema.parse(request.body);
      return {
        success: true,
        message: 'Application settings updated.',
        data: await operations.updateSettings(
          input.backupRetentionCount,
          actor.id,
        ),
      };
    },
  );

  app.get(
    '/api/v1/backups',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'List immutable backup and restore results',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'backup.create');
      const query = backupHistoryQuerySchema.parse(request.query);
      return {
        success: true,
        message: 'Backup history loaded.',
        data: await operations.list(query.page, query.pageSize),
      };
    },
  );

  app.post(
    '/api/v1/backups',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'Create and verify a server-side backup',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'backup.create',
      );
      return reply.status(201).send({
        success: true,
        message: 'Backup created and verified.',
        data: await operations.create(actor.id),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/backups/:id/restore',
    {
      schema: {
        ...protectedRoute,
        tags: ['Operations'],
        summary: 'Validate and restore a selected backup',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'backup.restore',
      );
      const { id } = idParams.parse(request.params);
      const input = restoreBackupInputSchema.parse(request.body);
      return {
        success: true,
        message: 'Backup restored and verified.',
        data: await operations.restore(id, input.confirmation, actor.id),
      };
    },
  );
}
