import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFindSettings = jest.fn();
const mockSaveSettings = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/subscriptionReminderSettings.repository.js', () => ({
  findSettings: mockFindSettings,
  saveSettings: mockSaveSettings,
}));

const {
  DEFAULT_REMINDER_DAYS_BEFORE,
  normalizeReminderDaysBefore,
  getReminderSettings,
  updateReminderSettings,
} = await import('../subscriptionReminderSettings.service.js');

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.3 — luật hợp lệ (1-365, không trùng, tối đa
// 5 mốc, rỗng hợp lệ, lưu sắp giảm dần) + đọc hỏng rơi về mặc định [7,3] (đừng ném).
describe('subscriptionReminderSettings.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeReminderDaysBefore', () => {
    it('mặc định [7,3] đúng như hôm nay', () => {
      expect(DEFAULT_REMINDER_DAYS_BEFORE).toEqual([7, 3]);
    });

    it('danh sách rỗng là hợp lệ (tắt hết nhắc trước hạn)', () => {
      expect(normalizeReminderDaysBefore([])).toEqual([]);
    });

    it('sắp lại giảm dần dù nhập tăng dần', () => {
      expect(normalizeReminderDaysBefore([2, 5, 10])).toEqual([10, 5, 2]);
    });

    it('ca 7 — [7,7] (trùng mốc) → 400 "không được trùng mốc"', () => {
      expect(() => normalizeReminderDaysBefore([7, 7])).toThrow(/trùng mốc/);
      try {
        normalizeReminderDaysBefore([7, 7]);
      } catch (error) {
        expect(error.status).toBe(400);
      }
    });

    it('ca 8 — [0] (dưới 1 ngày) → 400 "mốc phải từ 1 đến 365 ngày"', () => {
      expect(() => normalizeReminderDaysBefore([0])).toThrow(/1 đến 365 ngày/);
    });

    it('ca 8 — [400] (trên 365 ngày) → 400 "mốc phải từ 1 đến 365 ngày"', () => {
      expect(() => normalizeReminderDaysBefore([400])).toThrow(/1 đến 365 ngày/);
    });

    it('biên hợp lệ: 1 và 365 đều được nhận', () => {
      expect(normalizeReminderDaysBefore([1, 365])).toEqual([365, 1]);
    });

    it('ca 9 (đột biến bắt buộc: bỏ kẹp tối đa 5 mốc phải làm ca này đỏ) — 6 mốc → 400 "Tối đa 5 mốc"', () => {
      expect(() => normalizeReminderDaysBefore([1, 2, 3, 4, 5, 6])).toThrow(/Tối đa 5 mốc/);
    });

    it('đúng 5 mốc thì hợp lệ (biên trên của giới hạn)', () => {
      expect(normalizeReminderDaysBefore([1, 2, 3, 4, 5])).toEqual([5, 4, 3, 2, 1]);
    });

    it('không phải mảng → 400', () => {
      expect(() => normalizeReminderDaysBefore('7,3')).toThrow();
      expect(() => normalizeReminderDaysBefore(undefined)).toThrow();
    });

    it('phần tử không phải số nguyên → 400', () => {
      expect(() => normalizeReminderDaysBefore([7, 3.5])).toThrow();
      expect(() => normalizeReminderDaysBefore([7, 'ba'])).toThrow();
    });
  });

  describe('getReminderSettings', () => {
    it('ca 1 — có dòng cấu hình → trả đúng daysBefore đã lưu', async () => {
      mockFindSettings.mockResolvedValue({ days_before: [10, 5], updated_by: 9, updated_at: '2026-09-13T00:00:00.000Z' });

      const result = await getReminderSettings();

      expect(result).toEqual({ daysBefore: [10, 5], updatedBy: 9, updatedAt: '2026-09-13T00:00:00.000Z' });
    });

    it('chưa có dòng nào (bảng rỗng, ví dụ vừa truncate ở test) → mặc định [7,3]', async () => {
      mockFindSettings.mockResolvedValue(null);

      const result = await getReminderSettings();

      expect(result).toEqual({ daysBefore: [7, 3], updatedBy: null, updatedAt: null });
    });

    it('ca 10 (đột biến bắt buộc: đọc lỗi phải rơi về mặc định, KHÔNG được ném) — DB lỗi tạm thời → vẫn trả [7,3], không throw', async () => {
      mockFindSettings.mockRejectedValue(new Error('relation "subscription_reminder_settings" does not exist'));

      await expect(getReminderSettings()).resolves.toEqual({ daysBefore: [7, 3], updatedBy: null, updatedAt: null });
    });
  });

  describe('updateReminderSettings', () => {
    it('validate rồi lưu, trả DTO từ dòng vừa ghi', async () => {
      mockSaveSettings.mockResolvedValue({ days_before: [10, 5, 2], updated_by: 9, updated_at: '2026-09-13T00:00:00.000Z' });

      const result = await updateReminderSettings({ daysBefore: [2, 10, 5] }, 9);

      expect(mockSaveSettings).toHaveBeenCalledWith({ daysBefore: [10, 5, 2], updatedBy: 9 });
      expect(result).toEqual({ daysBefore: [10, 5, 2], updatedBy: 9, updatedAt: '2026-09-13T00:00:00.000Z' });
    });

    it('nhập sai (ví dụ trùng mốc) → 400, KHÔNG gọi saveSettings', async () => {
      await expect(updateReminderSettings({ daysBefore: [7, 7] }, 9)).rejects.toMatchObject({ status: 400 });
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });
  });
});
