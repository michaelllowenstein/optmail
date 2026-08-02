-- ═══════════════════════════════════════════════════════════════════════════════
--  001-init.sql — OTP + Email API schema
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Clients (tenants) ───────────────────────────────────────────────────────
-- Each client app (fakeintellect, fl-legal, market-lens, etc.) registers here.
-- API key is stored as a SHA-256 hash — plaintext never persisted.

CREATE TABLE IF NOT EXISTS clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  api_key_hash        TEXT NOT NULL,
  from_email          TEXT NOT NULL,
  from_name           TEXT NOT NULL,
  reply_to            TEXT,
  allowed_email_types TEXT[] NOT NULL DEFAULT '{otp,confirmation,contact,newsletter}',
  otp_length          INT NOT NULL DEFAULT 6,
  otp_ttl_seconds     INT NOT NULL DEFAULT 300,
  otp_max_attempts    INT NOT NULL DEFAULT 3,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients (slug);
CREATE INDEX IF NOT EXISTS idx_clients_api_key_hash ON clients (api_key_hash);

-- ── OTPs ────────────────────────────────────────────────────────────────────
-- Codes stored as SHA-256 hashes. Status enum enforced at DB level.

DO $$ BEGIN
  CREATE TYPE otp_status AS ENUM ('pending', 'verified', 'expired', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recipient     TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'login',
  code_hash     TEXT NOT NULL,
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 3,
  status        otp_status NOT NULL DEFAULT 'pending',
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otps_lookup
  ON otps (client_id, recipient, purpose, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps (expires_at)
  WHERE status = 'pending';

-- ── Email log ───────────────────────────────────────────────────────────────
-- Every email sent through the API is logged for audit and debugging.

DO $$ BEGIN
  CREATE TYPE email_type AS ENUM ('otp', 'confirmation', 'contact', 'newsletter');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email_type  email_type NOT NULL,
  recipient   TEXT NOT NULL,
  subject     TEXT NOT NULL,
  resend_id   TEXT,
  status      email_status NOT NULL,
  error       TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_client ON email_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON email_log (recipient, created_at DESC);

-- ── Cleanup function — expire stale OTPs ────────────────────────────────────
-- Call periodically via pg_cron or an application-level sweep.

CREATE OR REPLACE FUNCTION expire_stale_otps() RETURNS INTEGER AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE otps
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;