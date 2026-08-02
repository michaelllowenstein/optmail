/**
 * routes/otp.ts
 *
 * POST /api/otp/generate   — generate an OTP, send it via email, return the otpId
 * POST /api/otp/verify     — verify a submitted OTP code
 *
 * Both routes require X-API-Key (client auth).
 * Generate is rate-limited aggressively to prevent abuse.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateOtpSchema, verifyOtpSchema } from '../schema';
import { generateOtp, verifyOtp } from '../services/otp';
import { sendEmail } from '../services/mailer';
import { otpEmailHtml, otpEmailText } from '../templates/otp';

interface GenerateBody {
  recipient: string;
  purpose?: string;
  recipientName?: string;
}

interface VerifyBody {
  recipient: string;
  code: string;
  purpose?: string;
}

export async function otpRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/otp/generate ────────────────────────────────────────────────
  fastify.post(
    '/generate',
    {
      schema: generateOtpSchema,
      preHandler: [(fastify as any).verifyClient],
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (req: FastifyRequest<{ Body: GenerateBody }>, reply: FastifyReply) => {
      const client = req.clientRecord!;
      const { recipient, purpose = 'login', recipientName } = req.body;

      // Check if client is allowed to send OTP emails
      if (!client.allowed_email_types.includes('otp')) {
        return reply.status(403).send({ error: 'OTP emails not enabled for this client.' });
      }

      try {
        // 1. Generate OTP and store in DB
        const { code, otpId, expiresAt } = await generateOtp(client, recipient, purpose);

        // 2. Send OTP email
        const ttlMinutes = Math.ceil(client.otp_ttl_seconds / 60);

        await sendEmail({
          client,
          emailType: 'otp',
          to: recipient,
          subject: `Your verification code: ${code}`,
          html: otpEmailHtml({
            clientName: client.from_name,
            code,
            ttlMinutes,
            purpose,
            recipientName,
          }),
          text: otpEmailText({
            clientName: client.from_name,
            code,
            ttlMinutes,
            purpose,
            recipientName,
          }),
          metadata: { otpId, purpose },
        });

        return reply.status(200).send({
          otpId,
          expiresAt,
          message: `Verification code sent to ${recipient}.`,
        });
      } catch (err) {
        req.log.error({ err }, 'Failed to generate/send OTP');
        return reply.status(502).send({ error: 'Failed to send verification code. Please try again.' });
      }
    },
  );

  // ── POST /api/otp/verify ─────────────────────────────────────────────────
  fastify.post(
    '/verify',
    {
      schema: verifyOtpSchema,
      preHandler: [(fastify as any).verifyClient],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
      const clientId = req.clientId!;
      const { recipient, code, purpose = 'login' } = req.body;

      try {
        const result = await verifyOtp(clientId, recipient, code, purpose);

        if (result.valid) {
          return reply.status(200).send({ valid: true, otpId: result.otpId });
        }

        // Map reason to user-friendly message
        const messages: Record<string, string> = {
          not_found: 'No pending verification code found. It may have expired.',
          expired: 'Verification code has expired. Please request a new one.',
          locked: 'Too many failed attempts. Please request a new code.',
          invalid_code: 'Incorrect verification code.',
        };

        return reply.status(400).send({
          valid: false,
          reason: result.reason,
          message: messages[result.reason] ?? 'Verification failed.',
        });
      } catch (err) {
        req.log.error({ err }, 'OTP verification error');
        return reply.status(500).send({ error: 'Verification failed. Please try again.' });
      }
    },
  );
}