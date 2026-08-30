import { describe, expect, it, jest } from '@jest/globals';
import { toZcaCookieShape } from '../../utils/zaloSessionRestore.util.js';
import zaloSettingsController from '../zaloSettings.controller.js';

describe('PR-3: Zalo cookie normalization & retry failure counter', () => {
  describe('toZcaCookieShape utility', () => {
    it('trả về array hợp lệ khi input là JSON string array', () => {
      const input = JSON.stringify([{ name: 'zpw_sek', value: '123' }]);
      const res = toZcaCookieShape(input);
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].name).toBe('zpw_sek');
    });

    it('trả về array khi input là object có thuộc tính cookie', () => {
      const input = { cookie: [{ name: 'zpw_sek', value: 'abc' }] };
      const res = toZcaCookieShape(input);
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].value).toBe('abc');
    });

    it('trả về object { cookies: [...] } khi input có thuộc tính cookies', () => {
      const input = { cookies: [{ name: 'zpw_sek', value: 'xyz' }] };
      const res = toZcaCookieShape(input);
      expect(res).toEqual({ cookies: [{ name: 'zpw_sek', value: 'xyz' }] });
    });

    it('trả về null cho dữ liệu rỗng, string không phải JSON hoặc object không có mảng cookies', () => {
      expect(toZcaCookieShape(null)).toBeNull();
      expect(toZcaCookieShape('')).toBeNull();
      expect(toZcaCookieShape('not a json')).toBeNull();
      expect(toZcaCookieShape({})).toBeNull();
      expect(toZcaCookieShape({ cookie: 'not an array' })).toBeNull();
    });
  });

  describe('normalizeLoginCredentials', () => {
    it('chuẩn hóa credentials và reject cookie hỏng format', () => {
      expect(zaloSettingsController.normalizeLoginCredentials(null)).toBeNull();
      expect(zaloSettingsController.normalizeLoginCredentials({ cookie: 'invalid' })).toBeNull();
      expect(zaloSettingsController.normalizeLoginCredentials({ cookie: [] })).toBeNull();

      const validPayload = {
        cookie: [{ name: 'zpw_sek', value: 'test' }],
        userAgent: 'Custom-UA',
      };
      const normalized = zaloSettingsController.normalizeLoginCredentials(validPayload);
      expect(normalized).not.toBeNull();
      expect(normalized.userAgent).toBe('Custom-UA');
      expect(Array.isArray(normalized.cookie)).toBe(true);
    });
  });
});
