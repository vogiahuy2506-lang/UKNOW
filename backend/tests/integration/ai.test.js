/**
 * Integration tests cho `/api/ai/*` — Batch F.
 *
 * Phạm vi:
 *   - POST /api/ai/chat              (admin + user role, RAG context, Gemini error)
 *   - POST /api/ai/generate-campaign (validate prompt, Gemini fetch happy/error)
 *   - GET  /api/ai/business-profile  (null & existing)
 *   - PUT  /api/ai/business-profile  (upsert + re-embed + bulk insert chunks)
 *
 * Mock strategy (3 lớp):
 *   1. `axios` (cho `_runChat` trong chat) → `jest.unstable_mockModule`.
 *   2. Global `fetch` (cho `geminiClient.util` + `embeddingClient.util`,
 *      đều là Node 18+ built-in) → `global.fetch = jest.fn()` per test.
 *   3. `businessProfile.repository` → mock module để bypass pgvector
 *      (test DB không có extension; nếu mock thì cũng kiểm chứng được
 *      service-level orchestration).
 *
 * Endpoint `POST /execute-campaign` không test ở đây — vốn chỉ là wrapper
 * gọi `campaignController.create/.run`, đã được cover trong campaign.test.js.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';

process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_MODEL = 'gemini-2.0-flash';

// ─── Mock axios (cho aiCampaign._runChat) ──────────────────────────────
const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { post: mockAxiosPost, get: mockAxiosGet },
}));

// ─── Mock businessProfile.repository (bypass pgvector) ─────────────────
const mockFindByUserId = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteChunksByUserId = jest.fn();
const mockInsertChunks = jest.fn();
const mockSearchSimilarChunks = jest.fn();
jest.unstable_mockModule('../../src/repositories/ai/businessProfile.repository.js', () => ({
  default: {
    findByUserId: mockFindByUserId,
    upsert: mockUpsert,
    deleteChunksByUserId: mockDeleteChunksByUserId,
    insertChunks: mockInsertChunks,
    searchSimilarChunks: mockSearchSimilarChunks,
  },
}));

// Dynamic import sau khi mocks đã đăng ký.
const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let originalFetch;

beforeAll(() => {
  app = createApp();
  originalFetch = global.fetch;
});

beforeEach(async () => {
  await truncateAll();
  mockAxiosPost.mockReset();
  mockAxiosGet.mockReset();
  mockFindByUserId.mockReset();
  mockUpsert.mockReset();
  mockDeleteChunksByUserId.mockReset();
  mockInsertChunks.mockReset();
  mockSearchSimilarChunks.mockReset();
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

/** Vector deterministic 768-dim cho test (toàn 0.01). */
const FAKE_EMBEDDING = new Array(768).fill(0.01);

/**
 * Trả về 1 Gemini response giả qua axios.post (cho chat).
 * `text` được encode thành format candidates[0].content.parts[0].text.
 */
function fakeGeminiAxiosResponse(jsonText) {
  return {
    data: {
      candidates: [
        {
          content: { parts: [{ text: jsonText }] },
          finishReason: 'STOP',
        },
      ],
    },
  };
}

/** Tương tự nhưng cho fetch (generateGeminiContent). */
function fakeGeminiFetchResponse(jsonText) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: { parts: [{ text: jsonText }] },
          finishReason: 'STOP',
        },
      ],
    }),
    text: async () => '',
  };
}

/** Fetch trả về embedding 768-dim. */
function fakeEmbeddingFetchResponse(values = FAKE_EMBEDDING) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embedding: { values } }),
    text: async () => '',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/chat
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/ai/chat', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/ai/chat').send({ history: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });

  it('thiếu history → 400 "Thiếu lịch sử trò chuyện"', async () => {
    const user = await createUser({ username: 'ai-chat-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Thiếu lịch sử/);
  });

  it('user role không có business profile → vẫn gọi Gemini, trả về JSON parsed', async () => {
    const user = await createUser({ username: 'ai-chat-2' });
    mockFindByUserId.mockResolvedValue(null); // user chưa có profile → bỏ qua RAG
    const token = await loginAs(user);
    mockAxiosPost.mockResolvedValueOnce(
      fakeGeminiAxiosResponse('{"type":"text","content":"Xin chào!","missing_fields":[],"data":null}')
    );
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'hello' }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      type: 'text',
      content: 'Xin chào!',
      missing_fields: [],
      data: null,
    });
    // Verify Gemini được gọi với history đã map role 'user'.
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockAxiosPost.mock.calls[0];
    expect(url).toMatch(/generativelanguage\.googleapis\.com/);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('hello');
  });

  it('user role có business profile + chunks → systemPrompt chứa "THÔNG TIN DOANH NGHIỆP"', async () => {
    const user = await createUser({ username: 'ai-chat-3' });
    mockFindByUserId.mockResolvedValue({
      id: 1, user_id: user.id, company_name: 'ACME', industry: 'AI',
    });
    mockSearchSimilarChunks.mockResolvedValue([
      { chunk_text: 'Tên công ty: ACME', metadata: { field: 'company_name' }, similarity: 0.95 },
      { chunk_text: 'Ngành: AI Coaching', metadata: { field: 'industry' }, similarity: 0.85 },
    ]);
    global.fetch.mockResolvedValueOnce(fakeEmbeddingFetchResponse()); // query embedding
    mockAxiosPost.mockResolvedValueOnce(
      fakeGeminiAxiosResponse('{"type":"text","content":"ok","missing_fields":[],"data":null}')
    );

    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'Tạo email khuyến mãi cho ACME' }] });
    expect(res.status).toBe(200);

    expect(mockFindByUserId).toHaveBeenCalledWith(user.id);
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith(user.id, FAKE_EMBEDDING, 5);
    // System prompt phải chứa context doanh nghiệp.
    const [, body] = mockAxiosPost.mock.calls[0];
    expect(body.systemInstruction.parts[0].text).toMatch(/THÔNG TIN DOANH NGHIỆP/);
    expect(body.systemInstruction.parts[0].text).toMatch(/Tên công ty: ACME/);
  });

  it('embedText lỗi → vẫn gọi Gemini với contextBlock rỗng (swallow)', async () => {
    const user = await createUser({ username: 'ai-chat-4' });
    mockFindByUserId.mockResolvedValue({ id: 1, user_id: user.id, company_name: 'X' });
    global.fetch.mockRejectedValueOnce(new Error('Embedding API down'));
    mockAxiosPost.mockResolvedValueOnce(
      fakeGeminiAxiosResponse('{"type":"text","content":"hi","missing_fields":[],"data":null}')
    );
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'msg' }] });
    expect(res.status).toBe(200);
    // Không nên có search call nào vì embedText fail trước đó.
    expect(mockSearchSimilarChunks).not.toHaveBeenCalled();
    // System prompt KHÔNG chứa context block.
    const [, body] = mockAxiosPost.mock.calls[0];
    expect(body.systemInstruction.parts[0].text).not.toMatch(/THÔNG TIN DOANH NGHIỆP/);
  });

  it('Gemini trả về promptFeedback.blockReason → 500 "Yêu cầu bị chặn"', async () => {
    const user = await createUser({ username: 'ai-chat-5' });
    mockFindByUserId.mockResolvedValue(null);
    mockAxiosPost.mockResolvedValueOnce({
      data: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } },
    });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'bad' }] });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Yêu cầu bị chặn: SAFETY/);
  });

  it('Gemini API lỗi 500 → bubble lên 500 với message "Gemini API Error"', async () => {
    const user = await createUser({ username: 'ai-chat-6' });
    mockFindByUserId.mockResolvedValue(null);
    const err = new Error('500');
    err.response = { status: 500, data: { error: { message: 'server fail' } } };
    mockAxiosPost.mockRejectedValueOnce(err);
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Gemini API Error/);
  });

  it('role=admin → adminContext (KPI nền tảng) inject vào prompt; vẫn gọi Gemini', async () => {
    const admin = await createUser({ username: 'ai-chat-admin', role: 'admin' });
    mockAxiosPost.mockResolvedValueOnce(
      fakeGeminiAxiosResponse('{"type":"text","content":"Báo cáo nền tảng","missing_fields":[],"data":null}')
    );
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ history: [{ role: 'user', content: 'Tình hình nền tảng?' }] });
    expect(res.status).toBe(200);
    const [, body] = mockAxiosPost.mock.calls[0];
    // Admin context block: phải có "Founder AI AI" header hoặc dấu hiệu admin.
    expect(body.systemInstruction.parts[0].text).toMatch(/(System Admin|Trợ lý thông minh|Founder AI AI)/);
    // RAG repo không được gọi với admin.
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/ai/generate-campaign
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/ai/generate-campaign', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/ai/generate-campaign').send({ prompt: 'x' });
    expect(res.status).toBe(401);
  });

  it('thiếu prompt → 400 "Vui lòng nhập yêu cầu cho AI"', async () => {
    const user = await createUser({ username: 'ai-gen-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/generate-campaign')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Vui lòng nhập yêu cầu/);
  });

  it('happy path → gọi Gemini qua fetch, trả về script JSON parsed', async () => {
    const user = await createUser({ username: 'ai-gen-2' });
    mockFindByUserId.mockResolvedValue(null); // không có RAG
    global.fetch.mockResolvedValueOnce(
      fakeGeminiFetchResponse(JSON.stringify({
        campaignName: 'Khuyến mãi tháng 5',
        description: 'Promo May',
        campaignType: 'mixed',
        nodes: [],
        connections: [],
        landingPage: { title: 'LP', html: '<p>x</p>', css: '' },
      }))
    );
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/generate-campaign')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'Tạo chiến dịch khuyến mãi tháng 5' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      campaignName: 'Khuyến mãi tháng 5',
      campaignType: 'mixed',
    });
    // Verify fetch được gọi với responseMimeType=application/json + temperature=0.7.
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/generativelanguage\.googleapis\.com/);
    expect(url).toMatch(/:generateContent/);
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.temperature).toBe(0.7);
  });

  it('Gemini trả 500 → 502 "Gemini API lỗi (500)"', async () => {
    const user = await createUser({ username: 'ai-gen-3' });
    mockFindByUserId.mockResolvedValue(null);
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal',
      text: async () => 'boom',
      json: async () => ({}),
    });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/generate-campaign')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/Gemini API lỗi \(500\)/);
  });

  it('_parseJson recover từ output có markdown fence ```json {...} ```', async () => {
    const user = await createUser({ username: 'ai-gen-4' });
    mockFindByUserId.mockResolvedValue(null);
    global.fetch.mockResolvedValueOnce(
      fakeGeminiFetchResponse('```json\n{"campaignName":"X","nodes":[],"connections":[]}\n```')
    );
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/ai/generate-campaign')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe('X');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/ai/business-profile
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/ai/business-profile', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/ai/business-profile');
    expect(res.status).toBe(401);
  });

  it('user chưa có profile → 200 data:null', async () => {
    const user = await createUser({ username: 'ai-bp-1' });
    mockFindByUserId.mockResolvedValue(null);
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/ai/business-profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('user có profile → 200 trả full row', async () => {
    const user = await createUser({ username: 'ai-bp-2' });
    const profileRow = {
      id: 1,
      user_id: user.id,
      company_name: 'ACME Vietnam',
      industry: 'EdTech',
      products: 'AI Coaching',
      target_audience: 'SMB owners',
      tone: 'friendly',
      brand_color: '#FF6600',
      extra_context: null,
    };
    mockFindByUserId.mockResolvedValue(profileRow);
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/ai/business-profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      company_name: 'ACME Vietnam',
      industry: 'EdTech',
      tone: 'friendly',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/ai/business-profile
// ═══════════════════════════════════════════════════════════════════════
describe('PUT /api/ai/business-profile', () => {
  it('không token → 401', async () => {
    const res = await request(app).put('/api/ai/business-profile').send({});
    expect(res.status).toBe(401);
  });

  it('happy path → upsert + embed nhiều chunks + insertChunks lưu vector', async () => {
    const user = await createUser({ username: 'ai-bp-save-1' });
    const upsertedProfile = {
      id: 1, user_id: user.id,
      company_name: 'ACME', industry: 'EdTech', products: 'AI',
      target_audience: 'SMB', tone: 'friendly', brand_color: '#fff',
      extra_context: 'Đoạn 1\n\nĐoạn 2',
    };
    mockUpsert.mockResolvedValueOnce(upsertedProfile);
    // 6 chunks: company, industry, products, target, brand(combined), extra×2.
    global.fetch.mockResolvedValue(fakeEmbeddingFetchResponse());
    mockDeleteChunksByUserId.mockResolvedValue();
    mockInsertChunks.mockResolvedValue();

    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/ai/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_name: 'ACME',
        industry: 'EdTech',
        products: 'AI',
        target_audience: 'SMB',
        tone: 'friendly',
        brand_color: '#fff',
        extra_context: 'Đoạn 1\n\nĐoạn 2',
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Đã lưu/);
    expect(res.body.data.company_name).toBe('ACME');

    expect(mockUpsert).toHaveBeenCalledWith(user.id, expect.objectContaining({ company_name: 'ACME' }));
    expect(mockDeleteChunksByUserId).toHaveBeenCalledWith(user.id);
    expect(mockInsertChunks).toHaveBeenCalledTimes(1);
    const [, chunksArg] = mockInsertChunks.mock.calls[0];
    // 7 chunks: company_name, industry, products, target_audience, brand combined,
    //          2 extra_context paragraphs (split by \n{2,}).
    expect(chunksArg).toHaveLength(7);
    expect(chunksArg[0]).toMatchObject({
      text: expect.stringContaining('ACME'),
      embedding: FAKE_EMBEDDING,
    });
    expect(chunksArg[5]).toMatchObject({ text: 'Đoạn 1', metadata: { field: 'extra_context', index: 0 } });
    expect(chunksArg[6]).toMatchObject({ text: 'Đoạn 2', metadata: { field: 'extra_context', index: 1 } });
    // fetch (embed) gọi 7 lần (Promise.all map).
    expect(global.fetch).toHaveBeenCalledTimes(7);
  });

  it('profile toàn null → upsert lưu nhưng không insertChunks (chunks=0)', async () => {
    const user = await createUser({ username: 'ai-bp-save-2' });
    mockUpsert.mockResolvedValueOnce({
      id: 1, user_id: user.id,
      company_name: null, industry: null, products: null,
      target_audience: null, tone: null, brand_color: null, extra_context: null,
    });
    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/ai/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockDeleteChunksByUserId).not.toHaveBeenCalled();
    expect(mockInsertChunks).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('embedText fail giữa chừng → 500, profile vẫn được upsert (không transactional)', async () => {
    const user = await createUser({ username: 'ai-bp-save-3' });
    mockUpsert.mockResolvedValueOnce({
      id: 1, user_id: user.id, company_name: 'X', industry: 'Y',
    });
    global.fetch.mockRejectedValue(new Error('Embedding down'));
    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/ai/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_name: 'X', industry: 'Y' });
    expect(res.status).toBe(500);
    // Profile đã được upsert trước khi embedTexts throw.
    expect(mockUpsert).toHaveBeenCalled();
    // insertChunks không nên được gọi.
    expect(mockInsertChunks).not.toHaveBeenCalled();
  });
});
