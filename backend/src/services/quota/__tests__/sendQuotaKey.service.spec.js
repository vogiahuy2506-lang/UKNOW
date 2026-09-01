import { describe, it, expect, jest } from '@jest/globals';
import {
  hashRecipient,
  buildCampaignReservationKey,
  buildDirectReservationKey,
  buildPreviewReservationKey,
  buildQuickSendReservationKey,
  buildInboxReservationKey,
  resolveRequestIdempotencyKey,
  hashClientSegment,
  computeRequestFingerprint,
  validateFingerprint,
} from '../sendQuotaKey.service.js';

describe('sendQuotaKey.service — Canonical Keys & Zero-PII', () => {
  describe('resolveRequestIdempotencyKey & Request Boundary Idempotency', () => {
    it('returns provided client idempotency key without mutation', () => {
      const key = resolveRequestIdempotencyKey('custom_order_123');
      expect(key).toBe('custom_order_123');
    });

    it('generates unique UUID and records missing_client_idempotency_key when missing', () => {
      const metricCallback = jest.fn();
      const key1 = resolveRequestIdempotencyKey(null, { onMissingKey: metricCallback });
      const key2 = resolveRequestIdempotencyKey(undefined, { onMissingKey: metricCallback });

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(key2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(metricCallback).toHaveBeenCalledTimes(2);
      expect(metricCallback).toHaveBeenCalledWith('missing_client_idempotency_key');
    });

    it('rejects non-string types and invalid characters with 400 INVALID_IDEMPOTENCY_KEY', () => {
      // Objects, arrays, booleans, numbers
      expect(() => resolveRequestIdempotencyKey({ a: 1 })).toThrow(/must be a string/);
      expect(() => resolveRequestIdempotencyKey({ b: 2 })).toThrow(/must be a string/);
      expect(() => resolveRequestIdempotencyKey([1, 2, 3])).toThrow(/must be a string/);
      expect(() => resolveRequestIdempotencyKey(12345)).toThrow(/must be a string/);
      expect(() => resolveRequestIdempotencyKey(true)).toThrow(/must be a string/);

      // Empty or invalid chars
      expect(() => resolveRequestIdempotencyKey('')).toThrow(/between 1 and 128/);
      expect(() => resolveRequestIdempotencyKey('   ')).toThrow(/between 1 and 128/);
      expect(() => resolveRequestIdempotencyKey('key with spaces')).toThrow(/between 1 and 128/);
      expect(() => resolveRequestIdempotencyKey('a'.repeat(129))).toThrow(/between 1 and 128/);

      // hashClientSegment rejection
      expect(() => hashClientSegment({ a: 1 })).toThrow(/must be a string/);
      expect(() => hashClientSegment(12345)).toThrow(/must be a string/);
      expect(() => hashClientSegment('key with spaces')).toThrow(/between 1 and 128/);
    });

    it('hashClientSegment rejects null or empty key with 400 MISSING_IDEMPOTENCY_KEY', () => {
      expect(() => hashClientSegment(null)).toThrow(/clientKey \/ requestKey is required/);
      expect(() => hashClientSegment('')).toThrow(/clientKey \/ requestKey is required/);
      expect(() => buildDirectReservationKey({ channel: 'email', billingUserId: 5, recipient: 'user@example.com' })).toThrow(
        /clientKey \/ requestKey is required/
      );
    });

    it('Finding 1: retry stability — same logical action key produces exact same reservation key on retry', () => {
      const actionKey = resolveRequestIdempotencyKey(null); // Generated at request boundary
      const keyInitial = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 10,
        clientKey: actionKey,
        recipient: 'alice@example.com',
      });
      const keyRetry = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 10,
        clientKey: actionKey,
        recipient: 'alice@example.com',
      });

      expect(keyInitial).toBe(keyRetry);
    });

    it('Finding 1: batch independence — multiple recipients in same logical request produce distinct keys', () => {
      const actionKey = resolveRequestIdempotencyKey(null);
      const keyA = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 10,
        clientKey: actionKey,
        recipient: 'userA@example.com',
      });
      const keyB = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 10,
        clientKey: actionKey,
        recipient: 'userB@example.com',
      });
      const keyC = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 10,
        clientKey: actionKey,
        recipient: 'userC@example.com',
      });

      expect(keyA).not.toBe(keyB);
      expect(keyB).not.toBe(keyC);
      expect(keyA).not.toBe(keyC);
    });
  });
  describe('hashRecipient', () => {
    it('generates deterministic 16-char hex hash without leaking PII', () => {
      const phone = '0901234567';
      const hash1 = hashRecipient(phone);
      const hash2 = hashRecipient(phone);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(hash1).toMatch(/^[0-9a-f]{16}$/);
      expect(hash1).not.toContain('0901234567');
    });

    it('normalizes phone numbers with spacing or formatting characters', () => {
      const h1 = hashRecipient('0901234567');
      const h2 = hashRecipient('090-123-4567');
      const h3 = hashRecipient('090 123 4567');

      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    });

    it('normalizes email addresses to lowercase', () => {
      const h1 = hashRecipient('Client@Example.COM');
      const h2 = hashRecipient('client@example.com');
      const h3 = hashRecipient('  client@example.com  ');

      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    });
  });

  describe('canonical reservation keys', () => {
    it('buildCampaignReservationKey formats zero-PII key', () => {
      const key = buildCampaignReservationKey({
        runId: 10,
        nodeId: 'node_abc',
        channel: 'zalo',
        recipient: '0901234567',
        logicalStep: 1,
      });

      expect(key).toMatch(/^campaign:10:node_abc:zalo:[0-9a-f]{16}:1$/);
      expect(key).not.toContain('0901234567');
    });

    it('buildDirectReservationKey formats zero-PII key', () => {
      const key = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 42,
        clientKey: 'req_123',
        recipient: 'user@example.com',
      });

      expect(key).toMatch(/^direct:email:42:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
      expect(key).not.toContain('user@example.com');
    });

    it('Finding 1: independent actions resolved at boundary generate unique non-colliding reservation keys', () => {
      const actionKey1 = resolveRequestIdempotencyKey(null);
      const actionKey2 = resolveRequestIdempotencyKey(null);

      const key1 = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 5,
        clientKey: actionKey1,
        recipient: 'user@example.com',
      });
      const key2 = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 5,
        clientKey: actionKey2,
        recipient: 'user@example.com',
      });

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^direct:email:5:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
      expect(key2).toMatch(/^direct:email:5:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
    });

    it('buildPreviewReservationKey formats preview key with h_... segment', () => {
      const key = buildPreviewReservationKey({
        channel: 'zalo',
        billingUserId: 15,
        requestKey: 'preview_abc',
        recipient: '0912345678',
      });

      expect(key).toMatch(/^preview:zalo:15:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
    });

    it('buildQuickSendReservationKey formats quick send key with h_... segment', () => {
      const key = buildQuickSendReservationKey({
        channel: 'zalo',
        billingUserId: 20,
        requestKey: 'quick_xyz',
        recipient: '0987654321',
      });

      expect(key).toMatch(/^quick:zalo:20:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
    });

    it('buildInboxReservationKey formats inbox key with numeric or uuid messageId', () => {
      const keyNum = buildInboxReservationKey({
        messageId: 999,
        channel: 'zalo',
      });
      expect(keyNum).toBe('inbox:zalo:999');

      const keyUuid = buildInboxReservationKey({
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'email',
      });
      expect(keyUuid).toBe('inbox:email:550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('computeRequestFingerprint & validateFingerprint', () => {
    it('computes 64-char hex SHA-256 fingerprint deterministically regardless of key order', () => {
      const payload1 = {
        channel: 'zalo',
        recipient: '0901234567',
        content: 'Hello customer',
        quantity: 1,
        sourceType: 'campaign',
      };

      const payload2 = {
        sourceType: 'campaign',
        quantity: 1,
        content: 'Hello customer',
        recipient: '0901234567',
        channel: 'zalo',
      };

      const fp1 = computeRequestFingerprint(payload1);
      const fp2 = computeRequestFingerprint(payload2);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
      expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes fingerprint when recipient changes', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        content: 'Hello',
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'bob@example.com',
        content: 'Hello',
      });

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when content changes, even if templateId is specified', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        templateId: 5,
        content: 'Hello Alice',
      });
      const fp2 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        templateId: 5,
        content: 'Hello Alice - modified',
      });

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when subject changes', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        subject: 'Newsletter #1',
        content: 'Body',
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        subject: 'Newsletter #2',
        content: 'Body',
      });

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when attachments change', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        content: 'Body',
        attachments: [{ name: 'file1.pdf', size: 100 }],
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        content: 'Body',
        attachments: [{ name: 'file2.pdf', size: 200 }],
      });

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when templateVariables change', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        templateId: 10,
        templateVariables: { customerName: 'Alice' },
      });
      const fp2 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        templateId: 10,
        templateVariables: { customerName: 'Bob' },
      });

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when options change', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        content: 'Body',
        options: { senderAccountId: 1 },
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        recipient: 'alice@example.com',
        content: 'Body',
        options: { senderAccountId: 2 },
      });

      expect(fp1).not.toBe(fp2);
    });

    it('validateFingerprint returns valid=true when payload matches, valid=false when modified', () => {
      const payload = {
        channel: 'zalo',
        recipient: '0901234567',
        content: 'Message 1',
      };
      const fp = computeRequestFingerprint(payload);

      const checkValid = validateFingerprint('v1', fp, payload);
      expect(checkValid.valid).toBe(true);

      const modifiedPayload = { ...payload, content: 'Different message' };
      const checkInvalid = validateFingerprint('v1', fp, modifiedPayload);
      expect(checkInvalid.valid).toBe(false);
    });

    it('validateFingerprint returns valid=false when saved fingerprint is malformed or not 64 hex', () => {
      const check = validateFingerprint('v1', 'not_a_valid_sha256', { channel: 'email' });
      expect(check.valid).toBe(false);
    });

    it('Finding 3: preserves whitespace significance in content ("x" vs " x ")', () => {
      const fp1 = computeRequestFingerprint({ channel: 'email', content: 'x' });
      const fp2 = computeRequestFingerprint({ channel: 'email', content: ' x ' });
      expect(fp1).not.toBe(fp2);
    });

    it('Finding 3: recursive canonical serialization produces same fingerprint regardless of nested object key order', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'email',
        templateVariables: {
          profile: { firstName: 'Van', lastName: 'Nguyen' },
          metadata: { plan: 'pro', active: true },
        },
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        templateVariables: {
          metadata: { active: true, plan: 'pro' },
          profile: { lastName: 'Nguyen', firstName: 'Van' },
        },
      });
      expect(fp1).toBe(fp2);
    });

    it('Finding 3: preserves attachment array order (different order produces different fingerprint)', () => {
      const attA = { name: 'a.pdf', size: 100, key: 'k_a' };
      const attB = { name: 'b.pdf', size: 200, key: 'k_b' };
      const fp1 = computeRequestFingerprint({ channel: 'email', attachments: [attA, attB] });
      const fp2 = computeRequestFingerprint({ channel: 'email', attachments: [attB, attA] });
      expect(fp1).not.toBe(fp2);
    });

    it('Finding 7: clientKey containing raw email or phone is hashed and never leaks PII into reservationKey', () => {
      const keyEmail = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 5,
        clientKey: 'user@example.com',
        recipient: 'recipient@example.com',
      });
      expect(keyEmail).not.toContain('user@example.com');
      expect(keyEmail).toMatch(/^direct:email:5:h_[0-9a-f]{20}:[0-9a-f]{16}$/);

      const keyPhone = buildDirectReservationKey({
        channel: 'zalo',
        billingUserId: 5,
        clientKey: '0987654321',
        recipient: '0912345678',
      });
      expect(keyPhone).not.toContain('0987654321');
      expect(keyPhone).toMatch(/^direct:zalo:5:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
    });

    it('Finding 1: clientKey/requestKey with prefix like req_0912345678, msg_84901234567, req_nguyenvana are always hashed into h_... segment', () => {
      // 1. req_0912345678
      const key1 = buildDirectReservationKey({
        channel: 'email',
        billingUserId: 1,
        clientKey: 'req_0912345678',
        recipient: 'test@example.com',
      });
      expect(key1).not.toContain('0912345678');
      expect(key1).not.toContain('req_');
      expect(key1).toMatch(/^direct:email:1:h_[0-9a-f]{20}:[0-9a-f]{16}$/);

      // 2. msg_84901234567
      const key2 = buildPreviewReservationKey({
        channel: 'zalo',
        billingUserId: 2,
        requestKey: 'msg_84901234567',
        recipient: '0901234567',
      });
      expect(key2).not.toContain('84901234567');
      expect(key2).not.toContain('msg_');
      expect(key2).toMatch(/^preview:zalo:2:h_[0-9a-f]{20}:[0-9a-f]{16}$/);

      // 3. req_nguyenvana
      const key3 = buildQuickSendReservationKey({
        channel: 'email',
        billingUserId: 3,
        requestKey: 'req_nguyenvana',
        recipient: 'alice@example.com',
      });
      expect(key3).not.toContain('nguyenvana');
      expect(key3).not.toContain('req_');
      expect(key3).toMatch(/^quick:email:3:h_[0-9a-f]{20}:[0-9a-f]{16}$/);
    });

    it('Finding 1: canonicalizes object content regardless of key ordering', () => {
      const fp1 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: { title: 'Hello', details: { b: 2, a: 1 } },
      });
      const fp2 = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: { details: { a: 1, b: 2 }, title: 'Hello' },
      });
      expect(fp1).toBe(fp2);
    });

    it('Finding 1: hashes binary Buffer attachments by exact bytes producing distinct fingerprints', () => {
      const buf1 = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const buf2 = Buffer.from([0x01, 0x02, 0x03, 0x05]);

      const fp1 = computeRequestFingerprint({
        channel: 'email',
        attachments: [{ filename: 'file.bin', content: buf1 }],
      });
      const fp2 = computeRequestFingerprint({
        channel: 'email',
        attachments: [{ filename: 'file.bin', content: buf2 }],
      });
      expect(fp1).not.toBe(fp2);
    });
  });
});
