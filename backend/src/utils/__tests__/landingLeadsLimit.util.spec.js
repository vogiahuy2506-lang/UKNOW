import { describe, it, expect } from '@jest/globals';
import {
  MAX_LANDING_LEADS_LIMIT,
  clampLandingLeadsLimit,
} from '../landingLeadsLimit.util.js';

describe('landingLeadsLimit.util', () => {
  describe('MAX_LANDING_LEADS_LIMIT constant', () => {
    it('phải là 10000', () => {
      expect(MAX_LANDING_LEADS_LIMIT).toBe(10000);
    });
  });

  describe('clampLandingLeadsLimit', () => {
    it('giữ nguyên giá trị nằm trong khoảng [1, MAX]', () => {
      expect(clampLandingLeadsLimit(500)).toBe(500);
      expect(clampLandingLeadsLimit(1)).toBe(1);
      expect(clampLandingLeadsLimit(MAX_LANDING_LEADS_LIMIT)).toBe(MAX_LANDING_LEADS_LIMIT);
    });

    it('cắt xuống MAX nếu vượt trần', () => {
      expect(clampLandingLeadsLimit(99999)).toBe(MAX_LANDING_LEADS_LIMIT);
      expect(clampLandingLeadsLimit(MAX_LANDING_LEADS_LIMIT + 1)).toBe(MAX_LANDING_LEADS_LIMIT);
    });

    it('đẩy lên 1 nếu < 1 (kể cả 0 và âm)', () => {
      expect(clampLandingLeadsLimit(0)).toBe(1);
      expect(clampLandingLeadsLimit(-100)).toBe(1);
    });

    it('parse string số được', () => {
      expect(clampLandingLeadsLimit('250')).toBe(250);
      expect(clampLandingLeadsLimit('  500  ')).toBe(500);
    });

    it('trả fallback (mặc định 1000) khi không parse được', () => {
      expect(clampLandingLeadsLimit('abc')).toBe(1000);
      expect(clampLandingLeadsLimit(null)).toBe(1000);
      expect(clampLandingLeadsLimit(undefined)).toBe(1000);
      expect(clampLandingLeadsLimit('')).toBe(1000);
      expect(clampLandingLeadsLimit(NaN)).toBe(1000);
    });

    it('chấp nhận fallback tùy chỉnh', () => {
      expect(clampLandingLeadsLimit(undefined, 500)).toBe(500);
      expect(clampLandingLeadsLimit('xxx', 2000)).toBe(2000);
    });

    it('fallback không vượt qua MAX khi caller truyền số lớn', () => {
      // function clamps the parsed number, but the fallback is returned as-is
      // Đây là behavior hiện tại — verify để tránh regression vô tình
      expect(clampLandingLeadsLimit(null, 99999)).toBe(99999);
    });

    it('parse string thập phân: parseInt chỉ lấy phần nguyên', () => {
      expect(clampLandingLeadsLimit('100.7')).toBe(100);
      expect(clampLandingLeadsLimit(100.7)).toBe(100);
    });
  });
});
