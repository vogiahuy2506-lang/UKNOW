import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { checkUserEmailSendLimit, checkUserZaloSendLimit } = await import('../userSendLimit.util.js');

describe('userSendLimit.util', () => {
  beforeEach(() => mockQuery.mockReset());

  // ── checkUserEmailSendLimit ────────────────────────────────────────────────

  describe('checkUserEmailSendLimit', () => {
    it('admin bypass — không gọi DB', async () => {
      const result = await checkUserEmailSendLimit({ userId: 1, roleCode: 'admin' });
      expect(result).toEqual({ allowed: true, limit: null, currentCount: 0, period: null, message: null });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('không có plan (join trả rỗng) → không giới hạn', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getUserPlanSendLimits
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('plan có daily_email_limit = null → không giới hạn theo ngày, kiểm tra tháng', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null }] })
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1); // chỉ lấy limit, không count
    });

    it('count ngày < daily_email_limit → cho phép gửi', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 500, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] }); // count today
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull(); // no monthly limit
    });

    it('count ngày == daily_email_limit → chặn (boundary)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 100, monthly_email_limit: 3000, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.currentCount).toBe(100);
      expect(result.period).toBe('daily');
      expect(result.message).toContain('100/100');
    });

    it('count ngày > daily_email_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 50, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 55 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('daily');
    });

    it('daily OK → tiếp tục check monthly và chặn nếu vượt tháng', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 500, monthly_email_limit: 1000, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] }) // daily count < 500
        .mockResolvedValueOnce({ rows: [{ total: 1000 }] }); // monthly count == 1000
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
      expect(result.limit).toBe(1000);
      expect(result.message).toContain('trong tháng');
    });

    it('cả daily và monthly đều OK → cho phép', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 500, monthly_email_limit: 10000, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] })  // daily
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] }); // monthly
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
    });

    it('parse limit từ string (pg trả varchar)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: '100', monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.currentCount).toBe(100);
    });

    it('daily_email_limit = 0 → không hỗ trợ, không query count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ daily_email_limit: 0, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null }] });
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.message).toContain('không được hỗ trợ');
      expect(mockQuery).toHaveBeenCalledTimes(1); // chỉ lấy plan, không count
    });

    it('monthly_email_limit = 0 → không hỗ trợ (daily OK)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: 500, monthly_email_limit: 0, daily_zalo_limit: null, monthly_zalo_limit: null }] })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] }); // daily OK
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.period).toBe('monthly');
      expect(result.message).toContain('không được hỗ trợ');
      expect(mockQuery).toHaveBeenCalledTimes(2); // plan + daily count, không count monthly
    });
  });

  // ── checkUserZaloSendLimit ─────────────────────────────────────────────────

  describe('checkUserZaloSendLimit', () => {
    it('admin bypass', async () => {
      const result = await checkUserZaloSendLimit({ userId: 1, roleCode: 'admin' });
      expect(result.allowed).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('không có plan → không giới hạn', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect((await checkUserZaloSendLimit({ userId: 10 })).allowed).toBe(true);
    });

    it('vượt daily_zalo_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: 200, monthly_zalo_limit: 2000 }] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('daily');
      expect(result.message).toContain('Zalo');
    });

    it('vượt monthly_zalo_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: 200, monthly_zalo_limit: 2000 }] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })   // daily OK
        .mockResolvedValueOnce({ rows: [{ total: 2001 }] }); // monthly exceeded
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
    });

    it('cả daily và monthly đều OK → cho phép', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: 200, monthly_zalo_limit: 2000 }] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] })
        .mockResolvedValueOnce({ rows: [{ total: 999 }] });
      expect((await checkUserZaloSendLimit({ userId: 10 })).allowed).toBe(true);
    });

    it('daily_zalo_limit = null → skip daily, vẫn check monthly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: 100 }] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] }); // monthly == limit
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
      expect(mockQuery).toHaveBeenCalledTimes(2); // plan + monthly count (không count daily)
    });

    it('daily_zalo_limit = 0 → không hỗ trợ, không query count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: 0, monthly_zalo_limit: null }] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.message).toContain('Zalo');
      expect(result.message).toContain('không được hỗ trợ');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
