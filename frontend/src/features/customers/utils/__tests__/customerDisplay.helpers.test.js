import { describe, it, expect } from 'vitest';
import {
  getCustomerDisplayName,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  decodeHtmlEntities,
} from '../customerDisplay.helpers';

describe('getCustomerDisplayName', () => {
  it('null/undefined → ""', () => {
    expect(getCustomerDisplayName(null)).toBe('');
    expect(getCustomerDisplayName(undefined)).toBe('');
  });

  it('có fullName → ưu tiên fullName', () => {
    expect(
      getCustomerDisplayName({ fullName: 'Nguyễn Văn A', firstName: 'X', email: 'a@x.com' })
    ).toBe('Nguyễn Văn A');
  });

  it('không có fullName → ghép firstName + lastName (trim)', () => {
    expect(getCustomerDisplayName({ firstName: 'Alice', lastName: 'Smith' })).toBe('Alice Smith');
    expect(getCustomerDisplayName({ firstName: 'Bob' })).toBe('Bob');
    expect(getCustomerDisplayName({ lastName: 'Last' })).toBe('Last');
  });

  it('không có tên → fallback email', () => {
    expect(getCustomerDisplayName({ email: 'a@x.com' })).toBe('a@x.com');
  });

  it('không có tên + email → fallback phone', () => {
    expect(getCustomerDisplayName({ phone: '0900000' })).toBe('0900000');
  });

  it('không có gì → ""', () => {
    expect(getCustomerDisplayName({})).toBe('');
  });
});

describe('formatDateOnly', () => {
  it('null/undefined/empty → "--"', () => {
    expect(formatDateOnly(null)).toBe('--');
    expect(formatDateOnly(undefined)).toBe('--');
    expect(formatDateOnly('')).toBe('--');
  });

  it('ISO date hợp lệ → dd/mm/yyyy theo giờ VN', () => {
    // 2026-03-15T00:00:00Z = 2026-03-15 07:00 ở Asia/Ho_Chi_Minh.
    expect(formatDateOnly('2026-03-15T00:00:00Z')).toBe('15/03/2026');
  });

  it('Date object hợp lệ', () => {
    expect(formatDateOnly(new Date('2026-01-31T05:00:00Z'))).toBe('31/01/2026');
  });

  it('chuỗi không hợp lệ → "--"', () => {
    expect(formatDateOnly('not-a-date')).toBe('--');
  });

  it('số timestamp hợp lệ', () => {
    // 2026-03-15T00:00:00Z = Date.parse() => 1773532800000
    expect(formatDateOnly(1773532800000)).toBe('15/03/2026');
  });
});

describe('formatDateTime', () => {
  it('null/empty → "--"', () => {
    expect(formatDateTime(null)).toBe('--');
    expect(formatDateTime('')).toBe('--');
  });

  it('hợp lệ → string toLocaleString vi-VN, hour12=false, GMT+7', () => {
    const out = formatDateTime('2026-03-15T03:30:00Z'); // = 10:30 ở VN
    // vi-VN format có thể là "15/3/2026" hoặc "15/03/2026" tuỳ Node/ICU version.
    expect(out).toMatch(/15\/0?3\/2026/);
    expect(out).toMatch(/10:30/);
  });

  it('không hợp lệ → "--"', () => {
    expect(formatDateTime('garbage')).toBe('--');
  });
});

describe('formatMoney', () => {
  it('VND mặc định: "1.000.000 ₫" (sep ngàn vi-VN)', () => {
    expect(formatMoney(1000000)).toBe('1.000.000 ₫');
    expect(formatMoney(0)).toBe('0 ₫');
  });

  it('null/undefined → 0 ₫', () => {
    expect(formatMoney(null)).toBe('0 ₫');
    expect(formatMoney(undefined)).toBe('0 ₫');
  });

  it('NaN → "--"', () => {
    expect(formatMoney('not-a-number')).toBe('--');
  });

  it('currency khác VND → đuôi currency string', () => {
    expect(formatMoney(50, 'USD')).toBe('50 USD');
  });

  it('số âm', () => {
    // Locale vi-VN có thể dùng "-1.000 ₫" hoặc "(1.000) ₫" tuỳ runtime → chỉ check chứa số.
    const out = formatMoney(-1000);
    expect(out).toMatch(/1\.000.*₫/);
  });
});

describe('decodeHtmlEntities', () => {
  it('decode entities cơ bản (&amp; &lt; &gt;)', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('&lt;b&gt;')).toBe('<b>');
  });

  it('chuỗi không có entity → trả nguyên', () => {
    expect(decodeHtmlEntities('plain text')).toBe('plain text');
  });

  it('null/undefined/empty → ""', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('numeric entity &#39; (apostrophe)', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
  });
});
