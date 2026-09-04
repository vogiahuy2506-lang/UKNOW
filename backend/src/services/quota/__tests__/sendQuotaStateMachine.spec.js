import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import db from '../../../config/database.js';
import { _clearQuotaCache } from '../../../utils/userSendLimit.util.js';
import { buildDirectReservationKey } from '../sendQuotaKey.service.js';
import {
  VALID_RESERVATION_TRANSITIONS,
  transitionReservationState,
  sanitizeResponseSnapshot,
  validateSourceRef,
  createReservation,
  validateReservationKey,
  validateProviderReference,
  validateFailureCode,
} from '../../../repositories/sendQuota.repository.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
  assertReservationOperationMode,
  getShadowMismatchMetrics,
  resetShadowMismatchMetrics,
} from '../sendQuotaReservation.service.js';

describe('sendQuota State Machine & Transition Rules (PR-Q1)', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
  });

  describe('VALID_RESERVATION_TRANSITIONS table', () => {
    it('declares expected transitions from reserved', () => {
      expect(VALID_RESERVATION_TRANSITIONS.reserved).toEqual(['sending', 'released']);
    });

    it('declares expected transitions from sending', () => {
      expect(VALID_RESERVATION_TRANSITIONS.sending).toEqual(['consumed', 'released', 'uncertain']);
    });

    it('declares expected transitions from uncertain', () => {
      expect(VALID_RESERVATION_TRANSITIONS.uncertain).toEqual(['consumed', 'released']);
    });

    it('declares expected transition from released (explicit retry under lock)', () => {
      expect(VALID_RESERVATION_TRANSITIONS.released).toEqual(['reserved']);
    });

    it('declares consumed as strictly terminal', () => {
      expect(VALID_RESERVATION_TRANSITIONS.consumed).toEqual([]);
    });
  });

  describe('transitionReservationState', () => {
    it('transitions reserved -> sending successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'reserved', reservation_key: 'res_1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'sending', reservation_key: 'res_1' }],
        });

      const result = await transitionReservationState(mockClient, 1, 'reserved', 'sending');
      expect(result.status).toBe('sending');
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(mockClient.query.mock.calls[1][0]).toContain('sending_at = NOW()');
    });

    it('transitions sending -> consumed with responseSnapshot and providerReference', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'sending', reservation_key: 'res_1' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'consumed',
            provider_reference: 'prov_123',
            response_snapshot: { messageId: 'prov_123' },
          }],
        });

      const result = await transitionReservationState(mockClient, 1, 'sending', 'consumed', {
        providerReference: 'prov_123',
        responseSnapshot: { messageId: 'prov_123', rawSecret: 'strip_me' },
      });

      expect(result.status).toBe('consumed');
      expect(mockClient.query.mock.calls[1][0]).toContain('consumed_at = NOW()');
      expect(mockClient.query.mock.calls[1][0]).toContain('provider_reference');
    });

    it('transitions sending -> uncertain when network timeout occurs', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'sending', reservation_key: 'res_1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'uncertain', failure_code: 'ETIMEDOUT' }],
        });

      const result = await transitionReservationState(mockClient, 1, 'sending', 'uncertain', {
        failureCode: 'ETIMEDOUT',
      });

      expect(result.status).toBe('uncertain');
      expect(mockClient.query.mock.calls[1][0]).toContain('uncertain_at = NOW()');
    });

    it('transitions released -> reserved for explicit retry with updated window snapshot', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'released', reservation_key: 'res_1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'reserved', failure_code: null }],
        });

      const now = new Date();
      const result = await transitionReservationState(mockClient, 1, 'released', 'reserved', {
        vnDayStart: now,
        vnDayEnd: now,
      });

      expect(result.status).toBe('reserved');
      expect(mockClient.query.mock.calls[1][0]).toContain('released_at = NULL');
      expect(mockClient.query.mock.calls[1][0]).toContain('failure_code = NULL');
    });

    it('handles idempotent replay without side effect when current status matches toStatus', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'consumed', reservation_key: 'res_1' }],
      });

      const result = await transitionReservationState(mockClient, 1, 'consumed', 'consumed');
      expect(result.status).toBe('consumed');
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid transition consumed -> released with 409 INVALID_RESERVATION_TRANSITION', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'consumed', reservation_key: 'res_1' }],
      });

      await expect(
        transitionReservationState(mockClient, 1, 'consumed', 'released')
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_RESERVATION_TRANSITION',
      });
    });

    it('rejects invalid transition uncertain -> reserved with 409 INVALID_RESERVATION_TRANSITION', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'uncertain', reservation_key: 'res_1' }],
      });

      await expect(
        transitionReservationState(mockClient, 1, 'uncertain', 'reserved')
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_RESERVATION_TRANSITION',
      });
    });
  });

  describe('Invariant validations: source_ref, response_snapshot, wallet_quantity', () => {
    it('validateSourceRef allows technical references but throws on email or phone PII', () => {
      expect(() => validateSourceRef({ runId: 10, nodeId: 'n1', step: 2 })).not.toThrow();

      expect(() => validateSourceRef({ userEmail: 'user@example.com' })).toThrow(/PII/);
      expect(() => validateSourceRef({ customerPhone: '0901234567' })).toThrow(/PII/);
      expect(() => validateSourceRef({ recipient: '+84901234567' })).toThrow(/PII/);
    });

    it('sanitizeResponseSnapshot keeps only allowlisted fields and strips unauthorized keys', () => {
      const input = {
        messageId: 'msg_123',
        provider: 'zalo_zns',
        sentAt: '2026-09-01T12:00:00Z',
        unauthorizedSecret: 'api_token_xyz',
        rawBody: 'Sensitive text body',
      };

      const sanitized = sanitizeResponseSnapshot(input);
      expect(sanitized).toEqual({
        messageId: 'msg_123',
        provider: 'zalo_zns',
        sentAt: '2026-09-01T12:00:00Z',
      });
      expect(sanitized.unauthorizedSecret).toBeUndefined();
      expect(sanitized.rawBody).toBeUndefined();
    });

    it('sanitizeResponseSnapshot throws when snapshot exceeds 4KB', () => {
      const hugeSnapshot = {
        messageId: 'msg_large',
        tracking: 'x'.repeat(4500),
      };

      expect(() => sanitizeResponseSnapshot(hugeSnapshot)).toThrow(/exceeds 4KB/);
    });

    it('createReservation enforces wallet_quantity > 0 requires valid wallet_item_key', async () => {
      await expect(
        createReservation(mockClient, {
          reservationKey: 'test_key',
          requestFingerprint: 'a'.repeat(64),
          billingUserId: 1,
          channel: 'email',
          quantity: 2,
          walletQuantity: 1,
          walletItemKey: 'invalid_item',
          sourceType: 'direct',
        })
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_WALLET_ITEM_KEY',
      });
    });

    it('createReservation enforces requestFingerprint must be 64-char hex SHA-256', async () => {
      await expect(
        createReservation(mockClient, {
          reservationKey: 'test_key',
          requestFingerprint: 'short_fingerprint',
          billingUserId: 1,
          channel: 'email',
          quantity: 1,
          sourceType: 'direct',
        })
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_REQUEST_FINGERPRINT',
      });
    });
  });

  describe('sendQuotaReservation.service — Mode OFF default & Idempotent Consume', () => {
    it('reserveSendQuota returns safe passthrough stub when mode is off', async () => {
      // Nhánh mode 'off' của reserveSendQuota gọi checkSendQuota() legacy, và hàm đó đi
      // xuống resolveBillingUserId() -> db.query. Trên máy dev có Postgres nên câu này
      // trả lời tức thì và bài test xanh; job "Jest unit (backend)" trên CI KHÔNG dựng
      // database, nên kết nối treo, withRetry (database.js:27) thử lại 6 lượt và bài test
      // vượt mốc 5000ms mặc định của Jest.
      //
      // Hậu quả thật, không phải giả định: bài test này làm đỏ job unit và chặn TOÀN BỘ
      // deploy backend từ 03/09/2026 (6 run liên tiếp). Deploy frontend dùng workflow
      // riêng nên vẫn lên — lệch phiên bản đó khoá modal "Bổ sung số điện thoại" của mọi
      // user không phải admin trên production.
      //
      // Chặn ở tầng db.query để bài test thuần đơn vị, không phụ thuộc môi trường có DB
      // hay không. Dùng đúng khuôn mock đã có sẵn ở phần shadow-mode cuối file này.
      _clearQuotaCache();
      const origDbQuery = db.query;
      db.query = jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM users') || sql.includes('JOIN plans') || sql.includes('FROM plans')) {
          return {
            rows: [{
              id: 10,
              has_plan: true,
              is_subscription_expired: false,
              subscription_expires_at: new Date(Date.now() + 86400000),
              plan_activated_at: new Date(Date.now() - 5 * 86400000),
              effective_plan_id: 10,
              active_plan_id: 10,
              role: 'user',
              daily_email_limit: 100,
              monthly_email_limit: 1000,
            }],
          };
        }
        if (sql.includes('count') || sql.includes('COUNT')) {
          return { rows: [{ count: 0, total: 0 }] };
        }
        return { rows: [] };
      });

      try {
        const result = await reserveSendQuota({
          userId: 10,
          channel: 'email',
          quantity: 1,
          reservationKey: 'res_key_1',
        });

        expect(result).toMatchObject({
          id: null,
          reservation_key: 'res_key_1',
          status: 'reserved',
          mode: 'off',
          allowed: true,
          bypass: true,
        });
      } finally {
        db.query = origDbQuery;
        _clearQuotaCache();
      }
    });

    it('reserveSendQuota fails closed with 503 if mode is unrecognized', async () => {
      await expect(
        reserveSendQuota(
          {
            userId: 10,
            channel: 'email',
            quantity: 1,
            reservationKey: 'res_key_1',
            requestFingerprint: 'a'.repeat(64),
          },
          { modeOverride: 'unsupported_mode' }
        )
      ).rejects.toMatchObject({
        status: 503,
        code: 'RESERVATION_MODE_NOT_IMPLEMENTED',
      });
    });

    it('consumeSendQuota skips persistSource callback if reservation is already consumed (idempotency)', async () => {
      mockClient.query.mockImplementation(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (sql.includes('SELECT * FROM send_quota_reservations WHERE id = $1')) {
          return {
            rows: [{
              id: 1,
              billing_user_id: 10,
              status: 'consumed',
              reservation_key: 'res_already_consumed',
              wallet_quantity: 0,
            }],
          };
        }
        return { rows: [] };
      });

      const mockPersist = jest.fn();
      const result = await consumeSendQuota(
        {
          reservationId: 1,
          persistSource: mockPersist,
        },
        { queryableClient: mockClient, modeOverride: 'test_enforce' }
      );

      expect(result.status).toBe('consumed');
      // Crucial P1 assertion: persistSource was NOT called on replay!
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it('consumeSendQuota rejects and does not run persistSource if reservation is in invalid status', async () => {
      mockClient.query.mockImplementation(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (sql.includes('SELECT * FROM send_quota_reservations WHERE id = $1')) {
          return {
            rows: [{
              id: 1,
              billing_user_id: 10,
              status: 'reserved', // not sending!
              reservation_key: 'res_not_sending',
              wallet_quantity: 0,
            }],
          };
        }
        return { rows: [] };
      });

      const mockPersist = jest.fn();
      await expect(
        consumeSendQuota(
          {
            reservationId: 1,
            persistSource: mockPersist,
          },
          { queryableClient: mockClient, modeOverride: 'test_enforce' }
        )
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_RESERVATION_TRANSITION',
      });

      expect(mockPersist).not.toHaveBeenCalled();
    });

    it('consumeSendQuota executes persistSource and transitions to consumed when status is sending', async () => {
      mockClient.query.mockImplementation(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (sql.includes('UPDATE send_quota_reservations')) {
          return {
            rows: [{ id: 1, billing_user_id: 10, status: 'consumed', reservation_key: 'res_sending', wallet_quantity: 0 }],
          };
        }
        if (sql.includes('SELECT * FROM send_quota_reservations WHERE id = $1')) {
          return {
            rows: [{ id: 1, billing_user_id: 10, status: 'sending', reservation_key: 'res_sending', wallet_quantity: 0 }],
          };
        }
        return { rows: [] };
      });

      const mockPersist = jest.fn().mockResolvedValueOnce({ rowCount: 1 });
      const result = await consumeSendQuota(
        {
          reservationId: 1,
          persistSource: mockPersist,
        },
        { queryableClient: mockClient, modeOverride: 'test_enforce' }
      );

      expect(result.status).toBe('consumed');
      expect(mockPersist).toHaveBeenCalledTimes(1);
    });

    it('releaseSendQuota returns released stub in mode off', async () => {
      const result = await releaseSendQuota({ reservationId: null });
      expect(result).toEqual({ status: 'released', mode: 'off' });
    });

    it('markSendQuotaUncertain returns uncertain stub in mode off', async () => {
      const result = await markSendQuotaUncertain({ reservationId: null });
      expect(result).toEqual({ status: 'uncertain', mode: 'off' });
    });

    it('Finding 1: all public operations fail-closed with 503 when modeOverride is unrecognized without test bypass', async () => {
      await expect(
        markSendQuotaSending({ reservationId: 1 }, { modeOverride: 'unsupported_mode' })
      ).rejects.toMatchObject({
        status: 503,
        code: 'RESERVATION_MODE_NOT_IMPLEMENTED',
      });

      await expect(
        consumeSendQuota({ reservationId: 1 }, { modeOverride: 'unsupported_mode' })
      ).rejects.toMatchObject({
        status: 503,
        code: 'RESERVATION_MODE_NOT_IMPLEMENTED',
      });

      await expect(
        releaseSendQuota({ reservationId: 1 }, { modeOverride: 'unsupported_mode' })
      ).rejects.toMatchObject({
        status: 503,
        code: 'RESERVATION_MODE_NOT_IMPLEMENTED',
      });

      await expect(
        markSendQuotaUncertain({ reservationId: 1 }, { modeOverride: 'unsupported_mode' })
      ).rejects.toMatchObject({
        status: 503,
        code: 'RESERVATION_MODE_NOT_IMPLEMENTED',
      });
    });

    it('Finding 1 & 3: reserveSendQuota rejects with 400 FINGERPRINT_MISMATCH if provided fingerprint differs from payload', async () => {
      await expect(
        reserveSendQuota(
          {
            userId: 1,
            channel: 'email',
            quantity: 1,
            reservationKey: 'test_key_mismatch',
            requestFingerprint: 'a'.repeat(64),
            requestPayload: { channel: 'email', recipient: 'bob@example.com', content: 'test' },
          },
          { modeOverride: 'test_enforce' }
        )
      ).rejects.toMatchObject({
        status: 400,
        code: 'FINGERPRINT_MISMATCH',
      });
    });

    it('Finding 2: sanitizeResponseSnapshot rejects nested email, phone, or bearer token', () => {
      // Email in tracking
      expect(() =>
        sanitizeResponseSnapshot({
          messageId: 'msg_1',
          tracking: { email: 'leak@example.com', openCount: 1 },
        })
      ).toThrow(/email address not allowed/);

      // Phone in tracking
      expect(() =>
        sanitizeResponseSnapshot({
          messageId: 'msg_2',
          tracking: { contact: '0912345678', openCount: 1 },
        })
      ).toThrow(/phone number not allowed/);

      // Bearer token in tracking
      expect(() =>
        sanitizeResponseSnapshot({
          messageId: 'msg_3',
          tracking: { auth: 'Bearer secret_token_xyz' },
        })
      ).toThrow(/Secret key detected/);

      // Raw phone in recipientHash
      expect(() =>
        sanitizeResponseSnapshot({
          messageId: 'msg_4',
          recipientHash: '0901234567',
        })
      ).toThrow(/recipientHash must be a valid hex hash/);
    });

    it('Finding 2: validateSourceRef rejects unallowed keys and raw phone/email values', () => {
      expect(() => validateSourceRef({ unapprovedKey: 123 })).toThrow(/unauthorized key/);
      expect(() => validateSourceRef({ campaignId: 1, recipientId: 'user@test.vn' })).toThrow(/PII detected/);
      expect(() => validateSourceRef({ campaignId: 1, recipientId: '0912345678' })).toThrow(/PII detected/);
      // Non-integer or negative or complex values
      expect(() => validateSourceRef({ campaignId: -1 })).toThrow(/non-negative integer ID/);
      expect(() => validateSourceRef({ campaignId: { nested: 1 } })).toThrow(/scalar string or integer/);
    });

    it('Finding 2: validates reservationKey, providerReference, and failureCode against PII and invalid chars', () => {
      expect(() => validateReservationKey('test@example.com')).toThrow(/PII detected/);
      expect(() => validateReservationKey('invalid space key')).toThrow(/canonical runtime format/);
      expect(() => validateReservationKey('a'.repeat(200))).toThrow(/exceeds 191 chars/);

      // Rejects forged direct/preview/quick keys containing raw phones or freeform strings without h_
      expect(() => validateReservationKey('direct:email:1:req_0912345678:0123456789abcdef')).toThrow(/PII detected|canonical Zero-PII format/);
      expect(() => validateReservationKey('preview:zalo:1:msg_84901234567:0123456789abcdef')).toThrow(/PII detected|canonical Zero-PII format/);
      expect(() => validateReservationKey('quick:email:1:req_nguyenvana:0123456789abcdef')).toThrow(/canonical Zero-PII format/);
      expect(() => validateReservationKey('custom:nguyenvana')).toThrow(/does not follow canonical runtime format/);

      // Accepts canonical direct key
      expect(validateReservationKey('direct:email:1:h_0123456789abcdef0123:0123456789abcdef')).toBe(
        'direct:email:1:h_0123456789abcdef0123:0123456789abcdef'
      );

      expect(() => validateProviderReference('0901234567')).toThrow(/PII detected/);
      expect(() => validateProviderReference('invalid ref with spaces')).toThrow(/invalid characters/);

      expect(() => validateFailureCode('invalid!code#')).toThrow(/invalid characters/);
    });

    it('Finding 3: assertReservationOperationMode rejects modeOverride bypass in production', () => {
      const origEnv = process.env.NODE_ENV;
      const origMode = process.env.SEND_QUOTA_RESERVATION_MODE;
      try {
        process.env.NODE_ENV = 'production';
        process.env.SEND_QUOTA_RESERVATION_MODE = 'unsupported_mode';
        // When configured mode is unrecognized, caller passing modeOverride: 'off' in production must be ignored and fail-closed 503
        expect(() =>
          assertReservationOperationMode({ modeOverride: 'off' })
        ).toThrow(/is not recognized or not enabled/);

        // When configured mode is enforce, caller passing modeOverride: 'off' in production is ignored
        process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
        expect(assertReservationOperationMode({ modeOverride: 'off' })).toEqual({
          mode: 'enforce',
          isTestEnforce: false,
        });
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origMode === undefined) {
          delete process.env.SEND_QUOTA_RESERVATION_MODE;
        } else {
          process.env.SEND_QUOTA_RESERVATION_MODE = origMode;
        }
      }
    });

    it('Finding 1: source allowlist is strictly fail-closed and rejects unlisted/missing sources to mode off', () => {
      const origEnv = process.env.NODE_ENV;
      const origMode = process.env.SEND_QUOTA_RESERVATION_MODE;
      const origSources = process.env.SEND_QUOTA_RESERVATION_SOURCES;
      try {
        process.env.NODE_ENV = 'production';
        process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
        process.env.SEND_QUOTA_RESERVATION_SOURCES = 'quick_send,direct_email';

        // 1. Allowed source in params
        expect(assertReservationOperationMode({}, { sourceType: 'quick_send' })).toEqual({
          mode: 'enforce',
          isTestEnforce: false,
        });
        expect(assertReservationOperationMode({}, { sourceType: 'direct_email' })).toEqual({
          mode: 'enforce',
          isTestEnforce: false,
        });

        // 2. Unlisted source in params -> mode off (skippedByAllowlist: true)
        expect(assertReservationOperationMode({}, { sourceType: 'zalo_preview' })).toEqual({
          mode: 'off',
          isTestEnforce: false,
          skippedByAllowlist: true,
          reason: 'source_not_in_allowlist',
        });

        // 3. Missing source during admission -> MUST NOT fail-open to enforce! Must be mode off
        expect(assertReservationOperationMode({}, {}, { isAdmission: true })).toEqual({
          mode: 'off',
          isTestEnforce: false,
          skippedByAllowlist: true,
          reason: 'source_not_in_allowlist',
        });
        expect(assertReservationOperationMode({}, null, { isAdmission: true })).toEqual({
          mode: 'off',
          isTestEnforce: false,
          skippedByAllowlist: true,
          reason: 'source_not_in_allowlist',
        });

        // 4. Lifecycle settlement (markSending, consume, release, uncertain) MUST NOT be blocked by allowlist
        expect(assertReservationOperationMode({})).toEqual({
          mode: 'enforce',
          isTestEnforce: false,
        });

        // 4. Wildcard '*' enables all sources
        process.env.SEND_QUOTA_RESERVATION_SOURCES = '*';
        expect(assertReservationOperationMode({}, { sourceType: 'inbox' })).toEqual({
          mode: 'enforce',
          isTestEnforce: false,
        });
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origMode === undefined) delete process.env.SEND_QUOTA_RESERVATION_MODE;
        else process.env.SEND_QUOTA_RESERVATION_MODE = origMode;
        if (origSources === undefined) delete process.env.SEND_QUOTA_RESERVATION_SOURCES;
        else process.env.SEND_QUOTA_RESERVATION_SOURCES = origSources;
      }
    });

    it('Finding 3: consumeSendQuota in mode off is a pure stub and never executes persistSource callback', async () => {
      const mockPersist = jest.fn();
      const result = await consumeSendQuota(
        { reservationId: 123, persistSource: mockPersist },
        { modeOverride: 'off' }
      );
      expect(result).toEqual({ id: 123, status: 'consumed', mode: 'off' });
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it('Finding 2: allows technical Zalo message ID 8128678217945 in snapshot, sourceRef, and providerReference', () => {
      // 1. response_snapshot with numeric Zalo msgId
      const sanitized = sanitizeResponseSnapshot({
        messageId: 8128678217945,
        provider: 'zalo_zns',
        status: 'delivered',
      });
      expect(sanitized.messageId).toBe(8128678217945);

      // 2. sourceRef with numeric providerMessageId
      expect(() => validateSourceRef({ providerMessageId: 8128678217945, campaignId: 10 })).not.toThrow();

      // 3. providerReference with numeric string
      expect(validateProviderReference('8128678217945')).toBe('8128678217945');
    });

    it('Finding 3: reserveSendQuota({}) with empty params in mode off always returns safe stub without validation errors', async () => {
      const result = await reserveSendQuota({}, { modeOverride: 'off' });
      expect(result).toMatchObject({
        id: null,
        reservation_key: null,
        status: 'reserved',
        mode: 'off',
        allowed: true,
        bypass: true,
      });
    });

    it('Finding 4: reserveSendQuota rejects uppercase hex requestFingerprint with 400', async () => {
      await expect(
        reserveSendQuota(
          {
            userId: 1,
            channel: 'email',
            quantity: 1,
            reservationKey: 'test_key_valid_lowercase',
            requestFingerprint: 'A'.repeat(64),
          },
          { modeOverride: 'test_enforce' }
        )
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_REQUEST_FINGERPRINT',
      });
    });

    it('PR-Q2: transitionReservationState updates wallet_item_key and wallet_quantity on retry (released -> reserved)', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 42, status: 'released', reservation_key: 'res_retry_wallet', wallet_quantity: 0, wallet_item_key: null }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 42,
            status: 'reserved',
            wallet_item_key: 'emails',
            wallet_quantity: 2,
          }],
        });

      const result = await transitionReservationState(mockClient, 42, 'released', 'reserved', {
        walletItemKey: 'emails',
        walletQuantity: 2,
      });

      expect(result.status).toBe('reserved');
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const updateSql = mockClient.query.mock.calls[1][0];
      expect(updateSql).toContain('wallet_item_key');
      expect(updateSql).toContain('wallet_quantity');
    });

    it('PR-Q2: Generic database error in enforce mode maps to 503 SEND_QUOTA_UNAVAILABLE', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('connection to server at "localhost" failed'));

      await expect(
        reserveSendQuota(
          {
            userId: 1,
            channel: 'email',
            quantity: 1,
            reservationKey: 'test_key_db_fail',
            requestFingerprint: 'b'.repeat(64),
          },
          { queryableClient: mockClient, modeOverride: 'test_enforce' }
        )
      ).rejects.toMatchObject({
        status: 503,
        code: 'SEND_QUOTA_UNAVAILABLE',
      });
    });

    it('PR-Q2: Shadow Mode multidimensional metrics: distinguishes 403 denial vs internal error', async () => {
      resetShadowMismatchMetrics();
      _clearQuotaCache();

      // Case A: Candidate encounters DB error -> atomic_candidate_error is incremented
      const origGetClient = db.getClient;
      db.getClient = jest.fn().mockRejectedValueOnce(new Error('PostgreSQL candidate connection failed'));

      try {
        const validKey = buildDirectReservationKey({
          channel: 'email',
          billingUserId: 1,
          clientKey: 'shadow_candidate_err_key',
          recipient: 'shadow@test.vn',
        });

        const res = await reserveSendQuota(
          {
            userId: 1,
            roleCode: 'admin',
            channel: 'email',
            quantity: 1,
            reservationKey: validKey,
            requestFingerprint: 'c'.repeat(64),
          },
          { modeOverride: 'shadow' }
        );

        expect(res.mode).toBe('shadow');
        expect(res.allowed).toBe(true);
        expect(res.shadowAllowed).toBe(false);

        const metricsAfter = getShadowMismatchMetrics();
        expect(metricsAfter.total).toBe(1);
        expect(metricsAfter.atomic_candidate_error).toBe(1);
        expect(metricsAfter.mismatches).toBe(1);
        expect(metricsAfter.legacy_allow_atomic_deny).toBe(1);
      } finally {
        db.getClient = origGetClient;
      }

      // Case B: Candidate evaluates 403 quota exhaustion (status = 403) -> legacy_allow_atomic_deny++ but atomic_candidate_error remains 0
      resetShadowMismatchMetrics();
      _clearQuotaCache();

      const origDbQuery = db.query;
      // Legacy queries db.query -> return plan with daily_email_limit: 100 -> legacy ALLOWS
      db.query = jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM users') || sql.includes('JOIN plans') || sql.includes('FROM plans')) {
          return {
            rows: [{
              id: 1,
              has_plan: true,
              is_subscription_expired: false,
              subscription_expires_at: new Date(Date.now() + 86400000),
              plan_activated_at: new Date(Date.now() - 5 * 86400000),
              effective_plan_id: 10,
              active_plan_id: 10,
              role: 'user',
              daily_email_limit: 100,
              monthly_email_limit: 1000,
            }],
          };
        }
        if (sql.includes('count') || sql.includes('COUNT')) {
          return { rows: [{ count: 0, total: 0 }] };
        }
        return { rows: [] };
      });

      const mockShadowClient403 = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT') && (sql.includes('FROM users') || sql.includes('JOIN plans') || sql.includes('FROM plans'))) {
            return {
              rows: [{
                id: 1,
                effective_plan_id: 10,
                plan_id: 10,
                has_plan: true,
                is_subscription_expired: false,
                daily_email_limit: 0,
                monthly_email_limit: 1000,
              }],
            };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      db.getClient = jest.fn().mockResolvedValue(mockShadowClient403);

      try {
        const validKey = buildDirectReservationKey({
          channel: 'email',
          billingUserId: 1,
          clientKey: 'shadow_403_key',
          recipient: 'shadow403@test.vn',
        });

        const res = await reserveSendQuota(
          {
            userId: 1,
            roleCode: 'user',
            channel: 'email',
            quantity: 1,
            reservationKey: validKey,
            requestFingerprint: 'c'.repeat(64),
          },
          { modeOverride: 'shadow' }
        );

        expect(res.mode).toBe('shadow');
        expect(res.allowed).toBe(true);
        expect(res.shadowAllowed).toBe(false);
        expect(res.shadowError?.status).toBe(403);

        const metricsAfter = getShadowMismatchMetrics();
        expect(metricsAfter.total).toBe(1);
        expect(metricsAfter.mismatches).toBe(1);
        expect(metricsAfter.legacy_allow_atomic_deny).toBe(1);
        expect(metricsAfter.atomic_candidate_error).toBe(0);
      } finally {
        db.query = origDbQuery;
        db.getClient = origGetClient;
      }
    });

    it('PR-Q2: db.getClient() failure when acquiring connection maps to 503 SEND_QUOTA_UNAVAILABLE', async () => {
      const origGetClient = db.getClient;
      db.getClient = jest.fn().mockRejectedValueOnce(new Error('connection pool exhausted'));

      try {
        const validKey = buildDirectReservationKey({
          channel: 'email',
          billingUserId: 1,
          clientKey: 'get_client_fail_key',
          recipient: 'gc@test.vn',
        });

        await expect(
          reserveSendQuota(
            {
              userId: 1,
              channel: 'email',
              quantity: 1,
              reservationKey: validKey,
              requestFingerprint: 'b'.repeat(64),
            },
            { modeOverride: 'test_enforce' }
          )
        ).rejects.toMatchObject({
          status: 503,
          code: 'SEND_QUOTA_UNAVAILABLE',
        });
      } finally {
        db.getClient = origGetClient;
      }
    });

    it('PR-Q2: Shadow Mode legacy_deny_atomic_allow records mismatch and throws legacy error', async () => {
      resetShadowMismatchMetrics();
      _clearQuotaCache();

      const origDbQuery = db.query;
      const origGetClient = db.getClient;

      // Mock legacy db.query to return plan with 0 daily email limit (triggers legacy 403)
      db.query = jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM users') || sql.includes('JOIN plans') || sql.includes('FROM plans')) {
          return {
            rows: [{
              id: 1,
              has_plan: true,
              is_subscription_expired: false,
              subscription_expires_at: new Date(Date.now() + 86400000),
              active_plan_id: 10,
              role: 'user',
              daily_email_limit: 0,
              monthly_email_limit: 0,
            }],
          };
        }
        return { rows: [] };
      });

      const mockShadowClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT') && (sql.includes('FROM users') || sql.includes('JOIN plans') || sql.includes('FROM plans'))) {
            return {
              rows: [{
                id: 1,
                effective_plan_id: 10,
                plan_id: 10,
                has_plan: true,
                is_subscription_expired: false,
                daily_email_limit: 100,
                monthly_email_limit: 1000,
              }],
            };
          }
          if (sql.includes('count') || sql.includes('COUNT')) {
            return { rows: [{ count: 0, total: 0 }] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      db.getClient = jest.fn().mockResolvedValue(mockShadowClient);

      try {
        const validKey = buildDirectReservationKey({
          channel: 'email',
          billingUserId: 1,
          clientKey: 'legacy_deny_k',
          recipient: 'leg_deny@test.vn',
        });

        await expect(
          reserveSendQuota(
            {
              userId: 1,
              roleCode: 'user',
              channel: 'email',
              quantity: 1,
              reservationKey: validKey,
              requestFingerprint: 'd'.repeat(64),
            },
            { modeOverride: 'shadow' }
          )
        ).rejects.toMatchObject({
          status: 403,
        });

        const metrics = getShadowMismatchMetrics();
        expect(metrics.total).toBe(1);
        expect(metrics.mismatches).toBe(1);
        expect(metrics.legacy_deny_atomic_allow).toBe(1);
        expect(metrics.atomic_candidate_error).toBe(0);
      } finally {
        db.query = origDbQuery;
        db.getClient = origGetClient;
      }
    });
  });
});
