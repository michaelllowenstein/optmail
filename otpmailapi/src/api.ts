import * as dotenv from 'dotenv';
dotenv.config();

/**
 * src/api.ts — OTP + Email API
 *
 * Multi-tenant API serving OTP generation/verification and email
 * routing for multiple MSI client applications.
 *
 * Route map:
 *
 *   GET    /health                              liveness probe
 *
 *   POST   /api/otp/generate                    generate + send OTP        (X-API-Key)
 *   POST   /api/otp/verify                      verify an OTP code         (X-API-Key)
 *
 *   POST   /api/email/confirmation              send confirmation email    (X-API-Key)
 *   POST   /api/email/contact                   contact-us form            (X-API-Key)
 *   POST   /api/email/newsletter                newsletter send            (X-API-Key)
 *
 *   POST   /api/admin/clients                   register a client app      (Bearer admin)
 *   GET    /api/admin/clients                   list clients               (Bearer admin)
 *   PATCH  /api/admin/clients/:id               update a client            (Bearer admin)
 *   DELETE /api/admin/clients/:id               deactivate a client        (Bearer admin)
 *   POST   /api/admin/clients/:id/rotate-key    rotate API key             (Bearer admin)
 */

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { FastifyServerOptions } from 'fastify';

import { config } from './config';
import clientAuthPlugin from './plugins/auth';
import { otpRoutes } from './routes/otp';
import { emailRoutes } from './routes/email';
import { clientRoutes } from './routes/client';
import { closePool } from './db/pool';

async function main() {
  const serverOptions: FastifyServerOptions = {
    logger: {
      level: config.log.level,
      ...(config.isDev
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    ajv: {
      customOptions: {
        // Reject unknown fields — explicit is better than silent stripping
        removeAdditional: false,
        allErrors: true,
      },
    },
  };

  const fastify = Fastify(serverOptions);

  // ── Security ─────────────────────────────────────────────────────────────

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // ── CORS ─────────────────────────────────────────────────────────────────

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Server-to-server (no Origin header) — always allowed
      if (!origin) return cb(null, true);
      if (config.cors.allowedOrigins.includes(origin)) return cb(null, true);
      if (config.isDev && origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        return cb(null, true);
      }
      cb(new Error(`Origin '${origin}' not permitted by CORS policy`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  // ── Rate limiting (global default) ───────────────────────────────────────

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0].trim() ?? req.ip,
  });

  // ── Swagger docs ─────────────────────────────────────────────────────────

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'OTP + Email API',
        description: 'Multi-tenant OTP generation/verification and email routing',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
            description: 'Client application API key',
          },
          adminBearer: {
            type: 'http',
            scheme: 'bearer',
            description: 'Admin static bearer token',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ── Auth plugin ──────────────────────────────────────────────────────────

  await fastify.register(clientAuthPlugin);

  // ── Health check ─────────────────────────────────────────────────────────

  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              env: { type: 'string' },
              ts: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) =>
      reply.status(200).send({
        ok: true,
        env: config.nodeEnv,
        ts: new Date().toISOString(),
      }),
  );

  // ── API routes ───────────────────────────────────────────────────────────

  fastify.register(otpRoutes, { prefix: '/api/otp' });
  fastify.register(emailRoutes, { prefix: '/api/email' });
  fastify.register(clientRoutes, { prefix: '/api/admin/clients' });

  // ── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Start ────────────────────────────────────────────────────────────────

  try {
    await fastify.listen({ port: config.port, host: config.host });

    const base = `http://localhost:${config.port}`;
    fastify.log.info('');
    fastify.log.info('  ✓ OTP + Email API');
    fastify.log.info(`    env      : ${config.nodeEnv}`);
    fastify.log.info(`    base     : ${base}/api`);
    fastify.log.info(`    docs     : ${base}/api/docs`);
    fastify.log.info(`    health   : ${base}/health`);
    fastify.log.info('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();