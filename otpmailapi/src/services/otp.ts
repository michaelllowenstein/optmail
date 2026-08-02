/**
 * services/otp.ts
 *
 * OTP generation, storage, and verification.
 *
 * Security:
 *   • Codes are SHA-256 hashed before storage — plaintext never persisted.
 *   • Verification uses constant-time comparison via timingSafeEqual.
 *   • Failed attempts are counted; after max_attempts the OTP is locked.
 *   • Only one pending OTP per (client, recipient, purpose) at a time —
 *     issuing a new one expires any prior pending codes.
 *   • TTL is enforced both at query time and via the expire_stale_otps() function.
 */

import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { query, queryOne } from '../db/pool';
import type { ClientRecord, OtpRecord } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateCode(length: number): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(randomInt(min, max + 1));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// ── Generate + Store ────────────────────────────────────────────────────────

export interface GenerateOtpResult {
  code: string;
  otpId: string;
  expiresAt: string;
}

export async function generateOtp(
  client: ClientRecord,
  recipient: string,
  purpose: string = 'login',
): Promise<GenerateOtpResult> {
  // 1. Expire any existing pending OTPs for this (client, recipient, purpose)
  await query(
    `UPDATE otps SET status = 'expired'
     WHERE client_id = $1 AND recipient = $2 AND purpose = $3 AND status = 'pending'`,
    [client.id, recipient, purpose],
  );

  // 2. Generate new code
  const code = generateCode(client.otp_length);
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + client.otp_ttl_seconds * 1000).toISOString();

  // 3. Insert
  const rows = await query<{ id: string; expires_at: string }>(
    `INSERT INTO otps (client_id, recipient, purpose, code_hash, max_attempts, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
     RETURNING id, expires_at`,
    [client.id, recipient, purpose, codeHash, client.otp_max_attempts, expiresAt],
  );

  return {
    code,
    otpId: rows[0].id,
    expiresAt: rows[0].expires_at,
  };
}

// ── Verify ──────────────────────────────────────────────────────────────────

export type VerifyResult =
  | { valid: true; otpId: string }
  | { valid: false; reason: 'not_found' | 'expired' | 'locked' | 'invalid_code' };

export async function verifyOtp(
  clientId: string,
  recipient: string,
  code: string,
  purpose: string = 'login',
): Promise<VerifyResult> {
  // 1. Find the most recent pending OTP
  const otp = await queryOne<OtpRecord>(
    `SELECT * FROM otps
     WHERE client_id = $1
       AND recipient = $2
       AND purpose = $3
       AND status = 'pending'
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId, recipient, purpose],
  );

  if (!otp) {
    return { valid: false, reason: 'not_found' };
  }

  // 2. Check if already locked
  if (otp.attempts >= otp.max_attempts) {
    await query(`UPDATE otps SET status = 'locked' WHERE id = $1`, [otp.id]);
    return { valid: false, reason: 'locked' };
  }

  // 3. Compare codes
  const submittedHash = hashCode(code);
  const match = constantTimeCompare(submittedHash, otp.code_hash);

  if (!match) {
    // Increment attempts
    const newAttempts = otp.attempts + 1;
    const newStatus = newAttempts >= otp.max_attempts ? 'locked' : 'pending';
    await query(
      `UPDATE otps SET attempts = $1, status = $2 WHERE id = $3`,
      [newAttempts, newStatus, otp.id],
    );

    return {
      valid: false,
      reason: newStatus === 'locked' ? 'locked' : 'invalid_code',
    };
  }

  // 4. Mark verified
  await query(
    `UPDATE otps SET status = 'verified', verified_at = now() WHERE id = $1`,
    [otp.id],
  );

  return { valid: true, otpId: otp.id };
}