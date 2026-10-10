import {
  collectionBatchListQuerySchema,
  collectionRoutePreviewSchema,
  createCollectionBatchSchema,
  reconciliationSchema,
  remittanceSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';

import { type AuthService, readBearerToken } from './auth.js';
import type { CollectionService } from './collections.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;

export async function registerCollectionRoutes(
  app: FastifyInstance,
  auth: AuthService,
  collections: CollectionService,
) {
  const authorize = (
    authorization: string | undefined,
    permission: 'collection.view' | 'collection.reconcile',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/api/v1/collection-batches',
    {
      schema: {
        ...protectedRoute,
        tags: ['Collections'],
        summary: 'List collection batches and authoritative totals',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'collection.view');
      return {
        success: true,
        message: 'Collection batches loaded.',
        data: await collections.list(
          collectionBatchListQuerySchema.parse(request.query),
        ),
      };
    },
  );

  app.post(
    '/api/v1/collection-batches/preview',
    {
      schema: {
        ...protectedRoute,
        tags: ['Collections'],
        summary: 'Preview eligible route accounts before issuing a batch',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'collection.reconcile');
      return {
        success: true,
        message: 'Collection route preview loaded.',
        data: await collections.preview(
          collectionRoutePreviewSchema.parse(request.body),
        ),
      };
    },
  );

  app.post(
    '/api/v1/collection-batches',
    {
      schema: {
        ...protectedRoute,
        tags: ['Collections'],
        summary: 'Generate a frozen collector route sheet',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'collection.reconcile',
      );
      return reply.status(201).send({
        success: true,
        message: 'Collection batch created.',
        data: await collections.create(
          createCollectionBatchSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/collection-batches/:id',
    {
      schema: {
        ...protectedRoute,
        tags: ['Collections'],
        summary: 'Read a frozen route sheet and reconciliation totals',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'collection.view');
      return {
        success: true,
        message: 'Collection batch loaded.',
        data: await collections.get(request.params.id),
      };
    },
  );

  for (const action of ['start', 'submit'] as const) {
    app.post<{ Params: { id: string } }>(
      `/api/v1/collection-batches/:id/${action}`,
      {
        schema: {
          ...protectedRoute,
          tags: ['Collections'],
          summary: `${action === 'start' ? 'Start' : 'Submit'} a collection batch`,
        },
      },
      async (request) => {
        const actor = await authorize(
          request.headers.authorization,
          'collection.reconcile',
        );
        return {
          success: true,
          message: `Collection batch ${action === 'start' ? 'started' : 'submitted'}.`,
          data: await collections[action](request.params.id, actor.id),
        };
      },
    );
  }

  app.post<{ Params: { id: string } }>(
    '/api/v1/collection-batches/:id/remittance',
    {
      schema: {
        ...protectedRoute,
        tags: ['Collections'],
        summary: 'Record collector Cash remittance',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'collection.reconcile',
      );
      return {
        success: true,
        message: 'Collector remittance recorded.',
        data: await collections.remit(
          request.params.id,
          remittanceSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );

  for (const action of ['reconcile', 'close'] as const) {
    app.post<{ Params: { id: string } }>(
      `/api/v1/collection-batches/:id/${action}`,
      {
        schema: {
          ...protectedRoute,
          tags: ['Collections'],
          summary: `${action === 'reconcile' ? 'Reconcile' : 'Close'} with an explicitly confirmed difference`,
        },
      },
      async (request) => {
        const actor = await authorize(
          request.headers.authorization,
          'collection.reconcile',
        );
        const input = reconciliationSchema.parse(request.body);
        return {
          success: true,
          message: `Collection batch ${action === 'reconcile' ? 'reconciled' : 'closed'}.`,
          data: await collections[action](
            request.params.id,
            input.expectedDifferenceCentavos,
            actor.id,
          ),
        };
      },
    );
  }
}
