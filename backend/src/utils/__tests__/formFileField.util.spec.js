/**
 * PR-4b — trường `file` đi qua bộ chuẩn hoá biểu mẫu (`normalizeFormFields`) và bộ kiểm bài nộp (`validateFormSubmission`).
 * Phần nghiệp vụ cần kho/DB (xác nhận tệp, hạn mức) nằm ở tests/integration/formsFileUpload.test.js.
 */
import { describe, expect, it } from '@jest/globals';
import { ALLOWED_FIELD_TYPES, MAX_INPUT_FIELDS, normalizeFormFields } from '../formDefinition.util.js';
import { validateFormSubmission } from '../formSubmission.util.js';
import { mapFormSubmissionToCampaignItem } from '../formCampaignItem.util.js';

const MB = 1024 * 1024;
const UPLOAD_A = '3f2a8c1e-0b6d-4e57-9a41-5d7c2b9e8f10';
const UPLOAD_B = '7b1d4e22-9c3a-4f68-8e05-1a2b3c4d5e6f';

describe('normalizeFormFields — trường file', () => {
  it('`file` nằm trong danh sách loại cho phép', () => {
    expect(ALLOWED_FIELD_TYPES).toContain('file');
  });

  it('thêm trường file không cấu hình → fileConfig mặc định (Ảnh + PDF, 10 MB, 1 tệp)', () => {
    const [field] = normalizeFormFields([{ label: 'Ảnh CCCD', type: 'file' }]);
    expect(field).toMatchObject({
      type: 'file',
      label: 'Ảnh CCCD',
      required: false,
      role: null,
      options: [],
      placeholder: '',
      fileConfig: { kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 },
    });
  });

  it('giữ cấu hình hợp lệ; chuẩn hoá thứ tự nhóm', () => {
    const [field] = normalizeFormFields([
      { label: 'Hồ sơ', type: 'file', required: true, fileConfig: { kinds: ['word', 'pdf'], maxBytes: 25 * MB, maxFiles: 4 } },
    ]);
    expect(field.required).toBe(true);
    expect(field.fileConfig).toEqual({ kinds: ['pdf', 'word'], maxBytes: 25 * MB, maxFiles: 4 });
  });

  it('`file` KHÔNG nhận role và placeholder (dù client gửi) và không có options', () => {
    const [field] = normalizeFormFields([
      { label: 'Tệp', type: 'file', role: 'name', placeholder: 'gõ gì đó', options: ['a'] },
    ]);
    expect(field.role).toBeNull();
    expect(field.placeholder).toBe('');
    expect(field.options).toEqual([]);
  });

  it('helpText và width vẫn dùng được cho trường file', () => {
    const [field] = normalizeFormFields([{ label: 'Tệp', type: 'file', helpText: 'Ảnh rõ nét', width: 'half' }]);
    expect(field.helpText).toBe('Ảnh rõ nét');
    expect(field.width).toBe('half');
  });

  it('chỉ trường `file` mới có khoá fileConfig — trường khác không đổi một byte', () => {
    const [text] = normalizeFormFields([{ label: 'Tên', type: 'short_text', fileConfig: { kinds: ['image'] } }]);
    expect(Object.keys(text)).not.toContain('fileConfig');
  });

  it.each([
    ['nhóm svg', { kinds: ['svg'] }],
    ['nhóm exe', { kinds: ['image', 'exe'] }],
    ['dung lượng 0', { maxBytes: 0 }],
    ['dung lượng 2 GB', { maxBytes: 2048 * MB }],
    ['12 tệp', { maxFiles: 12 }],
  ])('cấu hình sai (%s) → 400, không lưu', (_name, fileConfig) => {
    expect(() => normalizeFormFields([{ label: 'Tệp', type: 'file', fileConfig }])).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_FORM_DEFINITION' })
    );
  });

  it('`file` tính vào trần 30 trường NHẬP (không phải khối hiển thị)', () => {
    const fields = Array.from({ length: MAX_INPUT_FIELDS }, (_, i) => ({ label: `File ${i}`, type: 'file' }));
    expect(normalizeFormFields(fields)).toHaveLength(MAX_INPUT_FIELDS);
    expect(() => normalizeFormFields([...fields, { label: 'Thừa', type: 'file' }])).toThrow(/30 trường nhập/);
  });
});

describe('validateFormSubmission — trường file', () => {
  const fileField = {
    key: 'f_cv',
    type: 'file',
    label: 'Hồ sơ',
    required: true,
    role: null,
    options: [],
    fileConfig: { kinds: ['pdf'], maxBytes: 5 * MB, maxFiles: 2 },
  };
  const nameField = { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name' };

  it('mảng uploadId hợp lệ → vào fileInputs (chữ thường, bỏ trùng), KHÔNG vào answers', () => {
    const result = validateFormSubmission(
      [nameField, fileField],
      { f_name: 'An', f_cv: [UPLOAD_A.toUpperCase(), UPLOAD_A, UPLOAD_B] },
      {}
    );
    expect(result.answers).toEqual({ f_name: { label: 'Họ tên', type: 'short_text', value: 'An' } });
    expect(result.fileInputs).toEqual({ f_cv: { field: fileField, uploadIds: [UPLOAD_A, UPLOAD_B] } });
    expect(result.respondentName).toBe('An');
  });

  it('chấp nhận 1 chuỗi thay cho mảng 1 phần tử', () => {
    const result = validateFormSubmission([fileField], { f_cv: UPLOAD_A }, {});
    expect(result.fileInputs.f_cv.uploadIds).toEqual([UPLOAD_A]);
  });

  it('biểu mẫu không có trường file → kết quả KHÔNG có khoá fileInputs (hợp đồng cũ không đổi)', () => {
    const result = validateFormSubmission([nameField], { f_name: 'An' }, {});
    expect(Object.keys(result)).not.toContain('fileInputs');
  });

  it('uploadId sai định dạng → 400 INVALID_UPLOAD', () => {
    for (const bad of ['khong-phai-uuid', ['../etc/passwd'], [123], [{ id: UPLOAD_A }], [UPLOAD_A, 'x']]) {
      expect(() => validateFormSubmission([fileField], { f_cv: bad }, {})).toThrow(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_UPLOAD' })
      );
    }
  });

  it('nhiều hơn maxFiles → 400', () => {
    const third = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    expect(() => validateFormSubmission([fileField], { f_cv: [UPLOAD_A, UPLOAD_B, third] }, {})).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_UPLOAD' })
    );
  });

  it('bắt buộc mà không có tệp và không có dấu bỏ qua → 400 "là bắt buộc"', () => {
    expect(() => validateFormSubmission([fileField], {}, {})).toThrow(/Hồ sơ.*bắt buộc/);
    expect(() => validateFormSubmission([fileField], { f_cv: [] }, {})).toThrow(/bắt buộc/);
  });

  it('không bắt buộc và không có tệp → bỏ qua, không lỗi', () => {
    const optional = { ...fileField, required: false };
    const result = validateFormSubmission([optional], {}, {});
    expect(result.answers).toEqual({});
    expect(result.fileInputs).toBeUndefined();
  });

  it('bắt buộc nhưng có dấu bỏ qua (chủ hết dung lượng) → vẫn qua, chuyển cho service kiểm chữ ký', () => {
    const result = validateFormSubmission([fileField], {}, { fileSkip: { f_cv: ' token-do-server-cap ' } });
    expect(result.fileInputs).toEqual({ f_cv: { field: fileField, skipToken: 'token-do-server-cap' } });
  });

  it('có tệp thì bỏ qua dấu skip', () => {
    const result = validateFormSubmission([fileField], { f_cv: [UPLOAD_A] }, { fileSkip: { f_cv: 'x' } });
    expect(result.fileInputs.f_cv).toEqual({ field: fileField, uploadIds: [UPLOAD_A] });
  });

  it('cờ tắt (fileUploadsEnabled=false): bỏ qua hoàn toàn trường file, kể cả bắt buộc — không để mất khách', () => {
    const result = validateFormSubmission([nameField, fileField], { f_name: 'An', f_cv: [UPLOAD_A] }, {}, { fileUploadsEnabled: false });
    expect(result.fileInputs).toBeUndefined();
    expect(result.answers).toEqual({ f_name: { label: 'Họ tên', type: 'short_text', value: 'An' } });
    expect(() => validateFormSubmission([fileField], {}, {}, { fileUploadsEnabled: false })).not.toThrow();
  });
});

describe('node chiến dịch "Lấy dữ liệu từ biểu mẫu" — trường file chỉ ghi TÊN tệp', () => {
  const fields = [{ key: 'f_cv', type: 'file', label: 'Hồ sơ' }];
  const baseRow = { id: 5, formId: 2, respondentName: 'An', respondentEmail: 'an@example.com', respondentPhone: null, createdAt: '2026-10-12T00:00:00Z', marketingConsent: true };

  it('đã nhận tệp: giá trị cột = tên tệp nối bằng ", " (không có khoá kho, cỡ, URL)', () => {
    const item = mapFormSubmissionToCampaignItem({
      ...baseRow,
      answers: {
        f_cv: {
          label: 'Hồ sơ', type: 'file', value: ['CV.pdf', 'anh.png'], fileStatus: 'received',
          files: [
            { name: 'CV.pdf', size: 10, contentType: 'application/pdf', storageKey: 'uploads/7/forms/2/submissions/5/a.pdf' },
            { name: 'anh.png', size: 20, contentType: 'image/png', storageKey: 'uploads/7/forms/2/submissions/5/b.png' },
          ],
        },
      },
    }, fields);
    expect(item.f_cv).toBe('CV.pdf, anh.png');
    expect(JSON.stringify(item)).not.toMatch(/uploads\/|storageKey|https?:/);
  });

  it('chủ hết dung lượng (value rỗng): cột rỗng, không lỗi', () => {
    const item = mapFormSubmissionToCampaignItem({
      ...baseRow,
      answers: { f_cv: { label: 'Hồ sơ', type: 'file', value: [], files: [], fileStatus: 'quota_exceeded' } },
    }, fields);
    expect(item.f_cv).toBe('');
  });
});
