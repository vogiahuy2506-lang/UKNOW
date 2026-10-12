import { describe, it, expect } from '@jest/globals';
import {
  mapFormSubmissionToCampaignItem,
  campaignItemPersonKey,
  dedupeCampaignItemsKeepNewest,
} from '../formCampaignItem.util.js';

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

  it('dữ liệu cũ: trường form lỡ có field.key trùng khoá cố định (answers.email) -> bị bỏ qua, item.email vẫn là respondentEmail chuẩn hoá', () => {
    // Phòng dữ liệu tạo TRƯỚC khi normalizeFormFields chặn key trùng (PR-6a review 14/09) —
    // field.key literal "email" không được phép ghi đè khoá cố định của item.
    const fieldsWithReservedKey = [
      ...fields,
      { key: 'email', type: 'short_text', label: 'Email tự khai (dữ liệu cũ)', role: null },
    ];
    const rowWithReservedAnswerKey = {
      ...baseRow,
      answers: {
        ...baseRow.answers,
        email: { label: 'Email tự khai (dữ liệu cũ)', type: 'short_text', value: 'khac-hoan-toan@example.com' },
      },
    };
    const item = mapFormSubmissionToCampaignItem(rowWithReservedAnswerKey, fieldsWithReservedKey, {});
    expect(item.email).toBe('a@example.com');
  });

  it('PR-4: khối hiển thị (heading / paragraph / page_break) không thành khoá của item dù answers lỡ có khoá trùng; rating / yes_no / time thành khoá phẳng', () => {
    const fieldsWithBlocks = [
      ...fields,
      { key: 'f_h', type: 'heading', label: 'Phần 1', role: null },
      { key: 'f_p', type: 'paragraph', label: 'Hướng dẫn', role: null },
      { key: 'f_pb', type: 'page_break', label: 'Bước 2', role: null },
      { key: 'f_rate', type: 'rating', label: 'Sao', role: null },
      { key: 'f_yn', type: 'yes_no', label: 'Dùng thử?', role: null },
      { key: 'f_time', type: 'time', label: 'Giờ', role: null },
    ];
    const row = {
      ...baseRow,
      answers: {
        ...baseRow.answers,
        // Dữ liệu bẩn: khối hiển thị không bao giờ có câu trả lời, nhưng nếu có thì vẫn phải bị bỏ qua
        f_h: { label: 'Phần 1', type: 'heading', value: 'x' },
        f_p: { label: 'Hướng dẫn', type: 'paragraph', value: 'y' },
        f_pb: { label: 'Bước 2', type: 'page_break', value: 'z' },
        f_rate: { label: 'Sao', type: 'rating', value: 4 },
        f_yn: { label: 'Dùng thử?', type: 'yes_no', value: 'yes' },
        f_time: { label: 'Giờ', type: 'time', value: '09:30' },
      },
    };
    const item = mapFormSubmissionToCampaignItem(row, fieldsWithBlocks, {});
    expect(item).not.toHaveProperty('f_h');
    expect(item).not.toHaveProperty('f_p');
    expect(item).not.toHaveProperty('f_pb');
    expect(item.f_rate).toBe(4);
    expect(item.f_yn).toBe('yes');
    expect(item.f_time).toBe('09:30');
  });
});

describe('formCampaignItem.util — khử trùng người điền nhiều biểu mẫu (PR-7b)', () => {
  it('campaignItemPersonKey: email (trim + chữ thường) thắng; không có email thì 9 số cuối SĐT; SĐT quá ngắn / trống → null', () => {
    expect(campaignItemPersonKey({ email: '  An@X.com ', phone: '0901234567' })).toBe('e:an@x.com');
    expect(campaignItemPersonKey({ email: '', phone: '+84 901 234 567' })).toBe('p:901234567');
    expect(campaignItemPersonKey({ email: null, phone: '0901234567' })).toBe('p:901234567');
    expect(campaignItemPersonKey({ email: null, phone: '12345' })).toBeNull();
    expect(campaignItemPersonKey({ email: '   ', phone: '' })).toBeNull();
    expect(campaignItemPersonKey({})).toBeNull();
  });

  it('SĐT viết khác nhau (0901..., +84901..., 84 901...) cùng một người', () => {
    expect(campaignItemPersonKey({ phone: '0901234567' })).toBe(campaignItemPersonKey({ phone: '+84901234567' }));
    expect(campaignItemPersonKey({ phone: '0901234567' })).toBe(campaignItemPersonKey({ phone: '84 901 234 567' }));
  });

  it('dedupeCampaignItemsKeepNewest: đầu vào mới nhất trước → giữ bản gặp ĐẦU (mới nhất) của mỗi người, giữ thứ tự', () => {
    const items = [
      { submissionId: 9, formId: 2, email: 'a@x.com', fullName: 'A mới' },
      { submissionId: 8, formId: 1, email: 'B@x.com', fullName: 'B' },
      { submissionId: 7, formId: 1, email: 'a@X.com', fullName: 'A cũ' },
      { submissionId: 6, formId: 3, email: null, phone: '0900000001', fullName: 'C' },
      { submissionId: 5, formId: 1, email: null, phone: '+84900000001', fullName: 'C cũ' },
    ];
    const out = dedupeCampaignItemsKeepNewest(items);
    expect(out.map((i) => i.submissionId)).toEqual([9, 8, 6]);
    expect(out[0].fullName).toBe('A mới');
  });

  it('item không có email lẫn SĐT hợp lệ KHÔNG nhận diện được → giữ nguyên, không bị gộp với nhau', () => {
    const items = [
      { submissionId: 3, email: null, phone: null },
      { submissionId: 2, email: '', phone: '123' },
      { submissionId: 1, email: null, phone: undefined },
    ];
    expect(dedupeCampaignItemsKeepNewest(items)).toHaveLength(3);
  });

  it('đầu vào không phải mảng → []', () => {
    expect(dedupeCampaignItemsKeepNewest(null)).toEqual([]);
    expect(dedupeCampaignItemsKeepNewest(undefined)).toEqual([]);
  });
});
