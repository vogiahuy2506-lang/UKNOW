import { describe, it, expect } from '@jest/globals';
import {
  BULK_MAX_ITEMS,
  BULK_ALLOWED_CONSENT_SOURCES,
  isValidContactEmail,
  isValidContactPhone,
  validateBulkItemFields,
} from '../customerBulkInput.util.js';

describe('trần dòng và whitelist consentSource', () => {
  it('trần 2.000 dòng, consentSource chỉ manual/import', () => {
    expect(BULK_MAX_ITEMS).toBe(2000);
    expect(BULK_ALLOWED_CONSENT_SOURCES).toEqual(['manual', 'import']);
  });
});

describe('isValidContactEmail', () => {
  it.each(['a@u.local', 'nguyen.van@mail.co', 'x+tag@sub.domain.vn'])('hợp lệ: %s', (email) => {
    expect(isValidContactEmail(email)).toBe(true);
  });
  it.each(['abc', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com', `${'a'.repeat(250)}@x.com`])('không hợp lệ: %s', (email) => {
    expect(isValidContactEmail(email)).toBe(false);
  });
});

describe('isValidContactPhone', () => {
  it.each(['0912345678', '84912345678', '+84912345678', '912345678', '+1 415 555 2671', '0900 000 003'])('hợp lệ: %s', (phone) => {
    expect(isValidContactPhone(phone)).toBe(true);
  });
  it.each(['0911', 'abc', '12345', '0', '+', '123456789012345678'])('không hợp lệ: %s', (phone) => {
    expect(isValidContactPhone(phone)).toBe(false);
  });
});

describe('validateBulkItemFields', () => {
  const ok = { email: 'a@u.local', phone: '0912345678', fullName: 'A' };

  it('dòng đúng -> không lỗi', () => {
    expect(validateBulkItemFields(ok, undefined)).toEqual([]);
  });

  it('email sai và SĐT sai -> hai lỗi, đúng tên trường', () => {
    const errors = validateBulkItemFields({ email: 'khong-phai-email', phone: 'abc' }, undefined);
    expect(errors.map((e) => e.field).sort()).toEqual(['email', 'phone']);
  });

  it('chuỗi vượt cột VARCHAR(255) -> lỗi (thay vì nổ INSERT cả lô)', () => {
    const errors = validateBulkItemFields({ ...ok, fullName: 'x'.repeat(256) }, undefined);
    expect(errors).toEqual([{ field: 'fullName', message: 'Tối đa 255 ký tự' }]);
  });

  it('consentSource tự khai ngoài whitelist -> lỗi; manual/import (không phân biệt hoa thường) -> ổn', () => {
    expect(validateBulkItemFields(ok, 'landing_lead').map((e) => e.field)).toEqual(['consentSource']);
    expect(validateBulkItemFields(ok, 'form_submission').map((e) => e.field)).toEqual(['consentSource']);
    expect(validateBulkItemFields(ok, 'Import')).toEqual([]);
    expect(validateBulkItemFields(ok, 'manual')).toEqual([]);
    expect(validateBulkItemFields(ok, '')).toEqual([]);
    expect(validateBulkItemFields(ok, null)).toEqual([]);
  });
});
