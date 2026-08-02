/**
 * routes/email.ts
 *
 * POST /api/email/confirmation  — send a confirmation email
 * POST /api/email/contact       — send a contact-us form (to client + auto-reply to sender)
 * POST /api/email/newsletter    — send a newsletter to 1–100 recipients
 *
 * All routes require X-API-Key (client auth) and check allowed_email_types.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  sendConfirmationSchema,
  sendContactSchema,
  sendNewsletterSchema,
} from '../schema';
import { sendEmail } from '../services/mailer';
import { confirmationEmailHtml, confirmationEmailText } from '../templates/confirmation';
import {
  contactEmailHtml,
  contactEmailText,
  contactAutoReplyHtml,
  contactAutoReplyText,
} from '../templates/contact';
import { newsletterEmailHtml, newsletterEmailText } from '../templates/newsletter';
import type { ClientRecord } from '../types';

// ── Type guards for allowed email types ─────────────────────────────────────

function assertEmailTypeAllowed(client: ClientRecord, type: string, reply: FastifyReply): boolean {
  if (!client.allowed_email_types.includes(type as any)) {
    reply.status(403).send({ error: `${type} emails not enabled for this client.` });
    return false;
  }
  return true;
}

// ── Route definitions ───────────────────────────────────────────────────────

export async function emailRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/email/confirmation ──────────────────────────────────────────
  fastify.post(
    '/confirmation',
    {
      schema: sendConfirmationSchema,
      preHandler: [(fastify as any).verifyClient],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (
      req: FastifyRequest<{
        Body: {
          to: string;
          recipientName?: string;
          subject?: string;
          heading: string;
          bodyText: string;
          ctaUrl?: string;
          ctaLabel?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const client = req.clientRecord!;
      if (!assertEmailTypeAllowed(client, 'confirmation', reply)) return;

      const { to, recipientName, heading, bodyText, ctaUrl, ctaLabel } = req.body;
      const subject = req.body.subject ?? heading;

      try {
        await sendEmail({
          client,
          emailType: 'confirmation',
          to,
          subject,
          html: confirmationEmailHtml({
            clientName: client.from_name,
            recipientName,
            subject,
            heading,
            bodyText,
            ctaUrl,
            ctaLabel,
          }),
          text: confirmationEmailText({
            clientName: client.from_name,
            recipientName,
            subject,
            heading,
            bodyText,
            ctaUrl,
            ctaLabel,
          }),
        });

        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to send confirmation email');
        return reply.status(502).send({ error: 'Failed to send email. Please try again.' });
      }
    },
  );

  // ── POST /api/email/contact ───────────────────────────────────────────────
  fastify.post(
    '/contact',
    {
      schema: sendContactSchema,
      preHandler: [(fastify as any).verifyClient],
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (
      req: FastifyRequest<{
        Body: {
          senderName: string;
          senderEmail: string;
          senderPhone?: string;
          subject?: string;
          message: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const client = req.clientRecord!;
      if (!assertEmailTypeAllowed(client, 'contact', reply)) return;

      const { senderName, senderEmail, senderPhone, subject, message } = req.body;

      try {
        // 1. Send the contact form to the client's inbox
        await sendEmail({
          client,
          emailType: 'contact',
          to: client.reply_to || client.from_email,
          subject: subject
            ? `Contact: ${subject} — ${senderName}`
            : `Contact Form — ${senderName}`,
          html: contactEmailHtml({
            clientName: client.from_name,
            senderName,
            senderEmail,
            senderPhone,
            subject,
            message,
          }),
          text: contactEmailText({
            clientName: client.from_name,
            senderName,
            senderEmail,
            senderPhone,
            subject,
            message,
          }),
          replyTo: senderEmail,
          metadata: { senderEmail },
        });

        // 2. Send auto-reply confirmation to the sender
        await sendEmail({
          client,
          emailType: 'confirmation',
          to: senderEmail,
          subject: `We've received your message — ${client.from_name}`,
          html: contactAutoReplyHtml({
            clientName: client.from_name,
            senderName,
          }),
          text: contactAutoReplyText({
            clientName: client.from_name,
            senderName,
          }),
          metadata: { autoReply: true },
        });

        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to send contact email');
        return reply.status(502).send({ error: 'Failed to send message. Please try again.' });
      }
    },
  );

  // ── POST /api/email/newsletter ────────────────────────────────────────────
  fastify.post(
    '/newsletter',
    {
      schema: sendNewsletterSchema,
      preHandler: [(fastify as any).verifyClient],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (
      req: FastifyRequest<{
        Body: {
          recipients: Array<{ email: string; unsubscribeUrl?: string }>;
          subject: string;
          heading: string;
          preheader?: string;
          bodyHtml: string;
          bodyText: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const client = req.clientRecord!;
      if (!assertEmailTypeAllowed(client, 'newsletter', reply)) return;

      const { recipients, subject, heading, preheader, bodyHtml, bodyText } = req.body;

      let sent = 0;
      let failed = 0;

      // Send individually (Resend batch API has limitations; individual
      // sends allow per-recipient unsubscribe URLs and error tracking)
      for (const recipient of recipients) {
        try {
          await sendEmail({
            client,
            emailType: 'newsletter',
            to: recipient.email,
            subject,
            html: newsletterEmailHtml({
              clientName: client.from_name,
              subject,
              heading,
              preheader,
              bodyHtml,
              bodyText,
              unsubscribeUrl: recipient.unsubscribeUrl,
            }),
            text: newsletterEmailText({
              clientName: client.from_name,
              subject,
              heading,
              preheader,
              bodyHtml,
              bodyText,
              unsubscribeUrl: recipient.unsubscribeUrl,
            }),
          });
          sent++;
        } catch (err) {
          req.log.warn({ err, email: recipient.email }, 'Newsletter send failed for recipient');
          failed++;
        }
      }

      return reply.status(200).send({ sent, failed });
    },
  );
}