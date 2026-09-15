import { describe, it, expect, jest } from '@jest/globals';

const getLandingPages = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getLandingPages },
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
