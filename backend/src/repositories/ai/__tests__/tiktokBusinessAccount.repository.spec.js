/**
 * tiktokBusinessAccount.repository.spec.js
 *
 * Unit test cho repository — chỉ test SQL shape (mock db.query). Không chạm DB thật.
 * Pattern copy từ `backend/src/services/chatbot/__tests__/aiActivity.inflight.spec.js`
 * (ESM + jest.unstable_mockModule, KHÔNG jest.mock cũ).
 */

import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Test môi trường: SMTP_SECRET_KEY bắt buộc cho encryptSmtpSecret (smtpSecretCrypto.js:11-13).
// Test chạy trong CI nên giá trị chỉ dùng để test, KHÔNG phải production secret.
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'test-smtp-secret-for-jest';

// Mock db TRƯỚC khi import repository (bắt buộc với ESM).
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  __esModule: true,
  default: { query: mockQuery },
}));

const repository = (await import('../tiktokBusinessAccount.repository.js')).default;
const { encryptSmtpSecret } = await import('../../../utils/smtpSecretCrypto.js');

describe('tiktokBusinessAccount.repository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('listByUser', () => {
    test('SQL có WHERE id_user=$1 và ORDER BY created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.listByUser(7);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/FROM tiktok_business_accounts/);
      expect(sql).toMatch(/WHERE id_user = \$1/);
      expect(sql).toMatch(/ORDER BY created_at DESC/);
      expect(params).toEqual([7]);
    });
  });

  describe('findById — chống IDOR (Bẫy 12)', () => {
    test('SQL có cả id=$1 VÀ id_user=$2', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.findById(99, 1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/WHERE id = \$1 AND id_user = \$2/);
      expect(params).toEqual([99, 1]);
    });
  });

  describe('deactivate — ownership check', () => {
    test('UPDATE có điều kiện id=$1 AND id_user=$2', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const result = await repository.deactivate(1, 7);
      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/WHERE id = \$1 AND id_user = \$2/);
      expect(params).toEqual([1, 7]);
    });

    test('Trả về false nếu rows.length = 0 (không có row nào khớp)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repository.deactivate(1, 7);
      expect(result).toBe(false);
    });
  });

  describe('upsert — token đã mã hoá trước khi vào repo', () => {
    test('Nhận ciphertext, lưu nguyên vào SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const plainAccess = 'real-access-token-123';
      const plainRefresh = 'real-refresh-token-456';
      const cipherAccess = encryptSmtpSecret(plainAccess);
      const cipherRefresh = encryptSmtpSecret(plainRefresh);

      await repository.upsert({
        userId: 7,
        businessId: 'biz_abc',
        displayName: 'My Shop',
        accessToken: cipherAccess,
        refreshToken: cipherRefresh,
        scope: 'user.info.basic,dm.message.send',
        accessExpiresAt: new Date(),
        refreshExpiresAt: new Date(),
        region: 'APAC',
        role: 'business_account',
      });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO tiktok_business_accounts/);
      expect(sql).toMatch(/ON CONFLICT ON CONSTRAINT uq_tiktok_business_accounts_user_business/);
      // Token truyền vào SQL phải là ciphertext, KHÔNG phải plaintext
      expect(params[3]).toBe(cipherAccess);
      expect(params[4]).toBe(cipherRefresh);
      expect(params[3]).not.toBe(plainAccess);
      expect(params[3]).toMatch(/^enc:v1:/);
    });
  });

  describe('findExpiringForRefresh — bufferHours', () => {
    test('Truyền bufferHours=2 vào SQL qua INTERVAL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.findExpiringForRefresh(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/access_token_expires_at < \(NOW\(\) \+ \(\$1 \|\| ' hours'\)::INTERVAL\)/);
      expect(params).toEqual([2]);
    });

    test('Default buffer = 2 giờ', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.findExpiringForRefresh();
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([2]);
    });

    test('Có LIMIT 100 để chặn cron xử lý quá nhiều 1 lúc', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.findExpiringForRefresh(2);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/LIMIT 100/);
    });
  });

  describe('touchWebhook', () => {
    test('UPDATE chỉ last_webhook_at, không có userId (webhook global)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repository.touchWebhook(42);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/SET last_webhook_at = NOW\(\)/);
      expect(params).toEqual([42]);
    });
  });
});
