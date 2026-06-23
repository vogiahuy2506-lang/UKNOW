import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock module phải đặt trước khi import file dùng nó (ESM dynamic mock pattern).
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { checkUserResourceLimit, enforceResourceLimitTx } = await import('../userResourceLimit.util.js');

describe('userResourceLimit.util', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('checkUserResourceLimit', () => {
    it('admin (roleCode=admin) bypass giới hạn, không gọi DB', async () => {
      const result = await checkUserResourceLimit({
        userId: 1,
        roleCode: 'admin',
        resourceKey: 'campaigns',
      });

      expect(result).toEqual({
        allowed: true,
        limit: null,
        currentCount: 0,
        message: null,
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('resourceKey không hợp lệ → throw', async () => {
      await expect(
        checkUserResourceLimit({
          userId: 1,
          roleCode: 'user',
          resourceKey: 'invalid_key',
        })
      ).rejects.toThrow(/Resource key không hợp lệ/);
    });

    it('input null → throw vì resourceKey undefined', async () => {
      await expect(checkUserResourceLimit(null)).rejects.toThrow(/Resource key không hợp lệ/);
    });

    it('user thường: limit null trong DB → cho phép (không giới hạn)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ max_campaigns: null, max_zalo_accounts: null }],
      });

      const result = await checkUserResourceLimit({
        userId: 10,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
      expect(result.message).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('user thường: DB không có row cho user (rows rỗng) → không giới hạn', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await checkUserResourceLimit({
        userId: 99,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
    });

    it('user thường: count < limit → cho phép tạo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_campaigns: 5 }] }) // limit lookup
        .mockResolvedValueOnce({ rows: [{ total: 2 }] }); // count

      const result = await checkUserResourceLimit({
        userId: 10,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });

      expect(result).toEqual({
        allowed: true,
        limit: 5,
        currentCount: 2,
        message: null,
      });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('user thường: count == limit → chặn (boundary)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_email_templates: 3 }] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] });

      const result = await checkUserResourceLimit({
        userId: 10,
        roleCode: 'user',
        resourceKey: 'emailTemplates',
      });

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(3);
      expect(result.currentCount).toBe(3);
      expect(result.message).toContain('số Email template');
      expect(result.message).toContain('(3)');
    });

    it('user thường: count > limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_landing_pages: 1 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });

      const result = await checkUserResourceLimit({
        userId: 10,
        roleCode: 'user',
        resourceKey: 'landingPages',
      });

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('số landing page');
    });

    it('DB lỗi 42703 (thiếu cột giới hạn) → fallback không giới hạn', async () => {
      const err = new Error('column does not exist');
      err.code = '42703';
      mockQuery.mockRejectedValueOnce(err);

      const result = await checkUserResourceLimit({
        userId: 10,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('DB lỗi khác → propagate', async () => {
      const err = new Error('connection refused');
      err.code = 'ECONNREFUSED';
      mockQuery.mockRejectedValueOnce(err);

      await expect(
        checkUserResourceLimit({
          userId: 10,
          roleCode: 'user',
          resourceKey: 'campaigns',
        })
      ).rejects.toThrow('connection refused');
    });

    it('hỗ trợ đủ 6 resourceKey: campaigns, zaloAccounts, emailAccounts, emailTemplates, zaloTemplates, landingPages', async () => {
      const keys = [
        'campaigns',
        'zaloAccounts',
        'emailAccounts',
        'emailTemplates',
        'zaloTemplates',
        'landingPages',
      ];
      for (const k of keys) {
        mockQuery.mockReset();
        mockQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ total: 0 }] });

        const result = await checkUserResourceLimit({
          userId: 1,
          roleCode: 'user',
          resourceKey: k,
        });
        expect(result.allowed).toBe(true);
      }
    });

    it('parse limit từ string (DB pg đôi khi trả varchar)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_campaigns: '10' }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });

      const result = await checkUserResourceLimit({
        userId: 1,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });
      expect(result.limit).toBe(10);
      expect(result.allowed).toBe(true);
    });

    it('parse count từ string (DB pg trả "0" thay vì 0)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_campaigns: 5 }] })
        .mockResolvedValueOnce({ rows: [{ total: '3' }] });

      const result = await checkUserResourceLimit({
        userId: 1,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });
      expect(result.currentCount).toBe(3);
      expect(result.allowed).toBe(true);
    });

    it('admin với roleCode hoa thường khác nhau vẫn bypass', async () => {
      const result1 = await checkUserResourceLimit({
        userId: 1,
        roleCode: 'ADMIN',
        resourceKey: 'campaigns',
      });
      const result2 = await checkUserResourceLimit({
        userId: 1,
        roleCode: '  Admin  ',
        resourceKey: 'campaigns',
      });
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('enforceResourceLimitTx', () => {
    const mockClient = { query: jest.fn() };

    beforeEach(() => {
      mockClient.query.mockReset();
    });

    it('admin bypass — không gọi lock/count', async () => {
      await enforceResourceLimitTx(mockClient, {
        userId: 1,
        roleCode: 'admin',
        resourceKey: 'campaigns',
      });
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('limit null → no-op sau lock', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ max_campaigns: null }] });

      await enforceResourceLimitTx(mockClient, {
        userId: 10,
        roleCode: 'user',
        resourceKey: 'campaigns',
      });

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(String(mockClient.query.mock.calls[0][0])).toMatch(/pg_advisory_xact_lock/);
    });

    it('count >= limit → throw RESOURCE_LIMIT_EXCEEDED', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ max_email_templates: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });

      await expect(
        enforceResourceLimitTx(mockClient, {
          userId: 10,
          roleCode: 'user',
          resourceKey: 'emailTemplates',
        })
      ).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        statusCode: 400,
        resource: 'emailTemplates',
      });
    });

    it('limit 0 → throw ngay (feature disabled)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ max_landing_pages: 0 }] });

      await expect(
        enforceResourceLimitTx(mockClient, {
          userId: 10,
          roleCode: 'user',
          resourceKey: 'landingPages',
        })
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });
});
