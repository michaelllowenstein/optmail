import * as dotenv from 'dotenv';
dotenv.config();

// ── Helpers (matching fl-legal pattern) ──────────────────────────────────────

export const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
};

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

// ── Environment tier ────────────────────────────────────────────────────────

const nodeEnv = optional('NODE_ENV', 'development');
const isDev = nodeEnv === 'development';
const isStage = nodeEnv === 'staging';
const isProd = nodeEnv === 'production';

export const config = {
  port: parseInt(optional('PORT', '3100'), 10),
  host: optional('HOSTNAME', '0.0.0.0'),
  nodeEnv,
  isDev,
  isStage,
  isProd,

  // ── Database ────────────────────────────────────────────────────────────
  db: {
    connectionString: need('DATABASE_URL'),
    // Pool settings — conservative defaults, tune per deployment
    poolMin: parseInt(optional('DB_POOL_MIN', '2'), 10),
    poolMax: parseInt(optional('DB_POOL_MAX', '10'), 10),
  },

  // ── Admin access (for /api/admin/* client management) ─────────────────
  admin: {
    apiKey: need('ADMIN_API_KEY'),
  },

  // ── CORS ────────────────────────────────────────────────────────────────
  cors: {
    allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:4422')
      .split(',')
      .map((o: string) => o.trim())
      .filter(Boolean),
  },

  // ── OTP defaults (clients can override these per registration) ─────────
  otp: {
    length: parseInt(optional('OTP_LENGTH', '6'), 10),
    ttlSeconds: parseInt(optional('OTP_TTL_SECONDS', '300'), 10),
    maxAttempts: parseInt(optional('OTP_MAX_ATTEMPTS', '3'), 10),
  },

  // ── Email (Resend) ────────────────────────────────────────────────────
  email: {
    apiKey: need('RESEND_API_KEY'),
    fromEmail: optional('EMAIL_FROM', 'onboarding@resend.dev'),
    fromName: optional('EMAIL_FROM_NAME', 'miloSENG Support'),
    testRecipient: optional('TEST_EMAIL_RECIPIENT'),
  },

  // ── Logging ──────────────────────────────────────────────────────────────
  log: {
    level: optional('LOG_LEVEL', isDev ? 'debug' : 'info'),
  },
} as const;

export type Config = typeof config;