import {
  changeServiceStatusSchema,
  changeSubscriberStatusSchema,
  createPlanSchema,
  createServiceAccountSchema,
  createSubscriberSchema,
  paginationSchema,
  subscriberActivityQuerySchema,
  updatePlanSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';

import { type AuthService, readBearerToken } from './auth.js';
import type { MasterDataService } from './master-data.js';

const protectedRoute = {
  security: [{ bearerAuth: [] }],
} as const;

export async function registerMasterDataRoutes(
  app: FastifyInstance,
  auth: AuthService,
  masterData: MasterDataService,
) {
  const authorize = (
    authorization: string | undefined,
    permission: 'subscriber.view' | 'subscriber.manage' | 'service.manage',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get(
    '/api/v1/reference-data',
    {
      schema: {
        ...protectedRoute,
        tags: ['Master data'],
        summary: 'List active plans, service types, areas, and collectors',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'subscriber.view');
      return {
        success: true,
        message: 'Reference data loaded.',
        data: await masterData.references(),
      };
    },
  );

  app.get(
    '/api/v1/plans',
    {
      schema: {
        ...protectedRoute,
        tags: ['Plans'],
        summary: 'List service plans',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'subscriber.view');
      return {
        success: true,
        message: 'Plans loaded.',
        data: await masterData.listPlans(),
      };
    },
  );

  app.post(
    '/api/v1/plans',
    {
      schema: {
        ...protectedRoute,
        tags: ['Plans'],
        summary: 'Create a service plan',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'subscriber.manage',
      );
      const plan = await masterData.createPlan(
        createPlanSchema.parse(request.body),
        actor.id,
      );
      return reply
        .status(201)
        .send({ success: true, message: 'Plan created.', data: plan });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/v1/plans/:id',
    {
      schema: {
        ...protectedRoute,
        tags: ['Plans'],
        summary:
          'Update future plan settings without rewriting service-account rates',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'subscriber.manage',
      );
      return {
        success: true,
        message: 'Plan updated.',
        data: await masterData.updatePlan(
          request.params.id,
          updatePlanSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/api/v1/subscribers',
    {
      schema: {
        ...protectedRoute,
        tags: ['Subscribers'],
        summary: 'Search and paginate subscribers by current master data',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'subscriber.view');
      return {
        success: true,
        message: 'Subscribers loaded.',
        data: await masterData.listSubscribers(
          paginationSchema.parse(request.query),
        ),
      };
    },
  );

  app.post(
    '/api/v1/subscribers',
    {
      schema: {
        ...protectedRoute,
        tags: ['Subscribers'],
        summary: 'Register a subscriber with address and contact details',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'subscriber.manage',
      );
      const subscriber = await masterData.createSubscriber(
        createSubscriberSchema.parse(request.body),
        actor.id,
      );
      return reply.status(201).send({
        success: true,
        message: 'Subscriber registered.',
        data: subscriber,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/subscribers/:id',
    {
      schema: {
        ...protectedRoute,
        tags: ['Subscribers'],
        summary: 'Read a complete subscriber profile',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'subscriber.view');
      return {
        success: true,
        message: 'Subscriber loaded.',
        data: await masterData.profile(request.params.id),
      };
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: Record<string, string | undefined>;
  }>(
    '/api/v1/subscribers/:id/activity',
    {
      schema: {
        ...protectedRoute,
        tags: ['Subscribers'],
        summary: 'Read a paginated, read-only subscriber activity timeline',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'subscriber.view',
      );
      return {
        success: true,
        message: 'Subscriber activity loaded.',
        data: await masterData.activity(
          request.params.id,
          subscriberActivityQuerySchema.parse(request.query),
          actor.permissions,
        ),
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/v1/subscribers/:id/status',
    {
      schema: {
        ...protectedRoute,
        tags: ['Subscribers'],
        summary: 'Inactivate, reactivate, or archive a subscriber with history',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'subscriber.manage',
      );
      return {
        success: true,
        message: 'Subscriber status updated.',
        data: await masterData.changeSubscriberStatus(
          request.params.id,
          changeSubscriberStatusSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/subscribers/:id/service-accounts',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service accounts'],
        summary: 'Add a service account using the plan price effective now',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'service.manage',
      );
      const account = await masterData.createServiceAccount(
        request.params.id,
        createServiceAccountSchema.parse(request.body),
        actor.id,
      );
      return reply.status(201).send({
        success: true,
        message: 'Service account created.',
        data: account,
      });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/v1/service-accounts/:id/status',
    {
      schema: {
        ...protectedRoute,
        tags: ['Service accounts'],
        summary: 'Change service-account lifecycle status with history',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'service.manage',
      );
      return {
        success: true,
        message: 'Service status updated.',
        data: await masterData.changeServiceStatus(
          request.params.id,
          changeServiceStatusSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );
}
