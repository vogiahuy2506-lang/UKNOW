/**
 * Integration tests for help center (schema + publish filter + unanswered).
 * Embeddings/Gemini are mocked — no external API.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

const mockEmbedText = jest.fn(async (text) => {
  // Deterministic tiny vector padded to 768
  const v = new Array(768).fill(0);
  v[0] = String(text || '').length % 97;
  v[1] = 1;
  return v;
});
const mockEmbedTexts = jest.fn(async (texts) => Promise.all(texts.map((t) => mockEmbedText(t))));

jest.unstable_mockModule('../../src/utils/embeddingClient.util.js', () => ({
  embedText: mockEmbedText,
  embedTexts: mockEmbedTexts,
}));

const mockGenerate = jest.fn();
jest.unstable_mockModule('../../src/services/help/geminiText.util.js', () => ({
  generateGeminiText: mockGenerate,
}));

jest.unstable_mockModule('../../src/services/ai/aiUsageMeter.service.js', () => ({
  default: { record: jest.fn(), reserve: jest.fn() },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { reindexArticle, _clearCapabilityMapCache } = await import('../../src/services/help/helpCenter.service.js');
const helpRepo = await import('../../src/repositories/help/helpArticle.repository.js');
const { tryHandleHelpChat } = await import('../../src/services/help/helpAssistant.service.js');

let app;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

describe('Help center', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await truncateAll();
    _clearCapabilityMapCache();
    helpRepo._resetEmbeddingStorageCache();
    mockEmbedText.mockClear();
    mockEmbedTexts.mockClear();
    mockGenerate.mockReset();
  });

  it('public list only shows published; unpublish removes from RAG search', async () => {
    const a = await helpRepo.createArticle({
      slug: 'zalo-account',
      title: 'Zalo',
      summary: 'Kết nối Zalo',
      body_md: '# Zalo\nHướng dẫn kết nối tài khoản Zalo và khung giờ yên lặng 23h-6h.',
      feature_key: 'zalo-account',
      is_published: true,
    });
    const b = await helpRepo.createArticle({
      slug: 'draft-only',
      title: 'Draft',
      summary: 'Nháp',
      body_md: 'Nội dung nháp',
      feature_key: 'draft',
      is_published: false,
    });

    await reindexArticle(a.id);
    await reindexArticle(b.id);

    const pub = await request(app).get('/api/help/articles');
    expect(pub.status).toBe(200);
    expect(pub.body.result.map((x) => x.slug)).toEqual(['zalo-account']);

    const chunksBefore = await helpRepo.searchPublishedChunks(await mockEmbedText('zalo'), {
      minSimilarity: 0,
      limit: 5,
    });
    expect(chunksBefore.some((c) => c.slug === 'zalo-account')).toBe(true);
    expect(chunksBefore.some((c) => c.slug === 'draft-only')).toBe(false);

    await helpRepo.updateArticle(a.id, { is_published: false });
    const chunksAfter = await helpRepo.searchPublishedChunks(await mockEmbedText('zalo'), {
      minSimilarity: 0,
      limit: 5,
    });
    expect(chunksAfter.some((c) => c.slug === 'zalo-account')).toBe(false);
  });

  it('reindex only touches one article chunk count', async () => {
    const a = await helpRepo.createArticle({
      slug: 'a1',
      title: 'A',
      summary: 'A',
      body_md: 'Ngắn A',
      feature_key: 'a',
      is_published: true,
    });
    const b = await helpRepo.createArticle({
      slug: 'b1',
      title: 'B',
      summary: 'B',
      body_md: `${'Đoạn B dài. '.repeat(80)}`,
      feature_key: 'b',
      is_published: true,
    });
    await reindexArticle(a.id);
    await reindexArticle(b.id);
    const bCount1 = await helpRepo.countChunksByArticleId(b.id);

    await helpRepo.updateArticle(b.id, { body_md: 'B ngắn lại' });
    await reindexArticle(b.id);
    const bCount2 = await helpRepo.countChunksByArticleId(b.id);
    const aCount = await helpRepo.countChunksByArticleId(a.id);

    expect(aCount).toBe(1);
    expect(bCount2).toBe(1);
    expect(bCount1).toBeGreaterThan(bCount2);
  });

  it('hỏi_đáp với tài liệu → trả lời kèm slug; không có tài liệu → ghi unanswered', async () => {
    const article = await helpRepo.createArticle({
      slug: 'zalo-account',
      title: 'Thêm tài khoản Zalo',
      summary: 'Kết nối Zalo',
      body_md: '# Zalo\n## Các bước\n1. Quét QR\n## Lỗi thường gặp\n- Dừng đêm → khung giờ yên lặng 23h-6h',
      feature_key: 'zalo-account',
      is_published: true,
    });
    await reindexArticle(article.id);

    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'gemini-2.5-flash', raw: {} })
      .mockResolvedValueOnce({
        text: 'Hãy quét QR tại kênh gửi. Xem /huong-dan/zalo-account',
        modelName: 'gemini-2.5-flash',
        raw: {},
      });

    const user = await createUser({ username: 'help-user' });
    const ok = await tryHandleHelpChat({
      history: [{ role: 'user', content: 'Làm sao thêm tài khoản Zalo?' }],
      userId: user.id,
    });
    expect(ok.type).toBe('text');
    expect(ok.data.sources.some((s) => s.slug === 'zalo-account')).toBe(true);

    mockGenerate.mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'x', raw: {} });
    // Force no chunks by asking nonsense after clearing articles
    await helpRepo.updateArticle(article.id, { is_published: false });
    const miss = await tryHandleHelpChat({
      history: [{ role: 'user', content: 'Cách xuất hoá đơn đỏ?' }],
      userId: user.id,
    });
    expect(miss.data.unanswered).toBe(true);
    const unanswered = await db.query(`SELECT question FROM help_unanswered`);
    expect(unanswered.rows.some((r) => r.question.includes('hoá đơn'))).toBe(true);
  });

  it('ngoài_phạm_vi không ghi help_unanswered', async () => {
    mockGenerate.mockResolvedValueOnce({ text: 'ngoài_phạm_vi', modelName: 'x', raw: {} });
    const user = await createUser({ username: 'help-weather' });
    const res = await tryHandleHelpChat({
      history: [{ role: 'user', content: 'Thời tiết Hà Nội hôm nay?' }],
      userId: user.id,
    });
    expect(res.data.helpRoute).toBe('ngoài_phạm_vi');
    const unanswered = await db.query(`SELECT COUNT(*)::int AS n FROM help_unanswered`);
    expect(unanswered.rows[0].n).toBe(0);
  });

  it('admin can seed articles', async () => {
    const admin = await createUser({ username: 'help-admin', role: 'admin' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/help/admin/seed')
      .set('Authorization', `Bearer ${token}`)
      .send({ reindex: false });
    expect(res.status).toBe(200);
    // 9 nhóm-1 articles trong helpSeed.data.js
    expect(res.body.result.length).toBe(9);
    const pub = await request(app).get('/api/help/articles');
    expect(pub.body.result.length).toBe(9);
  });

  it('body_html persists through create/update/public API and is sanitized', async () => {
    const admin = await createUser({ username: 'help-html-admin', role: 'admin' });
    const token = await loginAs(admin);

    const created = await request(app)
      .post('/api/help/admin/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'html-article',
        title: 'HTML Article',
        summary: 's',
        feature_key: 'html-article',
        is_published: true,
        body_html: '<p><strong>Hello</strong></p><script>alert(1)</script>',
        body_md: '',
      });
    expect(created.status).toBe(201);
    const id = created.body.result.id;
    expect(created.body.result.body_html).toContain('<strong>Hello</strong>');
    expect(created.body.result.body_html.toLowerCase()).not.toContain('script');

    const patched = await request(app)
      .patch(`/api/help/admin/articles/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body_html: '<p>Updated</p><img src=x onerror="alert(1)">' });
    expect(patched.status).toBe(200);
    expect(patched.body.result.body_html).toContain('Updated');
    expect(patched.body.result.body_html.toLowerCase()).not.toContain('onerror');

    const pub = await request(app).get('/api/help/articles/html-article');
    expect(pub.status).toBe(200);
    expect(pub.body.result.bodyHtml).toContain('Updated');
    expect(pub.body.result.bodyHtml.toLowerCase()).not.toContain('onerror');

    const chunks = await helpRepo.countChunksByArticleId(id);
    expect(chunks).toBeGreaterThan(0);
  });

  it('seed markdown articles still expose bodyMd without bodyHtml', async () => {
    const admin = await createUser({ username: 'help-md-admin', role: 'admin' });
    const token = await loginAs(admin);
    await request(app)
      .post('/api/help/admin/seed')
      .set('Authorization', `Bearer ${token}`)
      .send({ reindex: false });
    const list = await request(app).get('/api/help/articles');
    const slug = list.body.result[0].slug;
    const article = await request(app).get(`/api/help/articles/${slug}`);
    expect(article.status).toBe(200);
    expect(article.body.result.bodyMd).toBeTruthy();
    expect(article.body.result.bodyHtml == null || article.body.result.bodyHtml === '').toBe(true);
  });

  it('POST /uploads/help-image rejects non-admin', async () => {
    const user = await createUser({ username: 'help-upload-user', role: 'user' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/uploads/help-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('POST /uploads/help-image rejects svg for admin', async () => {
    const admin = await createUser({ username: 'help-upload-admin', role: 'admin' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/uploads/help-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<svg></svg>'), {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      });
    expect(res.status).toBe(400);
  });
});
