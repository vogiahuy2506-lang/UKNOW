import { describe, it, expect } from 'vitest';
import { applyFieldMapToPreviewItem, applyFieldMapToPreviewItems } from '../formSubmissionFieldMap';

describe('formSubmissionFieldMap - applyFieldMapToPreviewItem', () => {
  const baseItem = {
    submissionId: 1,
    id: 1,
    formId: 9,
    fullName: 'Nguyễn Văn A',
    email: 'a@example.com',
    phone: '0901234567',
    f_company_email: 'CongTy@Example.Com',
    f_raw_phone: '090 111 2222',
  };

  it('fieldMap rỗng -> giữ nguyên item (không sửa email/phone/fullName)', () => {
    const result = applyFieldMapToPreviewItem(baseItem, {});
    expect(result.email).toBe('a@example.com');
    expect(result.phone).toBe('0901234567');
    expect(result.fullName).toBe('Nguyễn Văn A');
  });

  it('fieldMap.emailKey trỏ trường khác -> item.email lấy giá trị trường đó, chữ thường', () => {
    const result = applyFieldMapToPreviewItem(baseItem, { emailKey: 'f_company_email' });
    expect(result.email).toBe('congty@example.com');
  });

  it('fieldMap.phoneKey trỏ trường thô (chưa chuẩn hoá) -> vẫn được bỏ khoảng trắng', () => {
    const result = applyFieldMapToPreviewItem(baseItem, { phoneKey: 'f_raw_phone' });
    expect(result.phone).toBe('0901112222');
  });

  it('fieldMap trỏ tới khoá không tồn tại trên item (đã bị xoá khỏi form) -> rơi về giá trị cũ, không lỗi', () => {
    const result = applyFieldMapToPreviewItem(baseItem, { emailKey: 'f_deleted' });
    expect(result.email).toBe('a@example.com');
  });

  it('không sửa item gốc (trả object mới)', () => {
    const result = applyFieldMapToPreviewItem(baseItem, { emailKey: 'f_company_email' });
    expect(baseItem.email).toBe('a@example.com');
    expect(result).not.toBe(baseItem);
  });

  it('applyFieldMapToPreviewItems áp cho cả mảng', () => {
    const items = [baseItem, { ...baseItem, submissionId: 2, id: 2 }];
    const result = applyFieldMapToPreviewItems(items, { emailKey: 'f_company_email' });
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe('congty@example.com');
    expect(result[1].email).toBe('congty@example.com');
  });
});
