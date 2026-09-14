import { describe, it, expect } from '@jest/globals';
import {
  formatUtcAndVietnamForLog,
  vnDayKey,
  getVietnamDayRange,
  getVietnamWeekRange,
  getVietnamMonthRange,
} from '../vnTimeFormat.util.js';

describe('vnTimeFormat.util', () => {
  describe('getVietnamDayRange', () => {
    it('chuỗi YYYY-MM-DD trả đúng startUtc và endUtc', () => {
      const range = getVietnamDayRange('2026-08-19');
      expect(range.dayKey).toBe('20260819');
      expect(range.dateStr).toBe('2026-08-19');
      expect(range.startIso).toBe('2026-08-18T17:00:00.000Z');
      expect(range.endIso).toBe('2026-08-19T17:00:00.000Z');
    });

    it('Date object giờ UTC tối trả về ngày VN kế tiếp', () => {
      // 2026-08-19 18:00 UTC = 2026-08-20 01:00 VN
      const range = getVietnamDayRange(new Date('2026-08-19T18:00:00Z'));
      expect(range.dayKey).toBe('20260820');
      expect(range.dateStr).toBe('2026-08-20');
    });
  });
  describe('vnDayKey', () => {
    it('23:50 VN vẫn thuộc ngày cũ', () => {
      // 2026-08-08T16:50:00Z = 23:50 giờ VN
      expect(vnDayKey('2026-08-08T16:50:00Z')).toBe('20260808');
    });

    it('00:10 VN sang ngày mới', () => {
      // 2026-08-08T17:10:00Z = 00:10 giờ VN ngày 9
      expect(vnDayKey('2026-08-08T17:10:00Z')).toBe('20260809');
    });

    it('00:00 UTC = 07:00 VN cùng ngày lịch', () => {
      expect(vnDayKey('2026-08-08T00:00:00Z')).toBe('20260808');
    });

    it('chấp nhận Date object', () => {
      expect(vnDayKey(new Date('2026-08-08T16:50:00Z'))).toBe('20260808');
    });
  });

  describe('formatUtcAndVietnamForLog', () => {
    it('format mốc UTC + giờ VN từ Date object', () => {
      // 2025-01-15T03:00:00Z → giờ VN 10:00:00 cùng ngày
      const d = new Date('2025-01-15T03:00:00Z');
      const out = formatUtcAndVietnamForLog(d);
      expect(out).toContain('2025-01-15T03:00:00.000Z');
      expect(out).toContain('giờ VN:');
      expect(out).toContain('10:00:00');
      expect(out).toContain('15/01/2025');
    });

    it('chấp nhận ISO string', () => {
      const out = formatUtcAndVietnamForLog('2025-01-15T03:00:00Z');
      expect(out).toContain('2025-01-15T03:00:00.000Z');
      expect(out).toContain('10:00:00');
    });

    it('chấp nhận epoch ms (number)', () => {
      const ms = Date.UTC(2025, 0, 15, 3, 0, 0);
      const out = formatUtcAndVietnamForLog(ms);
      expect(out).toContain('2025-01-15T03:00:00.000Z');
      expect(out).toContain('10:00:00');
    });

    it('luôn dùng timezone Asia/Ho_Chi_Minh (UTC+7) bất kể TZ system', () => {
      const d = new Date('2025-07-01T17:30:00Z');
      const out = formatUtcAndVietnamForLog(d);
      expect(out).toContain('00:30:00');
      expect(out).toContain('02/07/2025');
    });

    it('dùng định dạng 24h (không AM/PM)', () => {
      const d = new Date('2025-01-15T15:00:00Z');
      const out = formatUtcAndVietnamForLog(d);
      expect(out).toContain('22:00:00');
      expect(out.toUpperCase()).not.toContain('PM');
      expect(out.toUpperCase()).not.toContain('AM');
    });

    it('input null/undefined trả message lỗi', () => {
      expect(formatUtcAndVietnamForLog(null)).toBe('(thời điểm không hợp lệ)');
      expect(formatUtcAndVietnamForLog(undefined)).toBe('(thời điểm không hợp lệ)');
    });

    it('Date không hợp lệ → trả message lỗi', () => {
      expect(formatUtcAndVietnamForLog(new Date('xxx'))).toBe('(thời điểm không hợp lệ)');
      expect(formatUtcAndVietnamForLog('not-a-date')).toBe('(thời điểm không hợp lệ)');
      expect(formatUtcAndVietnamForLog(NaN)).toBe('(thời điểm không hợp lệ)');
    });

    it('không throw với input lạ', () => {
      expect(() => formatUtcAndVietnamForLog({})).not.toThrow();
      expect(() => formatUtcAndVietnamForLog([])).not.toThrow();
    });
  });

  describe('getVietnamWeekRange', () => {
    it('thứ Hai ngày 14/09/2026 trả về tuần trước 07/09 đến 14/09 (tuần 37)', () => {
      const range = getVietnamWeekRange('2026-09-14');
      expect(range.periodKey).toBe('2026-W37');
      expect(range.weekNumber).toBe(37);
      expect(range.startIso).toBe('2026-09-06T17:00:00.000Z'); // 2026-09-07T00:00:00+07:00
      expect(range.endIso).toBe('2026-09-13T17:00:00.000Z'); // 2026-09-14T00:00:00+07:00
      expect(range.label).toContain('Tuần 37');
      expect(range.label).toContain('07/09');
      expect(range.label).toContain('13/09');
    });

    it('giữa tuần (thứ Tư 16/09/2026) vẫn tính tuần trước là 07/09 đến 14/09', () => {
      const range = getVietnamWeekRange('2026-09-16');
      expect(range.periodKey).toBe('2026-W37');
      expect(range.startIso).toBe('2026-09-06T17:00:00.000Z');
      expect(range.endIso).toBe('2026-09-13T17:00:00.000Z');
    });

    it('ranh giới năm: tuần 1 tháng 1 năm 2026 (05/01/2026) trả về tuần 1 (29/12/2025 - 05/01/2026)', () => {
      // 2026-01-05 là thứ Hai đầu tiên của năm 2026.
      // Tuần trước đó: 29/12/2025 đến 05/01/2026.
      // Thứ Năm của tuần đó là 01/01/2026 -> theo ISO 8601, đây là tuần 1 năm 2026 (2026-W01).
      const range = getVietnamWeekRange('2026-01-05');
      expect(range.periodKey).toBe('2026-W01');
      expect(range.weekNumber).toBe(1);
      expect(range.startIso).toBe('2025-12-28T17:00:00.000Z');
      expect(range.endIso).toBe('2026-01-04T17:00:00.000Z');
    });

    it('ranh giới năm: ngày 01/01/2026 (thứ Năm) trả về tuần cuối năm 2025 (2025-W52)', () => {
      // 01/01/2026 thuộc tuần 1 năm 2026. Tuần trước nó là 22/12/2025 - 29/12/2025 (2025-W52).
      const range = getVietnamWeekRange('2026-01-01');
      expect(range.periodKey).toBe('2025-W52');
      expect(range.startIso).toBe('2025-12-21T17:00:00.000Z');
      expect(range.endIso).toBe('2025-12-28T17:00:00.000Z');
    });
  });

  describe('getVietnamMonthRange', () => {
    it('tháng 9/2026 trả về tháng 8/2026', () => {
      const range = getVietnamMonthRange('2026-09-14');
      expect(range.periodKey).toBe('2026-08');
      expect(range.label).toBe('Tháng 08/2026');
      expect(range.startIso).toBe('2026-07-31T17:00:00.000Z'); // 2026-08-01T00:00:00+07:00
      expect(range.endIso).toBe('2026-08-31T17:00:00.000Z'); // 2026-09-01T00:00:00+07:00
    });

    it('tháng 1/2026 trả về tháng 12/2025 (ranh giới năm)', () => {
      const range = getVietnamMonthRange('2026-01-15');
      expect(range.periodKey).toBe('2025-12');
      expect(range.label).toBe('Tháng 12/2025');
      expect(range.startIso).toBe('2025-11-30T17:00:00.000Z'); // 2025-12-01T00:00:00+07:00
      expect(range.endIso).toBe('2025-12-31T17:00:00.000Z'); // 2026-01-01T00:00:00+07:00
    });

    it('tháng 3/2026 trả về tháng 2/2026', () => {
      const range = getVietnamMonthRange('2026-03-01');
      expect(range.periodKey).toBe('2026-02');
      expect(range.label).toBe('Tháng 02/2026');
      expect(range.startIso).toBe('2026-01-31T17:00:00.000Z'); // 2026-02-01T00:00:00+07:00
      expect(range.endIso).toBe('2026-02-28T17:00:00.000Z'); // 2026-03-01T00:00:00+07:00
    });
  });
});
