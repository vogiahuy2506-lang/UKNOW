import { describe, it, expect } from '@jest/globals';
import {
  normalizeFormFields,
  normalizeFormSettings,
  normalizeBookingConfig,
  normalizePaymentConfig,
  ALLOWED_FIELD_TYPES,
  ALLOWED_ROLES,
  MAX_FIELDS,
} from '../formDefinition.util.js';

describe('formDefinition.util', () => {
  it('trả về mảng rỗng khi input là null hoặc undefined', () => {
    expect(normalizeFormFields(null)).toEqual([]);
    expect(normalizeFormFields(undefined)).toEqual([]);
  });

  it('ném lỗi 400 nếu fields không phải là mảng', () => {
    expect(() => normalizeFormFields('not-an-array')).toThrow('Danh sách trường của biểu mẫu phải là một mảng');
  });

  it(`ném lỗi 400 nếu số trường vượt quá ${MAX_FIELDS}`, () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
      type: 'short_text',
      label: `Field ${i + 1}`,
    }));
    expect(() => normalizeFormFields(fields)).toThrow(`Biểu mẫu không được vượt quá ${MAX_FIELDS} trường`);
  });

  it('ném lỗi nếu kiểu trường không nằm trong 9 kiểu cho phép', () => {
    expect(() =>
      normalizeFormFields([
        { type: 'file_upload', label: 'Tệp đính kèm' },
      ])
    ).toThrow('Kiểu trường "file_upload" không được hỗ trợ');
  });

  it('hỗ trợ đủ 9 kiểu trường hợp lệ', () => {
    expect(ALLOWED_FIELD_TYPES.length).toBe(9);
    const validFields = [
      { type: 'short_text', label: 'Họ tên' },
      { type: 'long_text', label: 'Ghi chú' },
      { type: 'email', label: 'Email' },
      { type: 'phone', label: 'Số điện thoại' },
      { type: 'number', label: 'Tuổi' },
      { type: 'select', label: 'Thành phố', options: ['Hà Nội', 'TP.HCM'] },
      { type: 'radio', label: 'Giới tính', options: ['Nam', 'Nữ'] },
      { type: 'checkbox', label: 'Sở thích', options: ['Đọc sách', 'Du lịch'] },
      { type: 'date', label: 'Ngày sinh' },
    ];
    const normalized = normalizeFormFields(validFields);
    expect(normalized).toHaveLength(9);
    normalized.forEach((f) => {
      expect(f.key).toMatch(/^f_[a-f0-9]{8}$/);
    });
  });

  it('giữ nguyên key cũ nếu hợp lệ, và tự sinh key mới nếu thiếu hoặc không hợp lệ', () => {
    const fields = [
      { key: 'custom_name_1', type: 'short_text', label: 'Họ tên' },
      { key: 'invalid-key!', type: 'email', label: 'Email' },
      { type: 'phone', label: 'SĐT' },
    ];
    const normalized = normalizeFormFields(fields);
    expect(normalized[0].key).toBe('custom_name_1');
    expect(normalized[1].key).toMatch(/^f_[a-f0-9]{8}$/);
    expect(normalized[2].key).toMatch(/^f_[a-f0-9]{8}$/);
  });

  it('key trùng khoá cố định của item chiến dịch (email/phone/id/...) -> không nhận, tự sinh khoá khác thay vì báo lỗi', () => {
    // PR-6a review 14/09: field.key literal "email" (hoặc bất kỳ khoá nào trong
    // RESERVED_CAMPAIGN_ITEM_FIELD_KEYS, không phân biệt hoa thường) sẽ ghi đè item.email đã
    // chuẩn hoá trong formCampaignItem.util.js mapFormSubmissionToCampaignItem — chặn ngay từ lúc
    // lưu form, không báo lỗi vì trình soạn không bao giờ tự gửi các khoá này.
    const fields = [
      { key: 'email', type: 'short_text', label: 'Email tự khai' },
      { key: 'PHONE', type: 'short_text', label: 'SĐT hoa (không phân biệt hoa thường)' },
      { key: 'custom_ok_key', type: 'short_text', label: 'Trường hợp lệ' },
    ];
    const normalized = normalizeFormFields(fields);
    expect(normalized[0].key).not.toBe('email');
    expect(normalized[0].key).toMatch(/^f_[a-f0-9]{8}$/);
    expect(normalized[1].key).not.toBe('PHONE');
    expect(normalized[1].key).toMatch(/^f_[a-f0-9]{8}$/);
    // Trường hợp lệ không bị ảnh hưởng
    expect(normalized[2].key).toBe('custom_ok_key');
  });

  it('ném lỗi nếu nhãn rỗng hoặc vượt quá 200 ký tự', () => {
    expect(() =>
      normalizeFormFields([{ type: 'short_text', label: '   ' }])
    ).toThrow('Nhãn trường thứ 1 không được để trống');

    const longLabel = 'a'.repeat(201);
    expect(() =>
      normalizeFormFields([{ type: 'short_text', label: longLabel }])
    ).toThrow('vượt quá 200 ký tự');
  });

  it('ném lỗi nếu trùng vai trò (role)', () => {
    expect(() =>
      normalizeFormFields([
        { type: 'email', label: 'Email 1', role: 'email' },
        { type: 'email', label: 'Email 2', role: 'email' },
      ])
    ).toThrow('Mỗi vai trò (email) chỉ được gán cho tối đa 1 trường');
  });

  it('chỉ chấp nhận các role hợp lệ (name, email, phone)', () => {
    const fields = [
      { type: 'short_text', label: 'Tên', role: 'name' },
      { type: 'short_text', label: 'Vai trò lạ', role: 'admin_hack' },
    ];
    const normalized = normalizeFormFields(fields);
    expect(normalized[0].role).toBe('name');
    expect(normalized[1].role).toBeNull();
  });

  it('xác thực danh sách options cho select, radio, checkbox', () => {
    expect(() =>
      normalizeFormFields([{ type: 'select', label: 'Dịch vụ', options: [] }])
    ).toThrow('phải có ít nhất 1 lựa chọn');

    expect(() =>
      normalizeFormFields([
        {
          type: 'radio',
          label: 'Lựa chọn',
          options: ['A', 'A'],
        },
      ])
    ).toThrow('bị trùng lặp');

    const normalized = normalizeFormFields([
      {
        type: 'select',
        label: 'Dịch vụ',
        options: [
          'Gói cơ bản',
          { label: 'Gói nâng cao', value: 'advanced' },
        ],
      },
    ]);
    expect(normalized[0].options).toEqual([
      { label: 'Gói cơ bản', value: 'Gói cơ bản' },
      { label: 'Gói nâng cao', value: 'advanced' },
    ]);
  });
});

describe('formDefinition.util - normalizeFormSettings', () => {
  it('trả về settings mặc định khi input là null hoặc undefined', () => {
    const sNull = normalizeFormSettings(null);
    expect(sNull.notifyOwner).toBe(false);
    expect(sNull.consentEnabled).toBe(false);
    expect(sNull.sendConfirmation).toBe(false);
    expect(sNull.submitButtonText).toBe('Gửi thông tin');
    expect(sNull.redirectUrl).toBeNull();

    const sUndef = normalizeFormSettings(undefined);
    expect(sUndef.notifyOwner).toBe(false);
  });

  it('loại bỏ các khoá lạ (hack: 1) và giữ đúng các khoá hợp lệ', () => {
    const s = normalizeFormSettings({
      notifyOwner: true,
      consentEnabled: true,
      hack: 1,
      extra_prop: 'malicious',
    });
    expect(s.notifyOwner).toBe(true);
    expect(s.consentEnabled).toBe(true);
    expect(s.hack).toBeUndefined();
    expect(s.extra_prop).toBeUndefined();
  });

  it('ném lỗi 400 nếu sai kiểu dữ liệu boolean', () => {
    expect(() => normalizeFormSettings({ notifyOwner: 'true' })).toThrow('notifyOwner phải là giá trị boolean');
    expect(() => normalizeFormSettings({ consentEnabled: 1 })).toThrow('consentEnabled phải là giá trị boolean');
    expect(() => normalizeFormSettings({ sendConfirmation: 'yes' })).toThrow('sendConfirmation phải là giá trị boolean');
  });

  it('ném lỗi 400 nếu submitButtonText > 50 hoặc successMessage > 500', () => {
    expect(() => normalizeFormSettings({ submitButtonText: 'a'.repeat(51) })).toThrow('Nút gửi không được vượt quá 50 ký tự');
    expect(() => normalizeFormSettings({ successMessage: 'b'.repeat(501) })).toThrow('Thông báo thành công không được vượt quá 500 ký tự');
  });

  it('kiểm tra protocol của redirectUrl: chỉ chấp nhận http:// và https://', () => {
    expect(() => normalizeFormSettings({ redirectUrl: 'javascript:alert(1)' })).toThrow('chỉ chấp nhận giao thức http:// hoặc https://');
    expect(() => normalizeFormSettings({ redirectUrl: 'data:text/html,<script>alert(1)</script>' })).toThrow('chỉ chấp nhận giao thức http:// hoặc https://');
    expect(() => normalizeFormSettings({ redirectUrl: 'ftp://ftp.example.com' })).toThrow('chỉ chấp nhận giao thức http:// hoặc https://');

    const validHttps = normalizeFormSettings({ redirectUrl: 'https://example.com/cam-on' });
    expect(validHttps.redirectUrl).toBe('https://example.com/cam-on');

    const validHttp = normalizeFormSettings({ redirectUrl: 'http://example.com/thanks' });
    expect(validHttp.redirectUrl).toBe('http://example.com/thanks');
  });
});

describe('normalizeBookingConfig', () => {
  it('null/undefined/{enabled:false} → null (tắt đặt lịch)', () => {
    expect(normalizeBookingConfig(null)).toBeNull();
    expect(normalizeBookingConfig(undefined)).toBeNull();
    expect(normalizeBookingConfig({ enabled: false })).toBeNull();
    expect(normalizeBookingConfig({ enabled: false, weeklySlots: { 1: ['09:00'] } })).toBeNull();
  });

  it('enabled:true nhưng không có khung giờ nào → 400', () => {
    expect(() => normalizeBookingConfig({ enabled: true })).toThrow('ít nhất 1 khung giờ');
    expect(() => normalizeBookingConfig({ enabled: true, weeklySlots: { 1: [] } })).toThrow('ít nhất 1 khung giờ');
  });

  it('giờ dạng "25:00" → 400', () => {
    expect(() => normalizeBookingConfig({ enabled: true, weeklySlots: { 1: ['25:00'] } })).toThrow('không hợp lệ');
  });

  it('giờ trùng trong cùng một ngày → 400', () => {
    expect(() => normalizeBookingConfig({ enabled: true, weeklySlots: { 1: ['09:00', '09:00'] } })).toThrow('trùng lặp');
  });

  it('quá 48 khung/ngày → 400', () => {
    const many = Array.from({ length: 49 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);
    expect(() => normalizeBookingConfig({ enabled: true, weeklySlots: { 1: many } })).toThrow('quá 48 khung giờ');
  });

  it('xếp giờ tăng dần dù input không theo thứ tự', () => {
    const config = normalizeBookingConfig({ enabled: true, weeklySlots: { 1: ['10:00', '09:00', '11:30'] } });
    expect(config.weeklySlots['1']).toEqual(['09:00', '10:00', '11:30']);
  });

  it('khoá lạ trong weeklySlots (vd "7") bị bỏ, chỉ giữ "0".."6"', () => {
    const config = normalizeBookingConfig({ enabled: true, weeklySlots: { 1: ['09:00'], 7: ['10:00'], monday: ['11:00'] } });
    expect(Object.keys(config.weeklySlots).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(config.weeklySlots['1']).toEqual(['09:00']);
  });

  it('slotCapacity: 0 → 400; null → không giới hạn; số nguyên 1-1000 hợp lệ', () => {
    const base = { enabled: true, weeklySlots: { 1: ['09:00'] } };
    expect(() => normalizeBookingConfig({ ...base, slotCapacity: 0 })).toThrow('slotCapacity');
    expect(() => normalizeBookingConfig({ ...base, slotCapacity: 1001 })).toThrow('slotCapacity');
    expect(() => normalizeBookingConfig({ ...base, slotCapacity: 1.5 })).toThrow('slotCapacity');
    expect(normalizeBookingConfig({ ...base, slotCapacity: null }).slotCapacity).toBeNull();
    expect(normalizeBookingConfig({ ...base, slotCapacity: 5 }).slotCapacity).toBe(5);
  });

  it('daysAhead mặc định 30, phải trong 1-180', () => {
    const base = { enabled: true, weeklySlots: { 1: ['09:00'] } };
    expect(normalizeBookingConfig(base).daysAhead).toBe(30);
    expect(() => normalizeBookingConfig({ ...base, daysAhead: 0 })).toThrow('daysAhead');
    expect(() => normalizeBookingConfig({ ...base, daysAhead: 181 })).toThrow('daysAhead');
    expect(normalizeBookingConfig({ ...base, daysAhead: 180 }).daysAhead).toBe(180);
  });

  it('minNoticeMinutes mặc định 60, phải trong 0-10080', () => {
    const base = { enabled: true, weeklySlots: { 1: ['09:00'] } };
    expect(normalizeBookingConfig(base).minNoticeMinutes).toBe(60);
    expect(normalizeBookingConfig({ ...base, minNoticeMinutes: 0 }).minNoticeMinutes).toBe(0);
    expect(() => normalizeBookingConfig({ ...base, minNoticeMinutes: -1 })).toThrow('minNoticeMinutes');
    expect(() => normalizeBookingConfig({ ...base, minNoticeMinutes: 10081 })).toThrow('minNoticeMinutes');
  });

  it('closedDates: ngày phi lịch (2026-02-31) → 400', () => {
    const base = { enabled: true, weeklySlots: { 1: ['09:00'] } };
    expect(() => normalizeBookingConfig({ ...base, closedDates: ['2026-02-31'] })).toThrow('không hợp lệ');
  });

  it('closedDates: trùng ngày → 400; quá 366 ngày → 400', () => {
    const base = { enabled: true, weeklySlots: { 1: ['09:00'] } };
    expect(() => normalizeBookingConfig({ ...base, closedDates: ['2026-01-01', '2026-01-01'] })).toThrow('trùng lặp');
    const distinctMany = Array.from({ length: 367 }, (_, i) => {
      const day = new Date(Date.UTC(2027, 0, 1 + i));
      return day.toISOString().slice(0, 10);
    });
    expect(() => normalizeBookingConfig({ ...base, closedDates: distinctMany })).toThrow('366');
  });

  it('cấu hình hợp lệ đầy đủ → trả đúng shape', () => {
    const config = normalizeBookingConfig({
      enabled: true,
      weeklySlots: { 0: [], 1: ['09:00', '10:00'], 2: ['14:00'] },
      slotCapacity: 3,
      daysAhead: 14,
      minNoticeMinutes: 30,
      closedDates: ['2026-12-25'],
    });
    expect(config).toEqual({
      enabled: true,
      weeklySlots: {
        '0': [], '1': ['09:00', '10:00'], '2': ['14:00'], '3': [], '4': [], '5': [], '6': [],
      },
      slotCapacity: 3,
      daysAhead: 14,
      minNoticeMinutes: 30,
      closedDates: ['2026-12-25'],
    });
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3a mục 1.
 */
describe('normalizePaymentConfig', () => {
  const validRaw = {
    enabled: true,
    method: 'bank',
    amount: 150000,
    bankBin: '970422',
    accountNumber: '0123456789',
    accountName: 'nguyễn văn a',
    holdMinutes: 45,
  };

  it('null/undefined/{enabled:false} -> null (tắt thu tiền)', () => {
    expect(normalizePaymentConfig(null)).toBeNull();
    expect(normalizePaymentConfig(undefined)).toBeNull();
    expect(normalizePaymentConfig({ enabled: false })).toBeNull();
  });

  it('cấu hình hợp lệ -> chuẩn hoá đúng, accountName bỏ dấu + IN HOA + gộp khoảng trắng', () => {
    const config = normalizePaymentConfig(validRaw);
    expect(config).toEqual({
      enabled: true,
      method: 'bank',
      amount: 150000,
      bankBin: '970422',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
      holdMinutes: 45,
    });
  });

  it('accountName "  Trịnh   Đức   Phúc  " -> "TRINH DUC PHUC" (Đ/đ không tự decompose qua NFD)', () => {
    const config = normalizePaymentConfig({ ...validRaw, accountName: '  Trịnh   Đức   Phúc  ' });
    expect(config.accountName).toBe('TRINH DUC PHUC');
  });

  it('không truyền holdMinutes -> mặc định 30', () => {
    const { holdMinutes, ...rest } = validRaw;
    const config = normalizePaymentConfig(rest);
    expect(config.holdMinutes).toBe(30);
  });

  it('method khác "bank" (vd momo_image) -> 400 "chưa được hỗ trợ"', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, method: 'momo_image' }))
      .toThrow(/chưa được hỗ trợ/i);
  });

  it('amount ngoài khoảng 1.000-100.000.000 -> lỗi', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, amount: 999 })).toThrow(/Số tiền/);
    expect(() => normalizePaymentConfig({ ...validRaw, amount: 100000001 })).toThrow(/Số tiền/);
    expect(() => normalizePaymentConfig({ ...validRaw, amount: 1500.5 })).toThrow(/Số tiền/);
  });

  it('bankBin không thuộc danh sách BIN backend -> lỗi', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, bankBin: '999999' })).toThrow(/Ngân hàng/);
  });

  it('accountNumber không đúng 6-19 chữ số -> lỗi', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, accountNumber: '12345' })).toThrow(/Số tài khoản/);
    expect(() => normalizePaymentConfig({ ...validRaw, accountNumber: '12345678901234567890' })).toThrow(/Số tài khoản/);
    expect(() => normalizePaymentConfig({ ...validRaw, accountNumber: '123abc789' })).toThrow(/Số tài khoản/);
  });

  it('accountName rỗng sau khi chuẩn hoá -> lỗi', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, accountName: '' })).toThrow(/Tên chủ tài khoản/);
    expect(() => normalizePaymentConfig({ ...validRaw, accountName: '!!!' })).toThrow(/Tên chủ tài khoản/);
  });

  it('holdMinutes ngoài khoảng 10-120 -> lỗi', () => {
    expect(() => normalizePaymentConfig({ ...validRaw, holdMinutes: 5 })).toThrow(/holdMinutes/);
    expect(() => normalizePaymentConfig({ ...validRaw, holdMinutes: 121 })).toThrow(/holdMinutes/);
  });
});
