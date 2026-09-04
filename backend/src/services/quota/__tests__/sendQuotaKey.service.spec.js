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

    it('Zalo attachment shape {data, filename, metadata}: cung bytes truoc/sau BullMQ round-trip cho CUNG fingerprint', () => {
      // Vong review thu 3 (Finding P1): hashAttachments() truoc day chi doc att.content, khong doc
      // att.data (shape thuc te cua attachment campaign Zalo — xem reviveZaloAttachmentSourcesFromQueue
      // trong campaignZaloSender.service.js). Sau khi qua BullMQ/Redis, Buffer that mat prototype,
      // chi con { type:'Buffer', data:[...] }. Ca hai dang phai cho CUNG fingerprint neu cung byte.
      const realBuffer = Buffer.from('noi dung file that', 'utf8');
      const jsonRoundTripBuffer = JSON.parse(JSON.stringify(realBuffer)); // { type: 'Buffer', data: [...] }

      const fpBeforeBullMQ = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: 'hello',
        attachments: [{ data: realBuffer, filename: 'anh.jpg', metadata: { totalSize: realBuffer.length } }],
      });
      const fpAfterBullMQ = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: 'hello',
        attachments: [{ data: jsonRoundTripBuffer, filename: 'anh.jpg', metadata: { totalSize: realBuffer.length } }],
      });

      expect(fpBeforeBullMQ).toBe(fpAfterBullMQ);
    });

    it('Zalo attachment shape {data, filename, metadata}: khac bytes nhung CUNG filename/size van cho fingerprint KHAC nhau', () => {
      // Day chinh la collision Codex phat hien bang test doc lap: truoc khi sua, hashAttachments()
      // bo qua att.data hoan toan nen 2 file khac noi dung nhung trung filename/size se ra CUNG
      // fingerprint — retry voi file khac se lang le replay sai file thay vi 409.
      const fileA = Buffer.from('noi dung file A', 'utf8');
      const fileB = Buffer.from('noi dung file B hoan toan khac', 'utf8');

      const fpA = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: 'hello',
        attachments: [{ data: fileA, filename: 'anh.jpg', metadata: { totalSize: 999 } }],
      });
      const fpB = computeRequestFingerprint({
        channel: 'zalo',
        recipient: '0901234567',
        content: 'hello',
        attachments: [{ data: fileB, filename: 'anh.jpg', metadata: { totalSize: 999 } }],
      });

      expect(fpA).not.toBe(fpB);
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
      const fpV1 = computeRequestFingerprint(payload, 'v1');
      const checkValidV1 = validateFingerprint('v1', fpV1, payload);
      expect(checkValidV1.valid).toBe(true);

      const fpV2 = computeRequestFingerprint(payload, 'v2');
      const checkValidV2 = validateFingerprint('v2', fpV2, payload);
      expect(checkValidV2.valid).toBe(true);

      const modifiedPayload = { ...payload, content: 'Different message' };
      const checkInvalidV1 = validateFingerprint('v1', fpV1, modifiedPayload);
      expect(checkInvalidV1.valid).toBe(false);

      const checkInvalidV2 = validateFingerprint('v2', fpV2, modifiedPayload);
      expect(checkInvalidV2.valid).toBe(false);
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

    it('v1 vs v2 versioning: v1 preserves legacy hashes while v2 protects fromEmailId, accountId, html, cc, bcc', () => {
      const basePayload = {
        channel: 'email',
        to: 'user@example.com',
        subject: 'Hello',
        content: 'World',
      };

      const fpV1 = computeRequestFingerprint(basePayload, 'v1');
      const fpV2 = computeRequestFingerprint(basePayload, 'v2');
      expect(fpV1).toBeDefined();
      expect(fpV2).toBeDefined();

      // Changing fromEmailId alters v2 but leaves v1 unchanged
      const payloadFromEmail1 = { ...basePayload, fromEmailId: 10 };
      const payloadFromEmail2 = { ...basePayload, fromEmailId: 20 };
      expect(computeRequestFingerprint(payloadFromEmail1, 'v1')).toBe(computeRequestFingerprint(payloadFromEmail2, 'v1'));
      expect(computeRequestFingerprint(payloadFromEmail1, 'v2')).not.toBe(computeRequestFingerprint(payloadFromEmail2, 'v2'));

      // Changing accountId alters v2 but leaves v1 unchanged
      const payloadAcc1 = { ...basePayload, accountId: 'acc_1' };
      const payloadAcc2 = { ...basePayload, accountId: 'acc_2' };
      expect(computeRequestFingerprint(payloadAcc1, 'v1')).toBe(computeRequestFingerprint(payloadAcc2, 'v1'));
      expect(computeRequestFingerprint(payloadAcc1, 'v2')).not.toBe(computeRequestFingerprint(payloadAcc2, 'v2'));

      // Changing htmlContent alters v2 but leaves v1 unchanged
      const payloadHtml1 = { ...basePayload, htmlContent: '<p>A</p>' };
      const payloadHtml2 = { ...basePayload, htmlContent: '<p>B</p>' };
      expect(computeRequestFingerprint(payloadHtml1, 'v1')).toBe(computeRequestFingerprint(payloadHtml2, 'v1'));
      expect(computeRequestFingerprint(payloadHtml1, 'v2')).not.toBe(computeRequestFingerprint(payloadHtml2, 'v2'));

      // Changing cc/bcc alters v2 but leaves v1 unchanged
      const payloadCc1 = { ...basePayload, cc: ['cc1@example.com'] };
      const payloadCc2 = { ...basePayload, cc: ['cc2@example.com'] };
      expect(computeRequestFingerprint(payloadCc1, 'v1')).toBe(computeRequestFingerprint(payloadCc2, 'v1'));
      expect(computeRequestFingerprint(payloadCc1, 'v2')).not.toBe(computeRequestFingerprint(payloadCc2, 'v2'));
    });

    it('validateFingerprint correctly checks against saved v1 vs v2 records', () => {
      const payloadV1 = { channel: 'email', to: 'a@example.com', subject: 'S', content: 'C' };
      const fp1 = computeRequestFingerprint(payloadV1, 'v1');
      expect(validateFingerprint('v1', fp1, payloadV1).valid).toBe(true);

      const payloadV2 = { channel: 'email', to: 'a@example.com', subject: 'S', content: 'C', fromEmailId: 5 };
      const fp2 = computeRequestFingerprint(payloadV2, 'v2');
      expect(validateFingerprint('v2', fp2, payloadV2).valid).toBe(true);

      // Mutated payload fails validation
      expect(validateFingerprint('v2', fp2, { ...payloadV2, fromEmailId: 6 }).valid).toBe(false);
    });

    it('Golden vectors: v1 and v2 produce exact expected 64-char hex hashes matching HEAD commits', () => {
      const pSimple = {
        channel: 'email',
        to: 'user@example.com',
        subject: 'Hello World',
        content: 'Plain text content',
        quantity: 1,
        sourceType: 'direct_email',
      };
      // Exactly matches committed HEAD v1 implementation
      expect(computeRequestFingerprint(pSimple, 'v1')).toBe(
        '62e423b0c8b84e60df81e3320e9d64f0e4b16ebfff77ce8a8801939fa4c8f1db'
      );
      expect(computeRequestFingerprint(pSimple, 'v2')).toBe(
        '0b927b9b69d4482114450aa03044e9cc3bfb7964434c534b0a0abbc3ee28d28a'
      );

      const pWithAtt = {
        channel: 'email',
        to: 'user@example.com',
        subject: 'Hello World',
        content: 'Plain text content',
        quantity: 1,
        sourceType: 'direct_email',
        attachments: [{ filename: 'test.pdf', size: 1024, content: 'base64data' }],
      };
      expect(computeRequestFingerprint(pWithAtt, 'v1')).toBe(
        'e50d34de93d060f2868eb416773462b9ec66660cdc6ddf3f8266787dd83f7fbd'
      );
      expect(computeRequestFingerprint(pWithAtt, 'v2')).toBe(
        '8360060a1344f6308da063321895298e3e43104f90b5fa90bbfbf7a5ea4e7e90'
      );
    });

    it('Golden vector: shape attachment Zalo {data,filename,metadata} — v1/v2 giu hash co dinh (khong doc att.data)', () => {
      // Bo sung theo yeu cau review vong 5: golden vector rieng cho DUNG shape gay ra collision
      // (Zalo campaign, khong phai shape {content} cua email). Neu ai do vo tinh sua lai
      // hashAttachments() (dung chung v1/v2) trong tuong lai, test nay se do ngay — dung y
      // bao ve dung diem da gay loi thay vi chi bao ve shape email chung chung.
      const pZaloAtt = {
        channel: 'zalo',
        recipient: '0901234567',
        content: 'hello',
        quantity: 1,
        sourceType: 'campaign_zalo',
        attachments: [{ data: Buffer.from('noi dung file that', 'utf8'), filename: 'anh.jpg', metadata: { totalSize: 19 } }],
      };
      expect(computeRequestFingerprint(pZaloAtt, 'v1')).toBe(
        '185f589b16da21e8a0bc8e04101be2542ae26ab0f297c5773db53bfd3f774079'
      );
      expect(computeRequestFingerprint(pZaloAtt, 'v2')).toBe(
        '940f7d6538e55eac7c3c27e362d50d5795ccfbafa0fbf86f472ba8ce13d31691'
      );
      expect(computeRequestFingerprint(pZaloAtt, 'v3')).toBe(
        '526f0714f9a32ebb83f41a0726c686a7eeea7c87dd78ccab6ec632955945a2aa'
      );
    });

    it('v1/v2 giu nguyen hanh vi legacy (collision) cho shape attachment Zalo; chi v3 phat hien khac byte', () => {
      // Dung yeu cau review vong 5: "xac nhan hai file khac byte: v2 giu hanh vi legacy, con v3
      // phat hien khac nhau". Day KHONG phai bug moi — la dac tinh dong bang bat buoc de reservation
      // v1/v2 da luu tren Postgres truoc khi co v3 van replay dung (xem chu thich hashAttachments()).
      const fileA = Buffer.from('noi dung A', 'utf8');
      const fileB = Buffer.from('noi dung B hoan toan khac', 'utf8');
      const attA = [{ data: fileA, filename: 'anh.jpg', metadata: { totalSize: fileA.length } }];
      const attB = [{ data: fileB, filename: 'anh.jpg', metadata: { totalSize: fileA.length } }]; // cung metadata, khac byte
      const base = { channel: 'zalo', recipient: '0901234567', content: 'hello' };

      expect(computeRequestFingerprint({ ...base, attachments: attA }, 'v1')).toBe(
        computeRequestFingerprint({ ...base, attachments: attB }, 'v1')
      );
      expect(computeRequestFingerprint({ ...base, attachments: attA }, 'v2')).toBe(
        computeRequestFingerprint({ ...base, attachments: attB }, 'v2')
      );
      expect(computeRequestFingerprint({ ...base, attachments: attA }, 'v3')).not.toBe(
        computeRequestFingerprint({ ...base, attachments: attB }, 'v3')
      );
    });
  });
});
