import { describe, it, expect, jest } from '@jest/globals';

const getLandingPages = jest.fn();
const getLandingPickerPages = jest.fn();
const getLeadCountsBySlug = jest.fn();
const getForms = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getLandingPages, getLandingPickerPages, getLeadCountsBySlug, getForms },
}));

const { default: aiPromptResourcesService } = await import('../aiPromptResources.service.js');

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, review PR-5b-2b (16/09) → PR-5b-2c mục 4.
 *
 * `getLandingPages` map `form_id` (snake_case Postgres) → `formId` (số, camelCase — PR-5b-2b) đã
 * ĐÚNG code từ trước, nhưng chưa có file spec nào cho `aiPromptResources.service.js` (grep xác
 * nhận trước khi viết) — đột biến xoá dòng map `formId` không có ca nào bắt được ("xanh" vì chưa
 * ai viết test, không phải vì có kiểm chứng). Bịt lỗ coverage này, không viết lại toàn bộ service.
 */
describe('aiPromptResourcesService.getLandingPages — PR-5b-2c (bịt lỗ coverage review PR-5b-2b)', () => {
  it('form_id (bigint dạng string từ Postgres) → formId số; null → formId null', async () => {
    getLandingPages.mockResolvedValueOnce([
      { slug: 'khoa-hoc-ielts', title: 'Khoá IELTS', is_published: true, form_id: '7' },
      { slug: 'landing-thuong', title: 'Landing thường', is_published: true, form_id: null },
    ]);

    const rows = await aiPromptResourcesService.getLandingPages(1);

    expect(rows).toEqual([
      { slug: 'khoa-hoc-ielts', title: 'Khoá IELTS', isPublished: true, formId: 7 },
      { slug: 'landing-thuong', title: 'Landing thường', isPublished: true, formId: null },
    ]);
    expect(typeof rows[0].formId).toBe('number');
  });

  it('repository lỗi → nuốt lỗi, trả mảng rỗng (không throw lên prompt)', async () => {
    getLandingPages.mockRejectedValueOnce(new Error('db down'));
    await expect(aiPromptResourcesService.getLandingPages(1)).resolves.toEqual([]);
  });
});

/**
 * Rà soát C P2-7 — `getLandingPickerOptions`: dữ liệu cho thẻ chọn landing + dòng "landing nào, bao nhiêu lead" của thẻ xác nhận.
 * Mock giữ ĐÚNG hình dạng hàng repository (snake_case; `lead_count`/`form_consented_count` là int; slug lead lưu thô).
 */
describe('aiPromptResourcesService.getLandingPickerOptions — C P2-7', () => {
  it('gộp số lead theo slug chuẩn (dữ liệu cũ "/l", "/"), tổng gồm cả lead không gắn landing, form_id → formId số', async () => {
    getLandingPickerPages.mockResolvedValueOnce([
      { slug: 'khoa-ielts', title: 'Khoá IELTS', is_published: true, form_id: null, form_consented_count: 0 },
      { slug: 'l', title: 'Trang chủ', is_published: false, form_id: null, form_consented_count: 0 },
      { slug: 'dat-lich', title: 'Đặt lịch', is_published: true, form_id: '3', form_consented_count: 15 },
    ]);
    getLeadCountsBySlug.mockResolvedValueOnce([
      { slug: 'khoa-ielts', lead_count: 100 },
      { slug: '/Khoa-IELTS/', lead_count: 20 },
      { slug: '/', lead_count: 5 },
      { slug: '/l', lead_count: 2 },
      { slug: null, lead_count: 7 },
      { slug: 'da-xoa', lead_count: 1 },
    ]);

    const result = await aiPromptResourcesService.getLandingPickerOptions(9);

    expect(getLandingPickerPages).toHaveBeenCalledWith(9);
    expect(getLeadCountsBySlug).toHaveBeenCalledWith(9);
    expect(result.totalLeads).toBe(135);
    expect(result.landings).toEqual([
      { slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0 },
      { slug: 'l', title: 'Trang chủ', isPublished: false, formId: null, leadCount: 7, formConsentedCount: 0 },
      { slug: 'dat-lich', title: 'Đặt lịch', isPublished: true, formId: 3, leadCount: 0, formConsentedCount: 15 },
    ]);
  });

  it('repository lỗi → trả null (CHƯA BIẾT), KHÔNG phải danh sách rỗng — để cổng chặn thay vì kết luận "không có landing"', async () => {
    getLandingPickerPages.mockRejectedValueOnce(new Error('db down'));
    getLeadCountsBySlug.mockResolvedValueOnce([]);
    await expect(aiPromptResourcesService.getLandingPickerOptions(9)).resolves.toBeNull();
  });

  it('không có ownerId → rỗng, không chạm DB', async () => {
    getLandingPickerPages.mockClear();
    await expect(aiPromptResourcesService.getLandingPickerOptions(null)).resolves.toEqual({ landings: [], totalLeads: 0 });
    expect(getLandingPickerPages).not.toHaveBeenCalled();
  });
});

/** Cổng `formId` (10/10/2026): dữ liệu cho thẻ chọn biểu mẫu của wizard. */
describe('aiPromptResourcesService.getFormPickerOptions', () => {
  it('map cột snake_case của repo sang camelCase, id là số', async () => {
    getForms.mockResolvedValueOnce([
      { id: '7', title: 'Đăng ký tư vấn', is_published: true, consent_enabled: true, consented_count: 12 },
      { id: 9, title: '', is_published: true, consent_enabled: false, consented_count: 0 },
    ]);
    await expect(aiPromptResourcesService.getFormPickerOptions(9)).resolves.toEqual({
      forms: [
        { id: 7, title: 'Đăng ký tư vấn', consentEnabled: true, consentedCount: 12 },
        { id: 9, title: '#9', consentEnabled: false, consentedCount: 0 },
      ],
    });
  });

  it('repository lỗi → null (CHƯA BIẾT), KHÔNG phải rỗng — để cổng chặn thay vì kết luận "không có biểu mẫu"', async () => {
    getForms.mockRejectedValueOnce(new Error('db down'));
    await expect(aiPromptResourcesService.getFormPickerOptions(9)).resolves.toBeNull();
  });

  it('không có ownerId → rỗng, không chạm DB', async () => {
    getForms.mockClear();
    await expect(aiPromptResourcesService.getFormPickerOptions(null)).resolves.toEqual({ forms: [] });
    expect(getForms).not.toHaveBeenCalled();
  });
});
