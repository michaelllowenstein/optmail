// ─── Email types supported by the API ────────────────────────────────────────

export type EmailType = 'otp' | 'confirmation' | 'contact' | 'newsletter';

// ─── Client (tenant) record ─────────────────────────────────────────────────

export interface ClientRecord {
  id: any;
  name: string;
  slug: string;
  api_key_hash: string;
  from_email: string;
  from_name: string;
  reply_to: string | null;
  allowed_email_types: EmailType[];
  otp_length: number;
  otp_ttl_seconds: number;
  otp_max_attempts: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── OTP record ─────────────────────────────────────────────────────────────

export type OtpStatus = 'pending' | 'verified' | 'expired' | 'locked';

export interface OtpRecord {
  id: any;
  client_id: string;
  recipient: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  status: OtpStatus;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

// ─── Email log record ───────────────────────────────────────────────────────

export interface EmailLogRecord {
  id: string;
  client_id: string;
  email_type: EmailType;
  recipient: string;
  subject: string;
  resend_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

// ─── Fastify augmentation ───────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    clientId?: string;
    clientRecord?: ClientRecord;
  }
}