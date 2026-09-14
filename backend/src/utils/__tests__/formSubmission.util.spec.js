import { describe, it, expect } from '@jest/globals';
import { validateFormSubmission } from '../formSubmission.util.js';

describe('formSubmission.util', () => {
  const fields = [
    {
      key: 'f_name',
      type: 'short_text',
      label: 'Họ tên',
      required: true,
      role: 'name',
    },
    {
      key: 'f_email',
      type: 'email',
      label: 'Email',
      required: false,
      role: 'email',
    },
    {
      key: 'f_phone',
      type: 'phone',
      label: 'Số điện thoại',
      required: false,
      role: 'phone',
    },
    {
      key: 'f_service',
      type: 'select',
      label: 'Dịch vụ',
      required: true,
      options: [
        { label: 'Dịch vụ A', value: 'srv_a' },
        { label: 'Dịch vụ B', value: 'srv_b' },
        { label: 'Dịch vụ C', value: 'srv_c' },
      ],
    },
  ];

  it('xác thực thành công và trích xuất đúng thông tin respondent', () => {
    const rawAnswers = {
      f_name: 'Nguyễn Văn A',
      f_email: 'Test@Example.COM',
      f_phone: '0901 234 567',
      f_service: 'srv_a',
    };

    const result = validateFormSubmission(fields, rawAnswers, { marketingConsent: 'on' });
    expect(result.respondentName).toBe('Nguyễn Văn A');
    expect(result.respondentEmail).toBe('test@example.com');
    expect(result.respondentPhone).toBe('0901234567');
    expect(result.marketingConsent).toBe(true);
    expect(result.answers.f_service).toEqual({
      label: 'Dịch vụ',
      type: 'select',
      value: 'srv_a',
    });
    expect(result.answers.f_name).toEqual({
      label: 'Họ tên',
      type: 'short_text',
      value: 'Nguyễn Văn A',
    });
  });

  it('bỏ qua các key lạ không có trong định nghĩa fields (key hack)', () => {
    const rawAnswers = {
      f_name: 'Trần B',
      f_service: 'srv_b',
      hack: 'payload_x',
      extra_field: 123,
    };

    const result = validateFormSubmission(fields, rawAnswers);
    expect(result.answers.hack).toBeUndefined();
    expect(result.answers.extra_field).toBeUndefined();
    expect(result.answers.f_name).toEqual({
      label: 'Họ tên',
      type: 'short_text',
      value: 'Trần B',
    });
  });

  it('ném lỗi 400 nếu thiếu trường bắt buộc', () => {
    const rawAnswers = {
      f_email: 'test@example.com',
      f_service: 'srv_a',
    };

    expect(() => validateFormSubmission(fields, rawAnswers)).toThrow('Trường "Họ tên" là bắt buộc');
  });

  it('xử lý an toàn khi answers là null/không phải object, ném lỗi 400 vì thiếu trường bắt buộc', () => {
    expect(() => validateFormSubmission(fields, null)).toThrow('Trường "Họ tên" là bắt buộc');
    expect(() => validateFormSubmission(fields, undefined)).toThrow('Trường "Họ tên" là bắt buộc');
    expect(() => validateFormSubmission(fields, 'not-an-object')).toThrow('Trường "Họ tên" là bắt buộc');
  });

  it('ném lỗi 400 nếu email sai định dạng', () => {
    const rawAnswers = {
      f_name: 'Nguyễn Văn A',
      f_email: 'not-an-email',
      f_service: 'srv_a',
    };

    expect(() => validateFormSubmission(fields, rawAnswers)).toThrow('Email "not-an-email" không hợp lệ');
  });

  it('ném lỗi 400 nếu chọn giá trị ngoài danh sách options', () => {
    const rawAnswers = {
      f_name: 'Nguyễn Văn A',
      f_service: 'srv_invalid',
    };

    expect(() => validateFormSubmission(fields, rawAnswers)).toThrow(
      'Lựa chọn "srv_invalid" không nằm trong danh sách của trường "Dịch vụ"'
    );
  });

  it('ném lỗi 400 nếu short_text vượt quá 500 ký tự hoặc long_text vượt quá 5000 ký tự', () => {
    const longTextFields = [
      { key: 'f_short', type: 'short_text', label: 'Mô tả ngắn', required: true },
      { key: 'f_long', type: 'long_text', label: 'Mô tả dài', required: true },
    ];

    // short_text 501 chars
    expect(() =>
      validateFormSubmission(longTextFields, {
        f_short: 'a'.repeat(501),
        f_long: 'b'.repeat(100),
      })
    ).toThrow('Trường "Mô tả ngắn" không được vượt quá 500 ký tự');

    // short_text 500 chars -> ok
    // long_text 5001 chars -> 400
    expect(() =>
      validateFormSubmission(longTextFields, {
        f_short: 'a'.repeat(500),
        f_long: 'b'.repeat(5001),
      })
    ).toThrow('Trường "Mô tả dài" không được vượt quá 5000 ký tự');
  });

  it('ném lỗi 400 nếu ngày không hợp lệ kể cả ngày phi logic (2026-02-31)', () => {
    const dateFields = [
      { key: 'f_dob', type: 'date', label: 'Ngày sinh', required: true },
    ];

    expect(() =>
      validateFormSubmission(dateFields, { f_dob: 'not-a-date' })
    ).toThrow('Ngày "not-a-date" không hợp lệ');

    expect(() =>
      validateFormSubmission(dateFields, { f_dob: '2026-02-31' })
    ).toThrow('Ngày "2026-02-31" không hợp lệ');

    const validResult = validateFormSubmission(dateFields, { f_dob: '2026-02-28' });
    expect(validResult.answers.f_dob).toEqual({
      label: 'Ngày sinh',
      type: 'date',
      value: '2026-02-28',
    });
  });

  it('xác thực checkbox với mảng lựa chọn', () => {
    const checkboxFields = [
      {
        key: 'f_tags',
        type: 'checkbox',
        label: 'Quan tâm',
        required: true,
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    ];

    expect(() =>
      validateFormSubmission(checkboxFields, { f_tags: [] })
    ).toThrow('Trường "Quan tâm" là bắt buộc');

    expect(() =>
      validateFormSubmission(checkboxFields, { f_tags: ['opt1', 'invalid_opt'] })
    ).toThrow('Lựa chọn "invalid_opt" không nằm trong danh sách');

    const result = validateFormSubmission(checkboxFields, { f_tags: ['opt1', 'opt2'] });
    expect(result.answers.f_tags).toEqual({
      label: 'Quan tâm',
      type: 'checkbox',
      value: ['opt1', 'opt2'],
    });
  });
});
