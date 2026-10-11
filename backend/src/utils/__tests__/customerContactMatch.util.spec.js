import { describe, it, expect } from '@jest/globals';
import {
  normalizeContactEmail,
  normalizeContactPhoneKey,
  createCustomerContactIndex,
  findExistingCustomerByContact,
  collectContactLookupKeys,
  CUSTOMER_EMAIL_KEY_SQL,
  CUSTOMER_PHONE_KEY_SQL,
} from '../customerContactMatch.util.js';

describe('normalizeContactEmail', () => {
  it('trim + chữ thường; rỗng -> null', () => {
    expect(normalizeContactEmail('  Abc@Mail.COM ')).toBe('abc@mail.com');
    expect(normalizeContactEmail('   ')).toBeNull();
    expect(normalizeContactEmail(null)).toBeNull();
    expect(normalizeContactEmail(undefined)).toBeNull();
  });
});

describe('normalizeContactPhoneKey (9 số cuối)', () => {
  it.each([
    ['0912345678', '912345678'],
    ['84912345678', '912345678'],
    ['+84 912 345 678', '912345678'],
    ['(091) 234-5678', '912345678'],
    ['912345678', '912345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeContactPhoneKey(input)).toBe(expected);
  });

  it('không có chữ số -> null; số ngắn giữ nguyên chữ số', () => {
    expect(normalizeContactPhoneKey('abc')).toBeNull();
    expect(normalizeContactPhoneKey('')).toBeNull();
    expect(normalizeContactPhoneKey(null)).toBeNull();
    expect(normalizeContactPhoneKey('0911')).toBe('0911');
  });
});

describe('createCustomerContactIndex + findExistingCustomerByContact', () => {
  const row = (id, email, phone, zalo_id = null) => ({ id, email, phone, zalo_id });

  it('email khác hoa/thường vẫn khớp cùng một khách (đường bulk cũ so chính xác nên tạo trùng)', () => {
    const index = createCustomerContactIndex();
    index.add(row(1, 'khach@mail.com', null));
    expect(findExistingCustomerByContact(index, { email: 'KHACH@Mail.COM' })?.id).toBe(1);
  });

  it('SĐT khác định dạng (0912…, +84 912…) khớp cùng một khách', () => {
    const index = createCustomerContactIndex();
    index.add(row(2, null, '0912345678'));
    expect(findExistingCustomerByContact(index, { phone: '+84912345678' })?.id).toBe(2);
    expect(findExistingCustomerByContact(index, { phone: '84 912 345 678' })?.id).toBe(2);
    expect(findExistingCustomerByContact(index, { phone: '0912345679' })).toBeNull();
  });

  it('ưu tiên cặp email+SĐT khớp > email > SĐT', () => {
    const index = createCustomerContactIndex();
    index.add(row(10, 'a@x.com', '0900000001'));
    index.add(row(11, 'a@x.com', '0900000002'));
    index.add(row(12, 'b@x.com', '0900000003'));
    // cặp khớp đúng dòng 11 dù dòng 10 đến trước và cùng email
    expect(findExistingCustomerByContact(index, { email: 'a@x.com', phone: '0900000002' })?.id).toBe(11);
    // email khớp, SĐT lạ -> theo email (dòng đầu tiên thêm vào)
    expect(findExistingCustomerByContact(index, { email: 'a@x.com', phone: '0911111111' })?.id).toBe(10);
    // email lạ, SĐT khớp -> theo SĐT
    expect(findExistingCustomerByContact(index, { email: 'zzz@x.com', phone: '0900000003' })?.id).toBe(12);
  });

  it('mỗi khoá giữ dòng ĐẦU TIÊN được thêm (nạp ORDER BY id thì id nhỏ nhất thắng)', () => {
    const index = createCustomerContactIndex();
    index.add(row(5, 'dup@x.com', null));
    index.add(row(6, 'dup@x.com', null));
    expect(findExistingCustomerByContact(index, { email: 'dup@x.com' })?.id).toBe(5);
  });

  it('zaloId chỉ dùng khi dòng không có email lẫn SĐT', () => {
    const index = createCustomerContactIndex();
    index.add(row(20, null, null, 'zalo-1'));
    expect(findExistingCustomerByContact(index, { zaloId: 'zalo-1' })?.id).toBe(20);
    expect(findExistingCustomerByContact(index, { email: 'x@y.com', zaloId: 'zalo-1' })).toBeNull();
  });

  it('remove() gỡ khoá cũ, add() lại theo khoá mới (dùng sau khi UPDATE đổi email/SĐT)', () => {
    const index = createCustomerContactIndex();
    const r = row(30, 'old@x.com', '0900000009');
    index.add(r);
    index.remove(r);
    expect(findExistingCustomerByContact(index, { email: 'old@x.com' })).toBeNull();
    expect(findExistingCustomerByContact(index, { phone: '0900000009' })).toBeNull();
    r.email = 'new@x.com';
    index.add(r);
    expect(findExistingCustomerByContact(index, { email: 'NEW@x.com' })?.id).toBe(30);
  });
});

describe('collectContactLookupKeys', () => {
  it('gom khoá email chữ thường + 9 số cuối SĐT, zaloId chỉ cho dòng không có email/SĐT, bỏ trùng', () => {
    const keys = collectContactLookupKeys([
      { email: 'A@x.com', phone: '0912345678' },
      { email: 'a@X.com', phone: '+84912345678' },
      { zaloId: 'z1' },
      { email: 'b@x.com', zaloId: 'z-bo-qua' },
      {},
    ]);
    expect(keys.emailKeys.sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(keys.phoneKeys).toEqual(['912345678']);
    expect(keys.zaloIds).toEqual(['z1']);
  });
});

describe('biểu thức SQL khớp index migration 296', () => {
  it('giữ nguyên chuỗi — đổi chữ nào là index mất tác dụng (xem migration 296)', () => {
    expect(CUSTOMER_EMAIL_KEY_SQL).toBe('LOWER(email)');
    expect(CUSTOMER_PHONE_KEY_SQL).toBe("RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9)");
  });
});
