import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 4 (D-22 / D-OLD-A5): dịch CHÚ THÍCH ảnh/video của bài trợ giúp gọi Gemini (Google tính tiền) nhưng bản cũ không ghi token nào —
 * trang Chi phí AI thấp hơn hoá đơn. Nay mỗi chú thích ghi một dòng `help_translate_caption` (kèm model THẬT), và ghi hỏng không làm mất bản dịch.
 * Ranh giới giả lập: Gemini (`generateGeminiText` của help), `aiUsageMeter.record`, kho bài viết.
 */
const generateGeminiText = jest.fn();
const record = jest.fn();
const helpRepo = {
  findArticleById: jest.fn(),
  findArticleBySlug: jest.fn(),
  createArticle: jest.fn(),
  updateArticle: jest.fn(),
  deleteMediaByArticleId: jest.fn(),
  listMedia: jest.fn(),
  addMedia: jest.fn(),
};

jest.unstable_mockModule('../geminiText.util.js', () => ({ generateGeminiText }));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({ default: { record } }));
jest.unstable_mockModule('../../../repositories/help/helpArticle.repository.js', () => helpRepo);
jest.unstable_mockModule('../helpCenter.service.js', () => ({
  reindexArticle: jest.fn(async () => undefined),
  _clearCapabilityMapCache: jest.fn(),
}));

const { translateHelpArticle } = await import('../helpTranslate.service.js');

const raw = (total) => ({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: total - 3, totalTokenCount: total } });

describe('dịch bài trợ giúp — ghi token dịch chú thích', () => {
  beforeEach(() => {
    [generateGeminiText, record, ...Object.values(helpRepo)].forEach((fn) => fn.mockReset());
    helpRepo.findArticleById.mockImplementation(async (id) => (id === 1
      ? { id: 1, slug: 'bai-1', locale: 'vi', title: 'Tiêu đề', summary: '', body_md: 'Nội dung', is_published: false }
      : { id: 2, is_published: false }));
    helpRepo.findArticleBySlug.mockResolvedValue(null);
    helpRepo.createArticle.mockResolvedValue({ id: 2, is_published: false });
    helpRepo.listMedia.mockResolvedValue([{ type: 'image', url: '/a.png', caption: 'Ảnh màn hình', sort_order: 0 }]);
    helpRepo.addMedia.mockResolvedValue(undefined);
    record.mockResolvedValue(undefined);
    generateGeminiText.mockImplementation(async ({ feature }) => (feature === 'help_translate'
      ? { text: JSON.stringify({ title: 'Title', summary: '', body_md: 'Body' }), modelName: 'gemini-x', raw: raw(100) }
      : { text: 'Screenshot', modelName: 'gemini-y', raw: raw(20) }));
  });

  it('mỗi chú thích → một dòng help_translate_caption với model THẬT và token của lượt đó; bài vẫn có dòng help_translate riêng', async () => {
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });

    const features = record.mock.calls.map((c) => c[2].feature);
    expect(features).toEqual(['help_translate', 'help_translate_caption']);
    const caption = record.mock.calls.find((c) => c[2].feature === 'help_translate_caption');
    expect(caption[0]).toBe(5);
    expect(caption[1]).toEqual({ promptTokens: 3, outputTokens: 17, totalTokens: 20 });
    expect(caption[2]).toMatchObject({ model: 'gemini-y', kind: 'generate' });
    expect(helpRepo.addMedia).toHaveBeenCalledWith(2, expect.objectContaining({ caption: 'Screenshot' }));
  });

  it('ghi token chú thích hỏng → bản dịch chú thích vẫn được lưu', async () => {
    record.mockImplementation(async (_u, _usage, meta) => {
      if (meta.feature === 'help_translate_caption') throw new Error('sổ hỏng');
    });
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });
    expect(helpRepo.addMedia).toHaveBeenCalledWith(2, expect.objectContaining({ caption: 'Screenshot' }));
  });

  it('chú thích rỗng → không gọi Gemini, không ghi token', async () => {
    helpRepo.listMedia.mockResolvedValue([{ type: 'image', url: '/a.png', caption: '  ', sort_order: 0 }]);
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });
    expect(record.mock.calls.map((c) => c[2].feature)).toEqual(['help_translate']);
  });
});
