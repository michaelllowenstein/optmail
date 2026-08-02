/**
 * plugins/client-auth.ts
 *
 * Multi-tenant API key authentication.
 *
 * Every request to /api/otp/* and /api/email/* must include:
 *   X-API-Key: <client-api-key>
 *
 * The key is SHA-256 hashed and matched against the clients table.
 * On success, req.clientId and req.clientRecord are decorated.
 *
 * Admin routes (/api/admin/*) use a separate static bearer token
 * from ADMIN_API_KEY — hard boundary from client auth plane.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createHash } from 'crypto';
import { queryOne } from '../db/pool';
import { config } from '../config';
import type { ClientRecord } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ── Client lookup (with simple in-memory cache for hot path) ────────────────

const CLIENT_CACHE = new Map<string, { record: ClientRecord; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

async function lookupClient(apiKeyHash: string): Promise<ClientRecord | null> {
  const cached = CLIENT_CACHE.get(apiKeyHash);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.record;
  }

  const row = await queryOne<ClientRecord>(
    `SELECT * FROM clients WHERE api_key_hash = $1 AND is_active = true`,
    [apiKeyHash],
  );

  if (row) {
    CLIENT_CACHE.set(apiKeyHash, { record: row, cachedAt: Date.now() });
  }

  return row;
}

/** Invalidate cache for a specific client (called after updates). */
export function invalidateClientCache(apiKeyHash?: string): void {
  if (apiKeyHash) {
    CLIENT_CACHE.delete(apiKeyHash);
  } else {
    CLIENT_CACHE.clear();
  }
}

// ── Plugin ──────────────────────────────────────────────────────────────────

async function clientAuthPlugin(fastify: FastifyInstance): Promise<void> {
  // ── Client API key verification ─────────────────────────────────────────
  fastify.decorate(
    'verifyClient',
    async function verifyClient(req: FastifyRequest, reply: FastifyReply): Promise<void> {
      const apiKey = req.headers['x-api-key'] as string | undefined;

      if (!apiKey) {
        return reply.status(401).send({ error: 'Missing X-API-Key header.' });
      }

      const keyHash = hashApiKey(apiKey);
      const client = await lookupClient(keyHash);

      if (!client) {
        return reply.status(401).send({ error: 'Invalid API key.' });
      }

      req.clientId = client.id;
      req.clientRecord = client;
    },
  );

  // ── Admin bearer token verification ────────────────────────────────────
  fastify.decorate(
    'verifyAdmin',
    async function verifyAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Admin authentication required.' });
      }

      const token = header.slice(7);
      if (token !== config.admin.apiKey) {
        return reply.status(403).send({ error: 'Invalid admin credentials.' });
      }
    },
  );
}

// ── Fastify type augmentation ───────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    verifyClient(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    verifyAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

export default fp(clientAuthPlugin, { name: 'client-auth' });