import { describe, it, expect } from 'vitest';
import vi from '../../../../i18n/vi.js';
import en from '../../../../i18n/en.js';
import {
  PAYMENT_PURPOSES,
  PUBLIC_PAYMENT_KEYS,
  EDITOR_PAYMENT_PURPOSE_KEYS,
  resolvePaymentPurpose,
  publicPaymentKeys,
} from '../paymentPurpose.util';

const get = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

describe('paymentPurpose.util', () => {
  it('thiếu / lạ -> hold', () => {
    expect(resolvePaymentPurpose(undefined)).toBe('hold');
    expect(resolvePaymentPurpose(null)).toBe('hold');
    expect(resolvePaymentPurpose('abc')).toBe('hold');
    expect(resolvePaymentPurpose('order')).toBe('order');
    expect(resolvePaymentPurpose('deposit')).toBe('deposit');
    expect(publicPaymentKeys(undefined)).toBe(PUBLIC_PAYMENT_KEYS.hold);
  });

  it('bảng tra phủ đủ 3 purpose', () => {
    expect(Object.keys(PUBLIC_PAYMENT_KEYS)).toEqual(PAYMENT_PURPOSES);
    expect(Object.keys(EDITOR_PAYMENT_PURPOSE_KEYS)).toEqual(PAYMENT_PURPOSES);
  });

  it.each(PAYMENT_PURPOSES)('mọi khoá của purpose %s có đủ trong vi và en, placeholder khớp', (p) => {
    const all = [...Object.values(PUBLIC_PAYMENT_KEYS[p]), ...Object.values(EDITOR_PAYMENT_PURPOSE_KEYS[p])];
    for (const key of all) {
      const v = get(vi, key);
      const e = get(en, key);
      expect(typeof v, `vi thiếu ${key}`).toBe('string');
      expect(typeof e, `en thiếu ${key}`).toBe('string');
      expect(placeholders(e), `placeholder lệch ${key}`).toBe(placeholders(v));
    }
  });

  it('chữ hold giữ nguyên, order/deposit không còn chữ "giữ chỗ"', () => {
    expect(get(vi, PUBLIC_PAYMENT_KEYS.hold.requiredNotice)).toContain('giữ chỗ');
    for (const p of ['order', 'deposit']) {
      for (const key of Object.values(PUBLIC_PAYMENT_KEYS[p])) {
        expect(get(vi, key)).not.toMatch(/giữ chỗ/i);
      }
    }
  });
});
