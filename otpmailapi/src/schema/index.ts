// ═══════════════════════════════════════════════════════════════════════════════
//  OTP Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export const generateOtpSchema = {
  tags: ['OTP'],
  summary: 'Generate and send an OTP to a recipient',
  headers: {
    type: 'object',
    required: ['x-api-key'],
    properties: { 'x-api-key': { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['recipient'],
    additionalProperties: false,
    properties: {
      recipient:     { type: 'string', format: 'email', maxLength: 320 },
      purpose:       { type: 'string', minLength: 1, maxLength: 50, default: 'login' },
      recipientName: { type: 'string', maxLength: 100 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        otpId:     { type: 'string', format: 'uuid' },
        expiresAt: { type: 'string' },
        message:   { type: 'string' },
      },
    },
  },
};

export const verifyOtpSchema = {
  tags: ['OTP'],
  summary: 'Verify an OTP code',
  headers: {
    type: 'object',
    required: ['x-api-key'],
    properties: { 'x-api-key': { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['recipient', 'code'],
    additionalProperties: false,
    properties: {
      recipient: { type: 'string', format: 'email', maxLength: 320 },
      code:      { type: 'string', minLength: 4, maxLength: 8, pattern: '^\\d+$' },
      purpose:   { type: 'string', minLength: 1, maxLength: 50, default: 'login' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        valid: { type: 'boolean', const: true },
        otpId: { type: 'string', format: 'uuid' },
      },
    },
    400: {
      type: 'object',
      properties: {
        valid:  { type: 'boolean', const: false },
        reason: { type: 'string' },
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Email Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export const sendConfirmationSchema = {
  tags: ['Email'],
  summary: 'Send a confirmation email',
  headers: {
    type: 'object',
    required: ['x-api-key'],
    properties: { 'x-api-key': { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['to', 'heading', 'bodyText'],
    additionalProperties: false,
    properties: {
      to:            { type: 'string', format: 'email', maxLength: 320 },
      recipientName: { type: 'string', maxLength: 100 },
      subject:       { type: 'string', maxLength: 200 },
      heading:       { type: 'string', minLength: 1, maxLength: 200 },
      bodyText:      { type: 'string', minLength: 1, maxLength: 5000 },
      ctaUrl:        { type: 'string', format: 'uri', maxLength: 2000 },
      ctaLabel:      { type: 'string', maxLength: 50 },
    },
  },
  response: {
    204: { type: 'null' },
  },
};

export const sendContactSchema = {
  tags: ['Email'],
  summary: 'Send a contact-us form submission',
  headers: {
    type: 'object',
    required: ['x-api-key'],
    properties: { 'x-api-key': { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['senderName', 'senderEmail', 'message'],
    additionalProperties: false,
    properties: {
      senderName:  { type: 'string', minLength: 1, maxLength: 100 },
      senderEmail: { type: 'string', format: 'email', maxLength: 320 },
      senderPhone: { type: 'string', maxLength: 30 },
      subject:     { type: 'string', maxLength: 200 },
      message:     { type: 'string', minLength: 1, maxLength: 10000 },
    },
  },
  response: {
    204: { type: 'null' },
  },
};

export const sendNewsletterSchema = {
  tags: ['Email'],
  summary: 'Send a newsletter email to one or more recipients',
  headers: {
    type: 'object',
    required: ['x-api-key'],
    properties: { 'x-api-key': { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['recipients', 'subject', 'heading', 'bodyHtml', 'bodyText'],
    additionalProperties: false,
    properties: {
      recipients: {
        type: 'array',
        items: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email:          { type: 'string', format: 'email', maxLength: 320 },
            unsubscribeUrl: { type: 'string', format: 'uri', maxLength: 2000 },
          },
        },
        minItems: 1,
        maxItems: 100,
      },
      subject:   { type: 'string', minLength: 1, maxLength: 200 },
      heading:   { type: 'string', minLength: 1, maxLength: 200 },
      preheader: { type: 'string', maxLength: 200 },
      bodyHtml:  { type: 'string', minLength: 1, maxLength: 100000 },
      bodyText:  { type: 'string', minLength: 1, maxLength: 50000 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        sent:   { type: 'integer' },
        failed: { type: 'integer' },
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Admin Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export const registerClientSchema = {
  tags: ['Admin'],
  summary: 'Register a new client application',
  body: {
    type: 'object',
    required: ['name', 'slug', 'fromEmail', 'fromName'],
    additionalProperties: false,
    properties: {
      name:              { type: 'string', minLength: 1, maxLength: 100 },
      slug:              { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9-]+$' },
      fromEmail:         { type: 'string', format: 'email', maxLength: 320 },
      fromName:          { type: 'string', minLength: 1, maxLength: 100 },
      replyTo:           { type: 'string', format: 'email', maxLength: 320 },
      allowedEmailTypes: {
        type: 'array',
        items: { type: 'string', enum: ['otp', 'confirmation', 'contact', 'newsletter'] },
        default: ['otp', 'confirmation', 'contact', 'newsletter'],
      },
      otpLength:      { type: 'integer', minimum: 4, maximum: 8 },
      otpTtlSeconds:  { type: 'integer', minimum: 60, maximum: 3600 },
      otpMaxAttempts: { type: 'integer', minimum: 1, maximum: 10 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id:     { type: 'string', format: 'uuid' },
        slug:   { type: 'string' },
        apiKey: { type: 'string', description: 'Plaintext API key — shown ONCE' },
      },
    },
  },
};

export const listClientsSchema = {
  tags: ['Admin'],
  summary: 'List all registered clients',
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:                { type: 'string' },
          name:              { type: 'string' },
          slug:              { type: 'string' },
          fromEmail:         { type: 'string' },
          fromName:          { type: 'string' },
          allowedEmailTypes: { type: 'array', items: { type: 'string' } },
          isActive:          { type: 'boolean' },
          createdAt:         { type: 'string' },
        },
      },
    },
  },
};