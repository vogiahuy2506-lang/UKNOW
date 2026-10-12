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

describe('formSubmission.util - loại trường & khối hiển thị mới (PR-4)', () => {
  const fields = [
    { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name' },
    { key: 'f_h', type: 'heading', label: 'Phần 1', required: true },
    { key: 'f_p', type: 'paragraph', label: 'Hướng dẫn điền', required: true },
    { key: 'f_rate', type: 'rating', label: 'Mức hài lòng', required: false },
    { key: 'f_yn', type: 'yes_no', label: 'Đã dùng thử?', required: false },
    { key: 'f_time', type: 'time', label: 'Giờ liên hệ', required: false },
    { key: 'f_pb', type: 'page_break', label: 'Bước 2', required: true },
    { key: 'f_note', type: 'short_text', label: 'Ghi chú bước 2', required: true },
  ];
  const ok = { f_name: 'Lan', f_note: 'ổn' };

  describe('khối hiển thị bị bỏ qua', () => {
    it('heading / paragraph / page_break không bao giờ vào answers, kể cả khi client gửi kèm giá trị cho khoá của chúng', () => {
      const result = validateFormSubmission(
        fields,
        { ...ok, f_h: 'hack', f_p: 'hack', f_pb: 'hack' },
        {}
      );
      expect(Object.keys(result.answers).sort()).toEqual(['f_name', 'f_note']);
    });

    it('khối hiển thị lỡ mang required=true (dữ liệu bẩn) cũng không bắt khách điền', () => {
      expect(() => validateFormSubmission(fields, ok, {})).not.toThrow();
    });
  });

  describe('trường bắt buộc ở trang sau vẫn kiểm phía server', () => {
    it('thiếu trường bắt buộc nằm SAU page_break (trang 2) → lỗi, dù trang 1 đủ', () => {
      expect(() => validateFormSubmission(fields, { f_name: 'Lan' }, {})).toThrow('Trường "Ghi chú bước 2" là bắt buộc');
    });
  });

  describe('rating', () => {
    it.each([1, 3, 5, '4'])('nhận %p', (v) => {
      const r = validateFormSubmission(fields, { ...ok, f_rate: v }, {});
      expect(r.answers.f_rate).toEqual({ label: 'Mức hài lòng', type: 'rating', value: Number(v) });
    });

    it.each([0, 6, -1, 4.5, '4.5', 'năm', true, [3], {}, 1e3])('từ chối ngoài 1..5 hoặc không phải số nguyên: %p', (v) => {
      expect(() => validateFormSubmission(fields, { ...ok, f_rate: v }, {})).toThrow('phải là số sao từ 1 đến 5');
    });

    it('bắt buộc mà không chọn → báo bắt buộc; không bắt buộc và bỏ trống → không có trong answers', () => {
      const required = [{ key: 'f_r', type: 'rating', label: 'Sao', required: true }];
      expect(() => validateFormSubmission(required, {}, {})).toThrow('Trường "Sao" là bắt buộc');
      expect(validateFormSubmission(fields, ok, {}).answers).not.toHaveProperty('f_rate');
    });
  });

  describe('yes_no', () => {
    it.each(['yes', 'no', ' YES ', 'No'])('nhận %p (chuẩn hoá về yes|no)', (v) => {
      const r = validateFormSubmission(fields, { ...ok, f_yn: v }, {});
      expect(r.answers.f_yn.value).toBe(String(v).trim().toLowerCase());
      expect(r.answers.f_yn.type).toBe('yes_no');
    });

    it.each(['true', 'có', 'maybe', true, false, 1, ['yes']])('từ chối %p', (v) => {
      expect(() => validateFormSubmission(fields, { ...ok, f_yn: v }, {})).toThrow('chỉ nhận lựa chọn Có hoặc Không');
    });

    it('trường bắt buộc: trả lời "no" là hợp lệ (bắt buộc = phải trả lời, không phải phải đồng ý)', () => {
      const required = [{ key: 'f_y', type: 'yes_no', label: 'Đồng ý?', required: true }];
      expect(validateFormSubmission(required, { f_y: 'no' }, {}).answers.f_y.value).toBe('no');
      expect(() => validateFormSubmission(required, {}, {})).toThrow('Trường "Đồng ý?" là bắt buộc');
    });
  });

  describe('time', () => {
    it.each(['00:00', '09:05', '23:59', ' 14:30 '])('nhận %p', (v) => {
      const r = validateFormSubmission(fields, { ...ok, f_time: v }, {});
      expect(r.answers.f_time.value).toBe(String(v).trim());
    });

    it.each(['24:00', '9:05', '12:60', '12:5', '12:30:15', '1230', 'abc', '12-30', 1230])('từ chối %p', (v) => {
      expect(() => validateFormSubmission(fields, { ...ok, f_time: v }, {})).toThrow('không hợp lệ (định dạng HH:MM');
    });
  });

  it('trường cũ không đổi hành vi khi form có thêm khối hiển thị', () => {
    const result = validateFormSubmission(fields, { ...ok, f_rate: 5, f_yn: 'yes', f_time: '08:00' }, { marketingConsent: 'true' });
    expect(result.respondentName).toBe('Lan');
    expect(result.marketingConsent).toBe(true);
    expect(Object.keys(result.answers).sort()).toEqual(['f_name', 'f_note', 'f_rate', 'f_time', 'f_yn']);
  });
});
