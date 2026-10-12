import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findFormByIdAndOwner = jest.fn();
const listConsentedSubmissionsForCampaign = jest.fn();
const countConsentedSubmissionsForCampaign = jest.fn();
const findFormsForCampaignByIdsAndOwner = jest.fn();
const listConsentedSubmissionsForForms = jest.fn();
const listLandingFormGroups = jest.fn();

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: {
    findFormByIdAndOwner,
    listConsentedSubmissionsForCampaign,
    countConsentedSubmissionsForCampaign,
    findFormsForCampaignByIdsAndOwner,
    listConsentedSubmissionsForForms,
    listLandingFormGroups,
  },
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 100,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 10,
}));

const { default: formService } = await import('../form.service.js');

const FIELDS_A = [
  { key: 'a_name', type: 'short_text', label: 'Họ tên', role: 'name' },
  { key: 'a_email', type: 'email', label: 'Email', role: 'email' },
  { key: 'a_note', type: 'long_text', label: 'Ghi chú A', role: null },
];
const FIELDS_B = [
  { key: 'b_name', type: 'short_text', label: 'Tên', role: 'name' },
  { key: 'b_phone', type: 'phone', label: 'SĐT', role: 'phone' },
  { key: 'b_note', type: 'long_text', label: 'Ghi chú B', role: null },
  { key: 'a_note', type: 'long_text', label: 'Ghi chú trùng khoá', role: null },
  { key: 'h1', type: 'heading', label: 'Tiêu đề phần', role: null },
];

/** Hàng form_submissions đúng hình dạng repository trả (camelCase), `createdAt` để đọc thứ tự. */
const row = (id, formId, createdAt, { email = null, phone = null, name = 'Khách', answers = {} } = {}) => ({
  id,
  formId,
  answers,
  respondentName: name,
  respondentEmail: email,
  respondentPhone: phone,
  marketingConsent: true,
  appointmentAt: null,
  createdAt,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  findFormsForCampaignByIdsAndOwner.mockImplementation(async (ids) => (
    ids.map((id) => ({ id, title: `Form ${id}`, fields: id === 2 ? FIELDS_B : FIELDS_A, settings: {} }))
  ));
});

describe('formService.getCampaignDataForForms (PR-7b)', () => {
  it('đúng MỘT biểu mẫu (đồ thị cũ chỉ có formId) → đường một biểu mẫu NGUYÊN VẸN: không khử trùng, không chạm truy vấn nhiều biểu mẫu', async () => {
    findFormByIdAndOwner.mockResolvedValue({ id: 1, fields: FIELDS_A });
    listConsentedSubmissionsForCampaign.mockResolvedValue([
      row(1, 1, '2026-10-01T01:00:00Z', { email: 'a@x.com' }),
      row(2, 1, '2026-10-02T01:00:00Z', { email: 'a@x.com' }), // cùng người điền 2 lần — đường cũ giữ cả hai
    ]);

    const { items, forms } = await formService.getCampaignDataForForms([1, 1], 9, { limit: 500 });

    expect(listConsentedSubmissionsForCampaign).toHaveBeenCalledWith(1, 9, 500);
    expect(listConsentedSubmissionsForForms).not.toHaveBeenCalled();
    expect(items.map((i) => i.submissionId)).toEqual([1, 2]);
    expect(forms).toHaveLength(1);
  });

  it('nhiều biểu mẫu → bài của MỌI biểu mẫu, người điền 2 biểu mẫu chỉ ra MỘT item (bản MỚI NHẤT), xếp cũ trước', async () => {
    // Repository trả mới nhất trước.
    listConsentedSubmissionsForForms.mockResolvedValue([
      row(30, 2, '2026-10-05T01:00:00Z', { email: null, phone: '0901000002', name: 'Chị Hoa (form 2, mới)' }),
      row(20, 1, '2026-10-04T01:00:00Z', { email: 'an@x.com', name: 'An (form 1, mới)' }),
      row(10, 2, '2026-10-03T01:00:00Z', { email: 'an@x.com', phone: '0901000001', name: 'An (form 2, cũ)' }),
      row(5, 1, '2026-10-01T01:00:00Z', { email: 'binh@x.com', name: 'Bình' }),
    ]);

    const { items } = await formService.getCampaignDataForForms([1, 2], 9, {});

    expect(listConsentedSubmissionsForForms).toHaveBeenCalledWith([1, 2], 9, expect.any(Number));
    // An xuất hiện ở form 1 (id 20, mới) và form 2 (id 10, cũ) → giữ id 20. Cũ trước: Bình(5), An(20), Hoa(30).
    expect(items.map((i) => i.submissionId)).toEqual([5, 20, 30]);
    expect(items.find((i) => i.email === 'an@x.com').fullName).toBe('An (form 1, mới)');
    // Item vẫn mang formId của bài nộp được giữ (nhận diện nguồn consent form_submission).
    expect(items.map((i) => i.formId)).toEqual([1, 1, 2]);
  });

  it('giới hạn tổng: limit cắt sau khi khử trùng, giữ các người CŨ nhất trước (như đường một biểu mẫu)', async () => {
    listConsentedSubmissionsForForms.mockResolvedValue([
      row(4, 2, '2026-10-04T00:00:00Z', { email: 'd@x.com' }),
      row(3, 1, '2026-10-03T00:00:00Z', { email: 'c@x.com' }),
      row(2, 2, '2026-10-02T00:00:00Z', { email: 'b@x.com' }),
      row(1, 1, '2026-10-01T00:00:00Z', { email: 'b@x.com' }), // trùng b — không chiếm chỗ trong limit
    ]);

    const { items } = await formService.getCampaignDataForForms([1, 2], 9, { limit: 2 });

    expect(items.map((i) => i.submissionId)).toEqual([2, 3]);
  });

  it('biểu mẫu KHÔNG thuộc workspace bị bỏ: chỉ id repository trả về mới được đọc bài nộp', async () => {
    findFormsForCampaignByIdsAndOwner.mockResolvedValue([{ id: 1, title: 'Form 1', fields: FIELDS_A, settings: {} }]);
    listConsentedSubmissionsForForms.mockResolvedValue([row(1, 1, '2026-10-01T00:00:00Z', { email: 'a@x.com' })]);

    const { items, forms } = await formService.getCampaignDataForForms([1, 777], 9, {});

    expect(findFormsForCampaignByIdsAndOwner).toHaveBeenCalledWith([1, 777], 9);
    expect(listConsentedSubmissionsForForms).toHaveBeenCalledWith([1], 9, expect.any(Number));
    expect(forms.map((f) => f.id)).toEqual([1]);
    expect(items).toHaveLength(1);
  });

  it('không biểu mẫu nào thuộc workspace → FORM_NOT_FOUND 404, KHÔNG đọc bài nộp (chiến dịch báo lỗi rõ, không chạy rỗng)', async () => {
    findFormsForCampaignByIdsAndOwner.mockResolvedValue([]);

    await expect(formService.getCampaignDataForForms([5, 6], 9, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'FORM_NOT_FOUND',
    });
    expect(listConsentedSubmissionsForForms).not.toHaveBeenCalled();
  });

  it('fieldMap CHUNG theo khoá: biểu mẫu có khoá → đọc trường đó; biểu mẫu không có khoá → rơi về cột respondent_* theo role', async () => {
    listConsentedSubmissionsForForms.mockResolvedValue([
      // Form 1 có a_email → emailKey áp dụng; form 2 không có a_email → dùng respondent_email theo role.
      row(2, 2, '2026-10-02T00:00:00Z', { email: 'role@b.com', name: 'Từ form 2' }),
      row(1, 1, '2026-10-01T00:00:00Z', {
        email: 'role@a.com',
        answers: { a_email: { label: 'Email', type: 'email', value: 'KHAC@A.com' } },
      }),
    ]);

    const { items } = await formService.getCampaignDataForForms([1, 2], 9, { fieldMap: { emailKey: 'a_email' } });

    expect(items.map((i) => i.email)).toEqual(['khac@a.com', 'role@b.com']);
  });
});

describe('formService.getCampaignPreviewForForms (PR-7b)', () => {
  it('cột = hợp các trường nhập của mọi biểu mẫu (trùng khoá giữ nhãn biểu mẫu đứng trước, bỏ khối hiển thị); total = số người sau khử trùng', async () => {
    listConsentedSubmissionsForForms.mockResolvedValue([
      row(3, 2, '2026-10-03T00:00:00Z', { email: 'a@x.com' }),
      row(2, 1, '2026-10-02T00:00:00Z', { email: 'b@x.com' }),
      row(1, 1, '2026-10-01T00:00:00Z', { email: 'a@x.com' }),
    ]);

    const result = await formService.getCampaignPreviewForForms([1, 2], 9, { limit: 1 });

    expect(result.columns.map((c) => c.key)).toEqual(['a_name', 'a_email', 'a_note', 'b_name', 'b_phone', 'b_note']);
    expect(result.columns.find((c) => c.key === 'a_note').label).toBe('Ghi chú A');
    expect(result.columns.some((c) => c.key === 'h1')).toBe(false);
    // 3 bài nộp → 2 người (a trùng). limit 1 → items 1, total vẫn 2.
    expect(result.pagination).toEqual({ total: 2, limit: 1, fetched: 1 });
    expect(result.items).toHaveLength(1);
  });

  it('đúng một biểu mẫu → đi đường preview cũ (đếm bằng countConsentedSubmissionsForCampaign)', async () => {
    findFormByIdAndOwner.mockResolvedValue({ id: 4, fields: FIELDS_A });
    listConsentedSubmissionsForCampaign.mockResolvedValue([]);
    countConsentedSubmissionsForCampaign.mockResolvedValue(12);

    const result = await formService.getCampaignPreviewForForms(['4'], 9, {});

    expect(countConsentedSubmissionsForCampaign).toHaveBeenCalledWith(4, 9);
    expect(listConsentedSubmissionsForForms).not.toHaveBeenCalled();
    expect(result.pagination.total).toBe(12);
  });
});

describe('formService.listLandingFormGroups (PR-7b)', () => {
  it('giao repository đúng workspace', async () => {
    listLandingFormGroups.mockResolvedValue([{ slug: 'a', title: 'A', formIds: [1, 2] }]);
    await expect(formService.listLandingFormGroups(9)).resolves.toEqual([{ slug: 'a', title: 'A', formIds: [1, 2] }]);
    expect(listLandingFormGroups).toHaveBeenCalledWith(9);
  });
});
