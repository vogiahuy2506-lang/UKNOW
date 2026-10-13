import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * 13/10/2026 — dịch bài hướng dẫn: che URL ảnh + đầu ra theo mốc.
 * Đo trên prod (bài `bieu-mau`, 9 ảnh): JSON bọc thân bài HTML vỡ cả khi bật JSON mode, và lượt parse được vẫn chép sai 1/9 URL ảnh
 * (~270 ký tự base64) → ảnh bản EN hỏng. Nay URL được thay bằng `__MEDIA_n__` trước khi gửi, model trả về theo mốc @@TITLE@@ … @@END@@,
 * URL thật được trả vào và mỗi mã phải có ĐÚNG một lần — sai định dạng / lệch mã thì dịch lại một lần rồi mới 422.
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

const {
  translateHelpArticle, maskMediaUrls, restoreMediaUrls, parseTranslationOutput, HELP_TRANSLATE_MAX_ATTEMPTS,
} = await import('../helpTranslate.service.js');

// URL dạng thật của production (token base64 dài) — chính loại chuỗi model hay chép sai.
const URL_A = 'https://founderai.biz/file/eyJzayI6InVwbG9hZHMvNi8xNzkxODc1MzY5MjA4X2I1NTBlMzBmLWI4NzctNGJhMi04Y2IyLWU3NDZiODFkMDg0NF9tZW51LWJpZXUtbWF1LnBuZyJ9.xiUwgwIrzXktjMpIPEo8aqFwI3pJvS-kB0oZ6pSa1vA/download?preview=true';
const URL_B = 'https://founderai.biz/file/eyJzayI6InVwbG9hZHMvNi8xNzkxODc1MzcwMTI1X2E1ZGY0NGY1LTUyODEtNGNmZS1iNDMyLTFjYjVlMzk1ZGRkMV9haS5wbmcifQ.GZi7edncemlcjnOn5PuIRXSZRzZJws_i5Vfm8kaqee8/download?preview=true';
const VI_HTML = `<h2>Biểu mẫu</h2><p>Mở menu.</p><img src="${URL_A}" alt="menu bên trái"><p>Bấm "Tạo".</p><img src="${URL_B}" alt="hộp tạo">`;

const raw = { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 90, totalTokenCount: 100 } };
const marked = ({ title = 'Forms', summary = 'Sum', body }) => `@@TITLE@@\n${title}\n@@SUMMARY@@\n${summary}\n@@BODY@@\n${body}\n@@END@@`;
const EN_OK = '<h2>Forms</h2><p>Open the menu.</p><img src="__MEDIA_0__" alt="left menu"><p>Click "Create".</p><img src="__MEDIA_1__" alt="create dialog">';

function articleCalls() {
  return generateGeminiText.mock.calls.filter((c) => c[0].feature === 'help_translate');
}

describe('maskMediaUrls / restoreMediaUrls', () => {
  it('che mọi src và poster theo thứ tự, trả lại đúng URL gốc', () => {
    const html = `<img src="${URL_A}"><video src="${URL_B}" poster="/p.png"></video>`;
    const { masked, urls } = maskMediaUrls(html);
    expect(urls).toEqual([URL_A, URL_B, '/p.png']);
    expect(masked).toBe('<img src="__MEDIA_0__"><video src="__MEDIA_1__" poster="__MEDIA_2__"></video>');
    expect(restoreMediaUrls(masked, urls)).toBe(html);
  });

  it('URL có ký tự $ được trả vào nguyên văn (không bị hiểu là mẫu thay thế)', () => {
    const { masked, urls } = maskMediaUrls('<img src="/a$&b$1.png">');
    expect(restoreMediaUrls(masked, urls)).toBe('<img src="/a$&b$1.png">');
  });

  it('thiếu một mã → null (mất ảnh)', () => {
    expect(restoreMediaUrls('<img src="__MEDIA_0__">', [URL_A, URL_B])).toBeNull();
  });

  it('lặp một mã → null (ảnh nhân đôi)', () => {
    expect(restoreMediaUrls('<img src="__MEDIA_0__"><img src="__MEDIA_0__">', [URL_A, URL_B])).toBeNull();
  });

  it('mã lạ (vượt số URL) → null', () => {
    expect(restoreMediaUrls('<img src="__MEDIA_0__"><img src="__MEDIA_7__">', [URL_A])).toBeNull();
  });

  it('không có ảnh nào → giữ nguyên thân bài', () => {
    expect(restoreMediaUrls('<p>x</p>', [])).toBe('<p>x</p>');
  });
});

describe('parseTranslationOutput', () => {
  it('đọc đầu ra theo mốc; thân bài giữ nguyên dấu " (không phải thoát)', () => {
    const out = parseTranslationOutput(marked({ body: '<p>Do not skip "Identity role"</p>' }), 'body_html');
    expect(out).toEqual({ title: 'Forms', summary: 'Sum', body: '<p>Do not skip "Identity role"</p>' });
  });

  it('thiếu mốc @@END@@ (bị cắt) → null', () => {
    expect(parseTranslationOutput('@@TITLE@@\nT\n@@SUMMARY@@\nS\n@@BODY@@\n<p>dở', 'body_html')).toBeNull();
  });

  it('model lỡ trả JSON kiểu cũ vẫn nhận', () => {
    expect(parseTranslationOutput(JSON.stringify({ title: 'T', summary: '', body_html: '<p>x</p>' }), 'body_html'))
      .toEqual({ title: 'T', summary: '', body: '<p>x</p>' });
  });
});

describe('translateHelpArticle — che URL ảnh khi dịch', () => {
  beforeEach(() => {
    [generateGeminiText, record, ...Object.values(helpRepo)].forEach((fn) => fn.mockReset());
    helpRepo.findArticleById.mockImplementation(async (id) => (id === 1
      ? { id: 1, slug: 'bieu-mau', locale: 'vi', title: 'Biểu mẫu', summary: 'Tóm tắt', body_html: VI_HTML, is_published: false }
      : { id: 2, is_published: false }));
    helpRepo.findArticleBySlug.mockResolvedValue(null);
    helpRepo.createArticle.mockResolvedValue({ id: 2, is_published: false });
    helpRepo.listMedia.mockResolvedValue([]);
    record.mockResolvedValue(undefined);
  });

  it('model chỉ thấy mã __MEDIA_n__, không thấy URL; bản EN lưu đúng URL thật, đúng thứ tự', async () => {
    generateGeminiText.mockResolvedValue({ text: marked({ body: EN_OK }), modelName: 'm', raw });
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });

    const prompt = articleCalls()[0][0].userPrompt;
    expect(prompt).toContain('__MEDIA_0__');
    expect(prompt).toContain('__MEDIA_1__');
    expect(prompt).not.toContain('founderai.biz/file');

    const saved = helpRepo.createArticle.mock.calls[0][0];
    expect(saved.title).toBe('Forms');
    expect(saved.summary).toBe('Sum');
    const srcs = [...saved.body_html.matchAll(/src="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(srcs).toEqual([URL_A, URL_B]);
    expect(saved.body_html).not.toContain('__MEDIA_');
    expect(articleCalls()).toHaveLength(1);
  });

  it('lượt đầu làm MẤT một mã ảnh → dịch lại; lượt hai đủ → lưu, ghi token cả hai lượt', async () => {
    generateGeminiText
      .mockResolvedValueOnce({ text: marked({ body: '<p>Open.</p><img src="__MEDIA_0__">' }), modelName: 'm', raw })
      .mockResolvedValueOnce({ text: marked({ body: EN_OK }), modelName: 'm', raw });
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });

    expect(articleCalls()).toHaveLength(2);
    expect(record.mock.calls.filter((c) => c[2].feature === 'help_translate')).toHaveLength(2);
    expect(helpRepo.createArticle).toHaveBeenCalledTimes(1);
  });

  it(`cả ${HELP_TRANSLATE_MAX_ATTEMPTS} lượt đều lệch mã ảnh → 422 nói rõ là ảnh, KHÔNG lưu bản dịch`, async () => {
    generateGeminiText.mockResolvedValue({ text: marked({ body: '<img src="__MEDIA_0__"><img src="__MEDIA_0__">' }), modelName: 'm', raw });
    await expect(translateHelpArticle(1, { locale: 'en', actorUserId: 5 }))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining('ảnh') });
    expect(articleCalls()).toHaveLength(HELP_TRANSLATE_MAX_ATTEMPTS);
    expect(helpRepo.createArticle).not.toHaveBeenCalled();
    expect(helpRepo.updateArticle).not.toHaveBeenCalled();
  });

  it(`cả ${HELP_TRANSLATE_MAX_ATTEMPTS} lượt đều sai định dạng → 422 sai định dạng, KHÔNG lưu`, async () => {
    generateGeminiText.mockResolvedValue({ text: '{"title": "Forms", "body_html": "<p class="x">vỡ</p>"', modelName: 'm', raw });
    await expect(translateHelpArticle(1, { locale: 'en', actorUserId: 5 }))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining('định dạng') });
    expect(articleCalls()).toHaveLength(HELP_TRANSLATE_MAX_ATTEMPTS);
    expect(helpRepo.createArticle).not.toHaveBeenCalled();
  });

  it('prompt hệ thống đòi đúng mốc và giữ mã ảnh; không bật JSON mode', async () => {
    generateGeminiText.mockResolvedValue({ text: marked({ body: EN_OK }), modelName: 'm', raw });
    await translateHelpArticle(1, { locale: 'en', actorUserId: 5 });
    const args = articleCalls()[0][0];
    for (const marker of ['@@TITLE@@', '@@SUMMARY@@', '@@BODY@@', '@@END@@', '__MEDIA_0__']) {
      expect(args.systemPrompt).toContain(marker);
    }
    expect(args.jsonMode).toBeFalsy();
  });
});
