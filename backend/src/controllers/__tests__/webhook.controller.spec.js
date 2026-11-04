import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import webhookController from '../webhook.controller.js';

describe('WebhookController - _verifySignature security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('từ chối khi ở production và không cấu hình WC_WEBHOOK_SECRET (fail-closed)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WC_WEBHOOK_SECRET;

    const req = {
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ id: 123 })),
    };

    expect(webhookController._verifySignature(req)).toBe(false);
  });

  it('cho phép bypass khi ở dev/test nếu chưa cấu hình WC_WEBHOOK_SECRET', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.WC_WEBHOOK_SECRET;

    const req = {
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ id: 123 })),
    };

    expect(webhookController._verifySignature(req)).toBe(true);
  });

  it('từ chối khi có WC_WEBHOOK_SECRET nhưng thiếu header chữ ký', () => {
    process.env.WC_WEBHOOK_SECRET = 'secret_key_123';

    const req = {
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ id: 123 })),
    };

    expect(webhookController._verifySignature(req)).toBe(false);
  });

  it('từ chối khi có WC_WEBHOOK_SECRET nhưng thiếu rawBody', () => {
    process.env.WC_WEBHOOK_SECRET = 'secret_key_123';

    const req = {
      headers: {
        'x-wc-webhook-signature': 'abcxyz',
      },
      rawBody: null,
    };

    expect(webhookController._verifySignature(req)).toBe(false);
  });

  it('từ chối khi chữ ký HMAC sai', () => {
    const secret = 'secret_key_123';
    process.env.WC_WEBHOOK_SECRET = secret;

    const req = {
      headers: {
        'x-wc-webhook-signature': 'invalid_signature_base64',
      },
      rawBody: Buffer.from(JSON.stringify({ id: 123 })),
    };

    expect(webhookController._verifySignature(req)).toBe(false);
  });

  it('chấp nhận khi chữ ký HMAC-SHA256 hợp lệ', () => {
    const secret = 'super_secret_webhook_key_456';
    process.env.WC_WEBHOOK_SECRET = secret;

    const rawBody = Buffer.from(JSON.stringify({ id: 123, status: 'completed' }));
    const validSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const req = {
      headers: {
        'x-wc-webhook-signature': validSig,
      },
      rawBody,
    };

    expect(webhookController._verifySignature(req)).toBe(true);
  });
});
