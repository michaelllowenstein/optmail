import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';

// ── Environment setup (before any imports that read config) ─────────────────

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/otp_email_api_test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.ADMIN_API_KEY = 'test-admin-key';

// ── Mock dependencies ───────────────────────────────────────────────────────
//
// These tests validate request/response shapes and auth flow
// without hitting real DB or Resend. Production integration tests
// will use a real test database.

let app: FastifyInstance;

describe('OTP routes — schema validation & auth', () => {
  before(async () => {
    app = Fastify({ logger: false });

    // Register the auth plugin
    const { default: clientAuth } = await import('../src/plugins/auth');
    await app.register(clientAuth);

    // Register OTP routes
    const { otpRoutes } = await import('../src/routes/otp');
    await app.register(otpRoutes, { prefix: '/api/otp' });

    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('rejects /api/otp/generate without X-API-Key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/otp/generate',
      payload: { recipient: 'user@example.com' },
    });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'Missing X-API-Key header.' });
  });

  it('rejects /api/otp/generate with invalid API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/otp/generate',
      headers: { 'x-api-key': 'msi_invalid_key_12345' },
      payload: { recipient: 'user@example.com' },
    });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'Invalid API key.' });
  });

  it('rejects /api/otp/verify without X-API-Key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/otp/verify',
      payload: { recipient: 'user@example.com', code: '123456' },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('Admin routes — auth', () => {
  before(async () => {
    // Use a fresh app instance
    app = Fastify({ logger: false });

    const { default: clientAuth } = await import('../src/plugins/auth');
    await app.register(clientAuth);

    const { clientRoutes } = await import('../src/routes/client');
    await app.register(clientRoutes, { prefix: '/api/admin/clients' });

    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('rejects admin routes without bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/clients',
    });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'Admin authentication required.' });
  });

  it('rejects admin routes with wrong bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/clients',
      headers: { authorization: 'Bearer wrong-key' },
    });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.json(), { error: 'Invalid admin credentials.' });
  });
});