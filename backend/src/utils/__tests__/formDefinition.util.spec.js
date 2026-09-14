import { describe, it, expect } from '@jest/globals';
import {
  normalizeFormFields,
  normalizeFormSettings,
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
