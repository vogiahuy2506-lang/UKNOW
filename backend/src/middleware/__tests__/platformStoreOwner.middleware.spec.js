import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { requirePlatformStoreOwner } = await import('../platformStoreOwner.middleware.js');
const { assertPlatformStoreOwner } = await import('../../services/founderai/platformStoreAccess.service.js');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.body = payload; return res; });
  return res;
}

describe('cổng cửa hàng nền tảng — platformStoreAccess', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('assertPlatformStoreOwner', () => {
    it('chủ workspace là super admin → qua', async () => {
      mockQuery.mockResolvedValue({ rows: [{ role: 'admin' }] });
      await expect(assertPlatformStoreOwner(7)).resolves.toBeUndefined();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM users WHERE id = $1'), [7]);
    });

    it('chủ workspace role user → 403 PLATFORM_STORE_ADMIN_ONLY', async () => {
      mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
      await expect(assertPlatformStoreOwner(7)).rejects.toMatchObject({
        statusCode: 403,
        code: 'PLATFORM_STORE_ADMIN_ONLY',
      });
    });

    it('không tìm thấy tài khoản → chặn (fail-closed)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await expect(assertPlatformStoreOwner(999)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('requirePlatformStoreOwner (middleware)', () => {
    it('nhân viên của workspace super admin: tra role của CHỦ (ownerId), không phải của nhân viên', async () => {
      mockQuery.mockResolvedValue({ rows: [{ role: 'admin' }] });
      const req = { user: { id: 2, role: 'user', activeContext: { type: 'employee', ownerId: 9, permissions: {} } } };
      const next = jest.fn();

      await requirePlatformStoreOwner(req, makeRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual([9]);
    });

    it('chủ role user → 403 kèm code, không gọi next', async () => {
      mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
      const req = { user: { id: 4, role: 'user', activeContext: { type: 'self' } } };
      const res = makeRes();
      const next = jest.fn();

      await requirePlatformStoreOwner(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PLATFORM_STORE_ADMIN_ONLY');
      expect(next).not.toHaveBeenCalled();
    });

    it('lỗi CSDL → 500, không cho qua', async () => {
      mockQuery.mockRejectedValue(new Error('db down'));
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const req = { user: { id: 4, role: 'admin', activeContext: { type: 'self' } } };
      const res = makeRes();
      const next = jest.fn();

      await requirePlatformStoreOwner(req, res, next);

      expect(res.statusCode).toBe(500);
      expect(next).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
