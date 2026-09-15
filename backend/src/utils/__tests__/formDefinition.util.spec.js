import { describe, it, expect } from '@jest/globals';
import {
  normalizeFormFields,
  normalizeFormSettings,
  normalizeBookingConfig,
  normalizePaymentConfig,
  normalizeFormTheme,
  buildFormAssetKeyRegex,
  ALLOWED_FIELD_TYPES,
  ALLOWED_ROLES,
  ALLOWED_FORM_FONTS,
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

describe('normalizeFormTheme (PR-4a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md)', () => {
  const OWNER_ID = 42;
  const ctx = { workspaceOwnerId: OWNER_ID };

  it('null/undefined -> {} (giữ giao diện hiện tại)', () => {
    expect(normalizeFormTheme(null, ctx)).toEqual({});
    expect(normalizeFormTheme(undefined, ctx)).toEqual({});
  });

  it('{} -> {} (không tự điền mặc định cho khoá nào)', () => {
    expect(normalizeFormTheme({}, ctx)).toEqual({});
  });

  it('không phải object (mảng/chuỗi) -> lỗi', () => {
    expect(() => normalizeFormTheme('not-an-object', ctx)).toThrow(/theme/i);
    expect(() => normalizeFormTheme(['a'], ctx)).toThrow(/theme/i);
  });

  it('khoá lạ bị bỏ (whitelist) — { hack: 1, primaryColor: "#112233" } -> chỉ giữ primaryColor', () => {
    const theme = normalizeFormTheme({ hack: 1, primaryColor: '#112233' }, ctx);
    expect(theme).toEqual({ primaryColor: '#112233' });
  });

  it('primaryColor "red;background:url(x)" -> 400 INVALID_FORM_THEME', () => {
    expect(() => normalizeFormTheme({ primaryColor: 'red;background:url(x)' }, ctx)).toThrow(/primaryColor/);
    try {
      normalizeFormTheme({ primaryColor: 'red;background:url(x)' }, ctx);
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_FORM_THEME');
    }
  });

  it('backgroundColor không đúng dạng hex #RRGGBB -> lỗi', () => {
    expect(() => normalizeFormTheme({ backgroundColor: '#fff' }, ctx)).toThrow(/backgroundColor/);
    expect(() => normalizeFormTheme({ backgroundColor: 'white' }, ctx)).toThrow(/backgroundColor/);
  });

  it('primaryColor/backgroundColor hex hợp lệ (hoa lẫn thường) -> giữ nguyên chuỗi gốc', () => {
    expect(normalizeFormTheme({ primaryColor: '#AbC123' }, ctx).primaryColor).toBe('#AbC123');
  });

  it('fontFamily "Comic Sans MS" (ngoài whitelist) -> 400', () => {
    expect(() => normalizeFormTheme({ fontFamily: 'Comic Sans MS' }, ctx)).toThrow(/fontFamily/);
  });

  it('cả 8 font trong ALLOWED_FORM_FONTS đều hợp lệ', () => {
    expect(ALLOWED_FORM_FONTS).toHaveLength(8);
    for (const font of ALLOWED_FORM_FONTS) {
      expect(normalizeFormTheme({ fontFamily: font }, ctx)).toEqual({ fontFamily: font });
    }
  });

  it('layout phải là "card" hoặc "wide", khác thì lỗi', () => {
    expect(normalizeFormTheme({ layout: 'card' }, ctx)).toEqual({ layout: 'card' });
    expect(normalizeFormTheme({ layout: 'wide' }, ctx)).toEqual({ layout: 'wide' });
    expect(() => normalizeFormTheme({ layout: 'full' }, ctx)).toThrow(/layout/);
  });

  it('bannerHeight phải là "sm"/"md"/"lg", khác thì lỗi, KHÔNG tự mặc định "md" khi vắng mặt', () => {
    expect(normalizeFormTheme({ bannerHeight: 'sm' }, ctx)).toEqual({ bannerHeight: 'sm' });
    expect(normalizeFormTheme({ bannerHeight: 'lg' }, ctx)).toEqual({ bannerHeight: 'lg' });
    expect(() => normalizeFormTheme({ bannerHeight: 'xl' }, ctx)).toThrow(/bannerHeight/);
    expect(normalizeFormTheme({ primaryColor: '#112233' }, ctx)).not.toHaveProperty('bannerHeight');
  });

  it('preset: chỉ a-z0-9_- tối đa 32 ký tự, khác thì lỗi', () => {
    expect(normalizeFormTheme({ preset: 'sunset-01' }, ctx)).toEqual({ preset: 'sunset-01' });
    expect(() => normalizeFormTheme({ preset: 'Sunset 01' }, ctx)).toThrow(/preset/);
    expect(() => normalizeFormTheme({ preset: 'a'.repeat(33) }, ctx)).toThrow(/preset/);
  });

  describe('bannerKey/logoKey — định dạng (lớp kiểm thuần, không đụng DB)', () => {
    it('bannerKey null -> giữ null trong kết quả (tín hiệu "gỡ ảnh")', () => {
      expect(normalizeFormTheme({ bannerKey: null }, ctx)).toEqual({ bannerKey: null });
    });

    it('bannerKey đúng dạng uploads/<workspaceOwnerId>/forms/<tên>.<ext> -> giữ nguyên', () => {
      const key = `uploads/${OWNER_ID}/forms/123_abcd1234_banner.png`;
      expect(normalizeFormTheme({ bannerKey: key }, ctx)).toEqual({ bannerKey: key });
    });

    it('bannerKey đuôi .jpg/.jpeg/.webp (hoa hoặc thường) đều hợp lệ', () => {
      for (const ext of ['jpg', 'JPG', 'jpeg', 'webp', 'PNG']) {
        const key = `uploads/${OWNER_ID}/forms/x.${ext}`;
        expect(normalizeFormTheme({ bannerKey: key }, ctx).bannerKey).toBe(key);
      }
    });

    it('bannerKey là URL ngoài (https://evil.example/a.png) -> 400 INVALID_FORM_THEME', () => {
      expect(() => normalizeFormTheme({ bannerKey: 'https://evil.example/a.png' }, ctx)).toThrow(/bannerKey/);
      try {
        normalizeFormTheme({ bannerKey: 'https://evil.example/a.png' }, ctx);
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_FORM_THEME');
      }
    });

    it('bannerKey mang id CHỦ KHÁC (không khớp workspaceOwnerId đang sửa) -> 400 ngay ở lớp định dạng', () => {
      const otherOwnerKey = `uploads/${OWNER_ID + 1}/forms/x.png`;
      expect(() => normalizeFormTheme({ bannerKey: otherOwnerKey }, ctx)).toThrow(/bannerKey/);
    });

    it('bannerKey đúng dạng nhưng thư mục "landing/" (không phải "forms/") -> 400', () => {
      const landingKey = `uploads/${OWNER_ID}/landing/x.png`;
      expect(() => normalizeFormTheme({ bannerKey: landingKey }, ctx)).toThrow(/bannerKey/);
    });

    it('không truyền workspaceOwnerId (ctx rỗng) -> mọi bannerKey đều 400 (an toàn theo mặc định)', () => {
      expect(() => normalizeFormTheme({ bannerKey: `uploads/${OWNER_ID}/forms/x.png` }, {})).toThrow(/bannerKey/);
    });

    it('logoKey theo đúng quy tắc như bannerKey (null, đúng dạng, URL ngoài -> lỗi)', () => {
      expect(normalizeFormTheme({ logoKey: null }, ctx)).toEqual({ logoKey: null });
      const key = `uploads/${OWNER_ID}/forms/logo.webp`;
      expect(normalizeFormTheme({ logoKey: key }, ctx)).toEqual({ logoKey: key });
      expect(() => normalizeFormTheme({ logoKey: 'https://evil.example/logo.png' }, ctx)).toThrow(/logoKey/);
    });

    it('không gửi bannerKey/logoKey -> không có 2 khoá này trong kết quả (không tự set null)', () => {
      const theme = normalizeFormTheme({ primaryColor: '#112233' }, ctx);
      expect(theme).not.toHaveProperty('bannerKey');
      expect(theme).not.toHaveProperty('logoKey');
    });
  });

  describe('buildFormAssetKeyRegex', () => {
    it('khớp đúng khoá của owner được truyền vào, không khớp owner khác', () => {
      const re = buildFormAssetKeyRegex(OWNER_ID);
      expect(re.test(`uploads/${OWNER_ID}/forms/a.png`)).toBe(true);
      expect(re.test(`uploads/${OWNER_ID + 1}/forms/a.png`)).toBe(false);
    });

    it('không khớp thư mục khác "forms/" hoặc đuôi file khác', () => {
      const re = buildFormAssetKeyRegex(OWNER_ID);
      expect(re.test(`uploads/${OWNER_ID}/landing/a.png`)).toBe(false);
      expect(re.test(`uploads/${OWNER_ID}/forms/a.gif`)).toBe(false);
      expect(re.test(`uploads/${OWNER_ID}/forms/a.svg`)).toBe(false);
    });
  });
});
