/**
 * routes/clients.ts
 *
 * Admin-only client management.
 * Protected by static bearer token (ADMIN_API_KEY) — hard boundary
 * from client auth plane, same privilege-separation pattern as auth-api.
 *
 * POST   /api/admin/clients           — register a new client
 * GET    /api/admin/clients           — list all clients
 * PATCH  /api/admin/clients/:id       — update a client
 * DELETE /api/admin/clients/:id       — deactivate a client
 * POST   /api/admin/clients/:id/rotate-key — issue a new API key
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { query, queryOne } from '../db/pool';
import { hashApiKey, invalidateClientCache } from '../plugins/auth';
import { registerClientSchema, listClientsSchema } from '../schema';
import { config } from '../config';
import type { ClientRecord } from '../types';

function generateApiKey(): string {
  // msi_ prefix + 32 random bytes as hex = 68 char key
  return `msi_${randomBytes(32).toString('hex')}`;
}

export async function clientRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/admin/clients ───────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: registerClientSchema,
      preHandler: [(fastify as any).verifyAdmin],
    },
    async (
      req: FastifyRequest<{
        Body: {
          name: string;
          slug: string;
          fromEmail: string;
          fromName: string;
          replyTo?: string;
          allowedEmailTypes?: string[];
          otpLength?: number;
          otpTtlSeconds?: number;
          otpMaxAttempts?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        name,
        slug,
        fromEmail,
        fromName,
        replyTo,
        allowedEmailTypes,
        otpLength,
        otpTtlSeconds,
        otpMaxAttempts,
      } = req.body;

      // Check for duplicate slug
      const existing = await queryOne(`SELECT id FROM clients WHERE slug = $1`, [slug]);
      if (existing) {
        return reply.status(409).send({ error: `Client with slug '${slug}' already exists.` });
      }

      // Generate API key — shown to admin ONCE, then only the hash is stored
      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      const rows = await query<{ id: string }>(
        `INSERT INTO clients (name, slug, api_key_hash, from_email, from_name, reply_to,
                              allowed_email_types, otp_length, otp_ttl_seconds, otp_max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          name,
          slug,
          apiKeyHash,
          fromEmail,
          fromName,
          replyTo ?? null,
          allowedEmailTypes ?? ['otp', 'confirmation', 'contact', 'newsletter'],
          otpLength ?? config.otp.length,
          otpTtlSeconds ?? config.otp.ttlSeconds,
          otpMaxAttempts ?? config.otp.maxAttempts,
        ],
      );

      req.log.info({ slug, clientId: rows[0].id }, 'Client registered');

      return reply.status(201).send({
        id: rows[0].id,
        slug,
        apiKey, // ⚠ Plaintext — shown once, never retrievable again
      });
    },
  );

  // ── GET /api/admin/clients ────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: listClientsSchema,
      preHandler: [(fastify as any).verifyAdmin],
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = await query<ClientRecord>(
        `SELECT id, name, slug, from_email, from_name, allowed_email_types,
                is_active, created_at, updated_at
         FROM clients
         ORDER BY created_at DESC`,
      );

      return reply.status(200).send(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          fromEmail: r.from_email,
          fromName: r.from_name,
          allowedEmailTypes: r.allowed_email_types,
          isActive: r.is_active,
          createdAt: r.created_at,
        })),
      );
    },
  );

  // ── PATCH /api/admin/clients/:id ──────────────────────────────────────────
  fastify.patch(
    '/:id',
    {
      preHandler: [(fastify as any).verifyAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Update a client',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name:              { type: 'string', maxLength: 100 },
            fromEmail:         { type: 'string', format: 'email' },
            fromName:          { type: 'string', maxLength: 100 },
            replyTo:           { type: 'string', format: 'email' },
            allowedEmailTypes: { type: 'array', items: { type: 'string' } },
            otpLength:         { type: 'integer', minimum: 4, maximum: 8 },
            otpTtlSeconds:     { type: 'integer', minimum: 60, maximum: 3600 },
            otpMaxAttempts:    { type: 'integer', minimum: 1, maximum: 10 },
            isActive:          { type: 'boolean' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      const updates = req.body;

      // Build SET clause dynamically — only update provided fields
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        name: 'name',
        fromEmail: 'from_email',
        fromName: 'from_name',
        replyTo: 'reply_to',
        allowedEmailTypes: 'allowed_email_types',
        otpLength: 'otp_length',
        otpTtlSeconds: 'otp_ttl_seconds',
        otpMaxAttempts: 'otp_max_attempts',
        isActive: 'is_active',
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${col} = $${idx}`);
          values.push(updates[key]);
          idx++;
        }
      }

      if (fields.length === 0) {
        return reply.status(400).send({ error: 'No fields to update.' });
      }

      fields.push(`updated_at = now()`);
      values.push(id);

      await query(
        `UPDATE clients SET ${fields.join(', ')} WHERE id = $${idx}`,
        values,
      );

      invalidateClientCache(); // Clear entire cache on any client change
      return reply.status(204).send();
    },
  );

  // ── DELETE /api/admin/clients/:id (soft delete) ───────────────────────────
  fastify.delete(
    '/:id',
    {
      preHandler: [(fastify as any).verifyAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Deactivate a client',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      await query(
        `UPDATE clients SET is_active = false, updated_at = now() WHERE id = $1`,
        [req.params.id],
      );

      invalidateClientCache();
      return reply.status(204).send();
    },
  );

  // ── POST /api/admin/clients/:id/rotate-key ────────────────────────────────
  fastify.post(
    '/:id/rotate-key',
    {
      preHandler: [(fastify as any).verifyAdmin],
      schema: {
        tags: ['Admin'],
        summary: 'Rotate a client API key',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              apiKey: { type: 'string', description: 'New plaintext API key — shown ONCE' },
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const newKey = generateApiKey();
      const newHash = hashApiKey(newKey);

      const rows = await query<{ id: string }>(
        `UPDATE clients SET api_key_hash = $1, updated_at = now()
         WHERE id = $2 AND is_active = true
         RETURNING id`,
        [newHash, req.params.id],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Client not found or inactive.' });
      }

      invalidateClientCache();

      req.log.info({ clientId: req.params.id }, 'API key rotated');

      return reply.status(200).send({ apiKey: newKey });
    },
  );
}