/**
 * Dịch bài hướng dẫn phải được chờ lâu hơn 10 giây mặc định của `api`.
 *
 * Sự cố 22/09/2026: admin bấm "Dịch sang tiếng Anh" cho 20 bài, màn hình báo "Dịch thất bại" ở nhiều bài dù log
 * máy chủ ghi 21 lượt POST …/translate đều 200 (6–17 giây). Trình duyệt bỏ cuộc ở giây thứ 10, máy chủ vẫn dịch
 * xong và lưu; admin tưởng hỏng, bấm lại, tốn thêm lượt AI cho bản dịch y hệt (bài 21 bị dịch hai lần).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../api', () => ({ default: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn() } }));

const api = (await import('../api')).default;
const { adminTranslateHelpArticle, TRANSLATE_TIMEOUT_MS } = await import('../help.service');

describe('adminTranslateHelpArticle', () => {
  it('gửi kèm timeout riêng đủ dài cho một lượt dịch (≥ 60 giây, lớn hơn hẳn 10 giây mặc định)', async () => {
    await adminTranslateHelpArticle(21, 'en');

    expect(api.post).toHaveBeenCalledWith(
      '/help/admin/articles/21/translate',
      { locale: 'en' },
      expect.objectContaining({ timeout: TRANSLATE_TIMEOUT_MS }),
    );
    expect(TRANSLATE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
