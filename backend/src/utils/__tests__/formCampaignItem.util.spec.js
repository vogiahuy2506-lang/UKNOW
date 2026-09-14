import { describe, it, expect } from '@jest/globals';
import { mapFormSubmissionToCampaignItem } from '../formCampaignItem.util.js';

describe('formCampaignItem.util - mapFormSubmissionToCampaignItem', () => {
  const fields = [
    { key: 'f_name', type: 'short_text', label: 'Họ tên', role: 'name' },
    { key: 'f_email', type: 'email', label: 'Email', role: 'email' },
    { key: 'f_company_email', type: 'email', label: 'Email công ty', role: null },
    { key: 'f_service', type: 'select', label: 'Dịch vụ', role: null },
    { key: 'f_interests', type: 'checkbox', label: 'Quan tâm', role: null },
  ];

  const baseRow = {
    id: 42,
    formId: 7,
    respondentName: 'Nguyễn Văn A',
    respondentEmail: 'a@example.com',
    respondentPhone: '0901234567',
    appointmentAt: '2026-09-20T02:00:00.000Z',
    createdAt: '2026-09-14T08:00:00.000Z',
    marketingConsent: true,
    answers: {
      f_name: { label: 'Họ tên', type: 'short_text', value: 'Nguyễn Văn A' },
      f_email: { label: 'Email', type: 'email', value: 'a@example.com' },
      f_company_email: { label: 'Email công ty', type: 'email', value: 'CongTy@Example.Com' },
      f_service: { label: 'Dịch vụ', type: 'select', value: 'Gói Pro' },
      f_interests: { label: 'Quan tâm', type: 'checkbox', value: ['AI', 'Marketing'] },
    },
  };

  it('trả đủ khoá cố định + mỗi trường của form là một khoá phẳng theo field.key', () => {
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, {});
    expect(item.submissionId).toBe(42);
    expect(item.id).toBe(42);
    expect(item.formId).toBe(7);
    expect(item.appointmentAt).toBe('2026-09-20T02:00:00.000Z');
    expect(item.createdAt).toBe('2026-09-14T08:00:00.000Z');
    expect(item.marketingConsent).toBe(true);
    expect(item.f_service).toBe('Gói Pro');
  });

  it('fieldMap trống -> email/phone/fullName lấy theo respondent_* (đã chuẩn hoá theo role lúc nộp)', () => {
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, {});
    expect(item.email).toBe('a@example.com');
    expect(item.phone).toBe('0901234567');
    expect(item.fullName).toBe('Nguyễn Văn A');
  });

  it('fieldMap.emailKey trỏ trường khác (Email công ty) -> item.email lấy giá trị trường đó, chữ thường', () => {
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, { emailKey: 'f_company_email' });
    expect(item.email).toBe('congty@example.com');
  });

  it('trường checkbox chọn nhiều giá trị -> nối bằng ", "', () => {
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, {});
    expect(item.f_interests).toBe('AI, Marketing');
  });

  it('trường trong fieldMap không còn trong answers (đã xoá khỏi form) -> rơi về respondent_*, không lỗi', () => {
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, { emailKey: 'f_deleted_field' });
    expect(item.email).toBe('a@example.com');
  });

  it('phone lấy qua fieldMap từ trường KHÔNG phải type=phone (chưa chuẩn hoá) -> vẫn được chuẩn hoá khi đọc', () => {
    const rowWithRawPhoneField = {
      ...baseRow,
      answers: {
        ...baseRow.answers,
        f_service: { label: 'SĐT thô', type: 'short_text', value: '090 111 2222' },
      },
    };
    const item = mapFormSubmissionToCampaignItem(rowWithRawPhoneField, fields, { phoneKey: 'f_service' });
    expect(item.phone).toBe('0901112222');
  });

  it('getFieldValue({mode:"node", field:"full_name"}) tương thích alias sẵn có nhờ khoá "fullName"', () => {
    // campaignFlow.service.js getFieldValue có aliasMap full_name -> ['full_name','fullName','ten_khach']
    // — chỉ cần item có khoá 'fullName' là đủ, không cần snake_case.
    const item = mapFormSubmissionToCampaignItem(baseRow, fields, {});
    expect(Object.prototype.hasOwnProperty.call(item, 'fullName')).toBe(true);
    expect(item.fullName).toBe('Nguyễn Văn A');
  });
});
