/**
 * PR-9 (B-4) — luồng NDJSON của POST /api/ai/generate-landing-html trên app THẬT (middleware, JWT, kiểm credit, ghi phiên, trừ credit)
 * + Postgres THẬT. Gemini được giả lập bằng global.fetch. Unit test mock trọn CSDL và credit nên không thấy được: (a) dòng `usage_logs`
 * `ai_credit` thật sự chỉ có MỘT dòng cho một lượt (kể cả bấm lại cùng requestId), (b) client đóng kết nối thì KHÔNG có dòng credit nào và
 * fetch tới Google bị huỷ thật, (c) thứ tự middleware: bấm lại cùng requestId nhận được kết quả cũ kể cả khi đã hết credit.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { resetLandingTurnsForTest } from '../../src/services/ai/aiLandingTurn.service.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';
import { NDJSON, until, openNdjsonClient } from '../../src/services/ai/__tests__/helpers/ndjsonTestClient.js';

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;

const PAGE_HTML =
  '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<title>Khoá học AI</title><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Khoá học AI</h1>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận thông tin</label>' +
  '<button type="submit">Đăng ký</button></form></body></html>';

const geminiReply = () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Khoá học AI', html: PAGE_HTML }) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2000, totalTokenCount: 3000 },
  }),
});

const embeddingReply = () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ embedding: { values: Array(768).fill(0.01) }, usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 } }),
});

/** Gemini giả: `mode` = 'ok' (trả trang) | 'hang' (treo tới khi bị huỷ — như Google chậm). Ghi lại signal của lượt generateContent. */
function installGemini(mode = 'ok') {
  const state = { generateCalls: 0, signals: [] };
  global.fetch = jest.fn(async (url, init) => {
    const target = String(url);
    if (target.includes(':embedContent')) return embeddingReply();
    if (target.includes(':generateContent')) {
      state.generateCalls += 1;
      state.signals.push(init?.signal);
      if (mode === 'hang') {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
        });
      }
      return geminiReply();
    }
    throw new Error(`fetch không được giả lập: ${target}`);
  });
  return state;
}

const creditRows = async () => (await db.query(
  `SELECT id_user, delta FROM usage_logs WHERE resource_type = 'ai_credit' ORDER BY id`
)).rows;
const sessionMessages = async (sessionId) => (await db.query(
  `SELECT role, type FROM ai_chat_messages WHERE session_id = $1 ORDER BY id`, [sessionId]
)).rows;

const token = (user) => jwt.sign({ userId: user.id, email: user.email, role: user.role || 'user' }, process.env.JWT_SECRET || 'test-jwt-secret');

describe('POST /api/ai/generate-landing-html — luồng NDJSON (PR-9)', () => {
  let server;
  let port;
  let user;
  let auth;

  beforeEach(async () => {
    await truncateAll();
    resetLandingTurnsForTest();
    process.env.GEMINI_API_KEY = 'test-key-pr9';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = await createPlan({ code: `pr9_${Date.now()}`, name: 'Goi PR-9', aiCreditsPerPeriod: 100 });
    user = await createUser({ username: `pr9user${Date.now()}`, planId: plan.id });
    await assignPlanToUser(user.id, plan.id);
    auth = { authorization: `Bearer ${token(user)}` };
    server = await new Promise((resolve) => {
      const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
    });
    port = server.address().port;
  });

  afterEach(async () => {
    await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  const gen = (body, opts = {}) => openNdjsonClient(port, {
    path: '/api/ai/generate-landing-html',
    body: { prompt: 'Trang giới thiệu khoá học AI', ...body },
    headers: auth,
    ...opts,
  });

  it('xin luồng: header NDJSON, dòng stage rồi result đúng hình dạng JSON cũ; đúng MỘT dòng credit; tin được lưu vào phiên', async () => {
    const gemini = installGemini('ok');
    const session = (await db.query(`INSERT INTO ai_chat_sessions (id_user, title) VALUES ($1, 'S') RETURNING id`, [user.id])).rows[0];

    const c = gen({ requestId: 'req-integration-0001', sessionId: session.id });
    await c.done;

    expect(c.status).toBe(200);
    expect(c.headers['content-type']).toContain(NDJSON);
    expect(c.headers['x-accel-buffering']).toBe('no');
    expect(c.headers['cache-control']).toBe('no-cache, no-transform');
    expect(c.types()).toContain('stage');
    const last = c.lines[c.lines.length - 1];
    expect(last.type).toBe('result');
    expect(last.success).toBe(true);
    expect(last.data.title).toBe('Khoá học AI');
    expect(last.data.html).toContain('data-founderai-capture');
    expect(typeof last.data.messageId).toBe('number');
    expect(gemini.generateCalls).toBe(1);

    const credits = await creditRows();
    expect(credits).toHaveLength(1);
    expect(Number(credits[0].id_user)).toBe(Number(user.id));
    expect(await sessionMessages(session.id)).toEqual([{ role: 'user', type: null }, { role: 'assistant', type: 'landing_page' }]);
  });

  it('bấm lại cùng requestId sau khi xong → nhận lại ĐÚNG kết quả, Gemini vẫn 1 lần, credit vẫn 1 dòng, không lưu thêm tin', async () => {
    const gemini = installGemini('ok');
    const session = (await db.query(`INSERT INTO ai_chat_sessions (id_user, title) VALUES ($1, 'S') RETURNING id`, [user.id])).rows[0];
    const first = gen({ requestId: 'req-integration-0002', sessionId: session.id });
    await first.done;
    const again = gen({ requestId: 'req-integration-0002', sessionId: session.id });
    await again.done;

    expect(again.lines[again.lines.length - 1]).toEqual(first.lines[first.lines.length - 1]);
    expect(gemini.generateCalls).toBe(1);
    expect(await creditRows()).toHaveLength(1);
    expect(await sessionMessages(session.id)).toHaveLength(2);
  });

  it('hết credit chính vì lượt này (gói còn đúng 1 lượt) → bấm lại cùng requestId VẪN nhận trang đã trả tiền, không bị chặn "hết lượt"', async () => {
    const gemini = installGemini('ok');
    await db.query(`UPDATE plans SET ai_credits_per_period = 1 WHERE id = $1`, [user.active_plan_id]);
    const first = gen({ requestId: 'req-integration-0003' });
    await first.done;
    expect(first.lines[first.lines.length - 1].type).toBe('result');

    // Lượt MỚI (requestId khác) giờ phải bị chặn vì đã hết credit …
    const fresh = gen({ requestId: 'req-integration-0004' });
    await fresh.done;
    expect(fresh.status).toBeGreaterThanOrEqual(400);
    expect(fresh.headers['content-type']).toContain('application/json');

    // … còn bấm lại lượt đã trả tiền thì nhận kết quả cũ.
    const retry = gen({ requestId: 'req-integration-0003' });
    await retry.done;
    expect(retry.status).toBe(200);
    expect(retry.lines[retry.lines.length - 1].type).toBe('result');
    expect(gemini.generateCalls).toBe(1);
    expect(await creditRows()).toHaveLength(1);
  });

  it('client KHÔNG xin luồng (frontend cũ) → JSON một lần { success, data } như trước, 1 dòng credit', async () => {
    installGemini('ok');
    const c = gen({}, { accept: 'application/json' });
    await c.done;
    expect(c.status).toBe(200);
    expect(c.headers['content-type']).toContain('application/json');
    const body = JSON.parse(c.raw);
    expect(body.success).toBe(true);
    expect(body.data.html).toContain('data-founderai-capture');
    expect(await creditRows()).toHaveLength(1);
  });

  it('lỗi TRƯỚC luồng (thiếu prompt) → JSON 400 như cũ, không gọi Gemini, không trừ credit', async () => {
    const gemini = installGemini('ok');
    const c = gen({ prompt: '   ' });
    await c.done;
    expect(c.status).toBe(400);
    expect(c.headers['content-type']).toContain('application/json');
    expect(JSON.parse(c.raw).message).toMatch(/nhập mô tả/);
    expect(gemini.generateCalls).toBe(0);
    expect(await creditRows()).toHaveLength(0);
  });

  it('khách đóng kết nối khi Google còn đang chạy → fetch tới Google bị HUỶ thật; KHÔNG trừ credit, KHÔNG lưu phiên', async () => {
    const gemini = installGemini('hang');
    const session = (await db.query(`INSERT INTO ai_chat_sessions (id_user, title) VALUES ($1, 'S') RETURNING id`, [user.id])).rows[0];
    const c = gen({ requestId: 'req-integration-0005', sessionId: session.id });
    await until(() => c.status === 200 && gemini.signals.length === 1, { timeoutMs: 5000, label: 'luồng mở và Gemini bắt đầu chạy' });
    expect(gemini.signals[0].aborted).toBe(false);

    c.destroy();
    await until(() => gemini.signals[0].aborted, { timeoutMs: 5000, label: 'fetch tới Google bị huỷ sau khi khách đóng kết nối' });
    await new Promise((resolve) => { setTimeout(resolve, 150); });

    expect(await creditRows()).toHaveLength(0);
    expect(await sessionMessages(session.id)).toHaveLength(0);
    expect(gemini.generateCalls).toBe(1);
  });
});
