import {
  adjustmentInputSchema,
  billingPeriodSchema,
  invoiceListQuerySchema,
  ledgerQuerySchema,
  voidInvoiceSchema,
} from '@bcis/contracts';
import type { FastifyInstance } from 'fastify';

import { type AuthService, readBearerToken } from './auth.js';
import type { BillingService } from './billing.js';

const protectedRoute = { security: [{ bearerAuth: [] }] } as const;

export async function registerBillingRoutes(
  app: FastifyInstance,
  auth: AuthService,
  billing: BillingService,
) {
  const authorize = (
    authorization: string | undefined,
    permission: 'billing.view' | 'billing.generate',
  ) => auth.requirePermission(readBearerToken(authorization), permission);

  app.get(
    '/api/v1/billing-cycles',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'List billing cycles with invoice totals',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'billing.view');
      return {
        success: true,
        message: 'Billing cycles loaded.',
        data: await billing.listCycles(),
      };
    },
  );

  app.post(
    '/api/v1/billing-cycles',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Generate idempotent draft invoices for one month',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'billing.generate',
      );
      const result = await billing.generateDrafts(
        billingPeriodSchema.parse(request.body),
        actor.id,
      );
      return reply.status(201).send({
        success: true,
        message: 'Billing drafts generated.',
        data: result,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/billing-cycles/:id/finalize',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Finalize a billing cycle and post ledger debits atomically',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'billing.generate',
      );
      return {
        success: true,
        message: 'Billing cycle finalized.',
        data: await billing.finalizeCycle(request.params.id, actor.id),
      };
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/api/v1/invoices',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Search and paginate invoices',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'billing.view');
      return {
        success: true,
        message: 'Invoices loaded.',
        data: await billing.listInvoices(
          invoiceListQuerySchema.parse(request.query),
        ),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/invoices/:id',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Read an invoice and its immutable lines/adjustments',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'billing.view');
      return {
        success: true,
        message: 'Invoice loaded.',
        data: await billing.invoice(request.params.id),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/invoices/:id/adjustments',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Post a linked debit or credit adjustment',
      },
    },
    async (request, reply) => {
      const actor = await authorize(
        request.headers.authorization,
        'billing.generate',
      );
      return reply.status(201).send({
        success: true,
        message: 'Adjustment posted.',
        data: await billing.addAdjustment(
          request.params.id,
          adjustmentInputSchema.parse(request.body),
          actor.id,
        ),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/invoices/:id/void',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Void an invoice through a linked ledger credit',
      },
    },
    async (request) => {
      const actor = await authorize(
        request.headers.authorization,
        'billing.generate',
      );
      const input = voidInvoiceSchema.parse(request.body);
      return {
        success: true,
        message: 'Invoice voided.',
        data: await billing.voidInvoice(
          request.params.id,
          input.reason,
          actor.id,
        ),
      };
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: Record<string, string | undefined>;
  }>(
    '/api/v1/subscribers/:id/ledger',
    {
      schema: {
        ...protectedRoute,
        tags: ['Billing'],
        summary: 'Read a chronological subscriber ledger for an SOA range',
      },
    },
    async (request) => {
      await authorize(request.headers.authorization, 'billing.view');
      return {
        success: true,
        message: 'Subscriber ledger loaded.',
        data: await billing.ledger(
          request.params.id,
          ledgerQuerySchema.parse(request.query),
        ),
      };
    },
  );
}
