import {
  createPaymentSchema,
  gcashDecisionSchema,
  gcashSubmissionSchema,
  paymentListQuerySchema,
  paymentReversalSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type AuthService, readBearerToken } from './auth.js';
import type { PaymentService } from './payments.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;
const previewQuery = z.object({
  subscriberId: z.uuid(),
  amountCentavos: z.coerce.number().int().positive().safe(),
});

export async function registerPaymentRoutes(
  app: FastifyInstance,
  auth: AuthService,
  payments: PaymentService,
) {
  const authorize = (
    authorization: string | undefined,
    permission:
      | 'payment.view'
      | 'payment.create'
      | 'payment.verify_gcash'
      | 'payment.reverse',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/api/v1/payments/preview',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Preview oldest-first allocation and subscriber credit',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'payment.create');
      const query = previewQuery.parse(request.query);
      return {
        success: true,
        message: 'Payment allocation preview loaded.',
        data: await payments.preview(query.subscriberId, query.amountCentavos),
      };
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/api/v1/payments',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Search payment, receipt, and GCash history',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'payment.view');
      return {
        success: true,
        message: 'Payments loaded.',
        data: await payments.list(paymentListQuerySchema.parse(request.query)),
      };
    },
  );

  app.post(
    '/api/v1/payments',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Post and allocate a non-GCash payment atomically',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'payment.create',
      );
      return reply.status(201).send({
        success: true,
        message: 'Payment posted.',
        data: await payments.create(
          createPaymentSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.post(
    '/api/v1/gcash-submissions',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Store a pending GCash submission and proof image',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'payment.create',
      );
      return reply.status(201).send({
        success: true,
        message: 'GCash proof submitted for review.',
        data: await payments.submitGcash(
          gcashSubmissionSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/payments/:id/gcash-decision',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Approve or reject a pending GCash proof',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'payment.verify_gcash',
      );
      return {
        success: true,
        message: 'GCash decision recorded.',
        data: await payments.decideGcash(
          request.params.id,
          gcashDecisionSchema.parse(request.body),
          actor.id,
        ),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/payments/:id/reverse',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Reverse a posted payment without deleting its history',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'payment.reverse',
      );
      const input = paymentReversalSchema.parse(request.body);
      return {
        success: true,
        message: 'Payment reversed.',
        data: await payments.reverse(request.params.id, input.reason, actor.id),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/payment-proofs/:id',
    {
      schema: {
        ...protectedRoute,
        tags: ['Payments'],
        summary: 'Read a validated GCash proof for staff review',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'payment.verify_gcash');
      return {
        success: true,
        message: 'Payment proof loaded.',
        data: await payments.proof(request.params.id),
      };
    },
  );
}
