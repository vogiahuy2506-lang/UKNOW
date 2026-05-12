import { describe, it, expect } from '@jest/globals';
import { formatUtcAndVietnamForLog } from '../vnTimeFormat.util.js';

describe('vnTimeFormat.util', () => {
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
});
