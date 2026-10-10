import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

import { AuthError, type AuthService, readBearerToken } from './auth.js';
import { BillingError, type BillingService } from './billing.js';
import { registerBillingRoutes } from './billing-routes.js';
import { CollectionError, type CollectionService } from './collections.js';
import { registerCollectionRoutes } from './collection-routes.js';
import { MasterDataError, type MasterDataService } from './master-data.js';
import { registerMasterDataRoutes } from './master-data-routes.js';
import { registerOperationRoutes } from './operation-routes.js';
import { OperationError, type OperationService } from './operations.js';
import { PaymentError, type PaymentService } from './payments.js';
import { registerPaymentRoutes } from './payment-routes.js';
import { registerReceivableRoutes } from './receivable-routes.js';
import { ReceivableError, type ReceivableService } from './receivables.js';
import { registerReportRoutes } from './report-routes.js';
import { ReportError, type ReportService } from './reports.js';
import { ZodError } from 'zod';

export interface AppDependencies {
  checkReadiness: () => Promise<void>;
  authService?: AuthService;
  masterDataService?: MasterDataService;
  billingService?: BillingService;
  paymentService?: PaymentService;
  collectionService?: CollectionService;
  receivableService?: ReceivableService;
  reportService?: ReportService;
  operationService?: OperationService;
  logger?: FastifyServerOptions['logger'];
}

const healthDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['service', 'status', 'timestamp'],
  properties: {
    service: { type: 'string', const: 'bcis-api' },
    status: { type: 'string', enum: ['ok', 'degraded'] },
    timestamp: { type: 'string', format: 'date-time' },
  },
} as const;

const healthSuccessSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'message', 'data'],
  properties: {
    success: { type: 'boolean', const: true },
    message: { type: 'string' },
    data: healthDataSchema,
  },
} as const;

const healthFailureSchema = {
  ...healthSuccessSchema,
  properties: {
    ...healthSuccessSchema.properties,
    success: { type: 'boolean', const: false },
  },
} as const;

function healthData(status: 'ok' | 'degraded') {
  return {
    service: 'bcis-api' as const,
    status,
    timestamp: new Date().toISOString(),
  };
}

export async function createApp({
  checkReadiness,
  authService,
  masterDataService,
  billingService,
  paymentService,
  collectionService,
  receivableService,
  reportService,
  operationService,
  logger = false,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onRequest', async (request, reply) => {
    if (
      operationService?.isRestoring() &&
      !request.url.startsWith('/api/v1/health')
    )
      return reply.status(503).send({
        success: false,
        message:
          'The server is temporarily unavailable while a restore is in progress.',
        errors: {},
      });
  });

  app.addHook('onSend', async (_request, reply) => {
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('X-Frame-Options', 'DENY');
    void reply.header('Referrer-Policy', 'no-referrer');
    void reply.header('Cache-Control', 'no-store');
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'BCIS API',
        description: 'LAN API for BCIS subscription billing and collection.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'opaque',
            description:
              'Opaque BCIS session token. Only its SHA-256 hash is stored.',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof MasterDataError) {
      return reply
        .status(error.statusCode)
        .send({ success: false, message: error.message, errors: {} });
    }
    if (error instanceof BillingError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof PaymentError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof CollectionError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof ReceivableError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof ReportError) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof OperationError) {
      if (error.cause)
        request.log.error(
          { err: error.cause, requestId: request.id },
          'Operational request failed',
        );
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: {},
      });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({
        success: false,
        message: 'The request contains invalid data.',
        errors: { request: error.issues.map((issue) => issue.message) },
      });
    }
    if (error instanceof Error && 'validation' in error && error.validation) {
      return reply.status(422).send({
        success: false,
        message: 'The request contains invalid data.',
        errors: { request: ['Check the submitted fields and try again.'] },
      });
    }
    if (
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 400
    ) {
      return reply.status(400).send({
        success: false,
        message: 'The request body is malformed.',
        errors: { request: ['Submit a valid request body and try again.'] },
      });
    }
    request.log.error(
      { err: error, requestId: request.id },
      'Unhandled request error',
    );
    void reply.status(500).send({
      success: false,
      message: 'The server could not complete the request.',
      errors: {},
    });
  });

  app.get(
    '/api/v1/health/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Check whether the API process is running',
        response: { 200: healthSuccessSchema },
      },
    },
    async () => ({
      success: true,
      message: 'BCIS API is running.',
      data: healthData('ok'),
    }),
  );

  if (authService) {
    const errorSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['success', 'message', 'errors'],
      properties: {
        success: { type: 'boolean', const: false },
        message: { type: 'string' },
        errors: { type: 'object', additionalProperties: true },
      },
    } as const;
    const safeUser = {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'username',
        'fullName',
        'roles',
        'permissions',
        'mustChangePassword',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        fullName: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
        permissions: { type: 'array', items: { type: 'string' } },
        mustChangePassword: { type: 'boolean' },
      },
    } as const;
    const actionSuccess = {
      type: 'object',
      additionalProperties: false,
      required: ['success', 'message', 'data'],
      properties: {
        success: { type: 'boolean', const: true },
        message: { type: 'string' },
        data: { type: 'object', additionalProperties: false },
      },
    } as const;
    const loginSuccess = {
      type: 'object',
      additionalProperties: false,
      required: ['success', 'message', 'data'],
      properties: {
        success: { type: 'boolean', const: true },
        message: { type: 'string' },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['accessToken', 'tokenType', 'expiresAt', 'user'],
          properties: {
            accessToken: { type: 'string' },
            tokenType: { type: 'string', const: 'Bearer' },
            expiresAt: { type: 'string', format: 'date-time' },
            user: safeUser,
          },
        },
      },
    } as const;
    const sessionSuccess = {
      type: 'object',
      additionalProperties: false,
      required: ['success', 'message', 'data'],
      properties: {
        success: { type: 'boolean', const: true },
        message: { type: 'string' },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['expiresAt', 'locked', 'user'],
          properties: {
            expiresAt: { type: 'string', format: 'date-time' },
            locked: { type: 'boolean' },
            user: safeUser,
          },
        },
      },
    } as const;
    const tokenFor = (authorization: string | undefined) =>
      readBearerToken(authorization);

    app.post<{ Body: { username: string; password: string } }>(
      '/api/v1/auth/login',
      {
        schema: {
          tags: ['Authentication'],
          summary: 'Create an opaque database-backed session',
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['username', 'password'],
            properties: {
              username: { type: 'string', minLength: 1, maxLength: 100 },
              password: { type: 'string', minLength: 8, maxLength: 256 },
            },
          },
          response: {
            200: loginSuccess,
            401: errorSchema,
            403: errorSchema,
            429: errorSchema,
          },
        },
      },
      async (request) => {
        const result = await authService.login(
          request.body.username,
          request.body.password,
        );
        return {
          success: true,
          message: 'Signed in successfully.',
          data: {
            accessToken: result.token,
            tokenType: 'Bearer' as const,
            expiresAt: result.expiresAt.toISOString(),
            user: result.user,
          },
        };
      },
    );

    app.get(
      '/api/v1/auth/session',
      {
        schema: {
          tags: ['Authentication'],
          summary: 'Read the current session without exposing its token',
          security: [{ bearerAuth: [] }],
          response: {
            200: sessionSuccess,
            401: errorSchema,
            403: errorSchema,
          },
        },
      },
      async (request) => {
        const result = await authService.current(
          tokenFor(request.headers.authorization),
          true,
        );
        return {
          success: true,
          message: 'Session loaded.',
          data: {
            ...result,
            expiresAt: result.expiresAt.toISOString(),
          },
        };
      },
    );

    app.post(
      '/api/v1/auth/logout',
      {
        schema: {
          tags: ['Authentication'],
          summary: 'Revoke the current session',
          security: [{ bearerAuth: [] }],
          response: { 200: actionSuccess, 401: errorSchema },
        },
      },
      async (request) => {
        await authService.logout(tokenFor(request.headers.authorization));
        return { success: true, message: 'Signed out.', data: {} };
      },
    );

    app.post(
      '/api/v1/auth/lock',
      {
        schema: {
          tags: ['Authentication'],
          summary: 'Lock the current desktop session',
          security: [{ bearerAuth: [] }],
          response: { 200: actionSuccess, 401: errorSchema, 403: errorSchema },
        },
      },
      async (request) => {
        await authService.lock(tokenFor(request.headers.authorization));
        return { success: true, message: 'Session locked.', data: {} };
      },
    );

    app.post<{ Body: { password: string } }>(
      '/api/v1/auth/unlock',
      {
        schema: {
          tags: ['Authentication'],
          summary: 'Unlock the current desktop session',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['password'],
            properties: {
              password: { type: 'string', minLength: 8, maxLength: 256 },
            },
          },
          response: { 200: actionSuccess, 401: errorSchema },
        },
      },
      async (request) => {
        await authService.unlock(
          tokenFor(request.headers.authorization),
          request.body.password,
        );
        return { success: true, message: 'Session unlocked.', data: {} };
      },
    );

    app.get(
      '/api/v1/administration/access-check',
      {
        schema: {
          tags: ['Administration'],
          summary: 'Verify the user-management permission boundary',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['success', 'message', 'data'],
              properties: {
                success: { type: 'boolean', const: true },
                message: { type: 'string' },
                data: safeUser,
              },
            },
            401: errorSchema,
            403: errorSchema,
          },
        },
      },
      async (request) => ({
        success: true,
        message: 'User administration access granted.',
        data: await authService.requirePermission(
          tokenFor(request.headers.authorization),
          'user.manage',
        ),
      }),
    );

    if (masterDataService) {
      await registerMasterDataRoutes(app, authService, masterDataService);
    }
    if (billingService) {
      await registerBillingRoutes(app, authService, billingService);
    }
    if (paymentService) {
      await registerPaymentRoutes(app, authService, paymentService);
    }
    if (collectionService) {
      await registerCollectionRoutes(app, authService, collectionService);
    }
    if (receivableService) {
      await registerReceivableRoutes(app, authService, receivableService);
    }
    if (reportService) {
      await registerReportRoutes(app, authService, reportService);
    }
    if (operationService) {
      await registerOperationRoutes(app, authService, operationService);
    }
  }

  app.get(
    '/api/v1/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Check whether PostgreSQL is reachable',
        response: {
          200: healthSuccessSchema,
          503: healthFailureSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await checkReadiness();
        return {
          success: true,
          message: 'BCIS API is ready.',
          data: healthData('ok'),
        };
      } catch {
        return reply.status(503).send({
          success: false,
          message: 'Database is unavailable.',
          data: healthData('degraded'),
        });
      }
    },
  );

  return app;
}
