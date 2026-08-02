/**
 * services/mailer.ts
 *
 * All outgoing email — sent via the Resend HTTPS API.
 * Mirrors the fl-legal diagnostic logging pattern.
 *
 * Every email is logged to the email_log table for audit.
 * Client branding (from_email, from_name) comes from the client record,
 * not from global config — each tenant has its own sender identity.
 */

import { Resend } from 'resend';
import { config } from '../config';
import { query } from '../db/pool';
import type { ClientRecord, EmailType } from '../types';

// ── Initialise Resend client ────────────────────────────────────────────────

const RESEND_KEY = config.email.apiKey ?? '';

console.log('[mailer] ──────────────────────────────────────────────');
console.log('[mailer] Initialising Resend email service');
console.log('[mailer]   NODE_ENV:       ', config.nodeEnv);
console.log('[mailer]   apiKey present: ', !!RESEND_KEY);
console.log('[mailer]   apiKey prefix:  ', RESEND_KEY ? RESEND_KEY.slice(0, 6) + '...' : '(empty)');
console.log('[mailer]   testRecipient:  ', config.email.testRecipient || '(not set — real addresses)');
console.log('[mailer] ──────────────────────────────────────────────');

if (!RESEND_KEY) {
  console.error('[mailer] ⚠ RESEND_API_KEY is empty — all sends will fail');
}

const resend = new Resend(RESEND_KEY);

// ── Public send interface ───────────────────────────────────────────────────

export interface SendEmailOptions {
  client: ClientRecord;
  emailType: EmailType;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ resendId: string | null }> {
  // Respect the test recipient safety net
  const to = config.email.testRecipient || opts.to;
  const from = `${opts.client.from_name} <${opts.client.from_email}>`;
  const replyTo = opts.replyTo || opts.client.reply_to || undefined;

  console.log('[mailer:send] ─── Preparing email ───');
  console.log('[mailer:send]   client:    ', opts.client.slug);
  console.log('[mailer:send]   type:      ', opts.emailType);
  console.log('[mailer:send]   from:      ', from);
  console.log('[mailer:send]   to:        ', to);
  console.log('[mailer:send]   subject:   ', opts.subject);
  console.log('[mailer:send]   replyTo:   ', replyTo ?? '(none)');

  const t0 = Date.now();

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    });

    const ms = Date.now() - t0;

    if (result.error) {
      console.error('[mailer:send] ❌ Resend returned error:', JSON.stringify(result.error, null, 2));

      await logEmail(opts, null, 'failed', `${result.error.name}: ${result.error.message}`);

      throw new Error(`Resend send failed [${result.error.name}]: ${result.error.message}`);
    }

    const resendId = result.data?.id ?? null;
    console.log(`[mailer:send] ✅ Email sent in ${ms}ms — Resend ID: ${resendId}`);

    await logEmail(opts, resendId, 'sent', null);

    return { resendId };
  } catch (err: any) {
    const ms = Date.now() - t0;

    // If we already threw from result.error, re-throw as-is
    if (err.message?.startsWith('Resend send failed')) {
      throw err;
    }

    console.error(`[mailer:send] ❌ Unexpected error in ${ms}ms:`, err.message ?? String(err));

    await logEmail(opts, null, 'failed', err.message ?? String(err));

    throw new Error(`Email send failed: ${err.message ?? String(err)}`);
  }
}

// ── Audit log ───────────────────────────────────────────────────────────────

async function logEmail(
  opts: SendEmailOptions,
  resendId: string | null,
  status: 'sent' | 'failed',
  error: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO email_log (client_id, email_type, recipient, subject, resend_id, status, error, metadata)
       VALUES ($1, $2::email_type, $3, $4, $5, $6::email_status, $7, $8)`,
      [
        opts.client.id,
        opts.emailType,
        config.email.testRecipient || opts.to,
        opts.subject,
        resendId,
        status,
        error,
        JSON.stringify(opts.metadata ?? {}),
      ],
    );
  } catch (logErr: any) {
    // Never let audit logging break the request
    console.error('[mailer:log] Failed to write email log:', logErr.message);
  }
}