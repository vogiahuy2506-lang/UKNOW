/**
 * PR-5 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — POST /api/forms/ai-draft trên app THẬT (JWT, requireActivePlan, quyền `forms`,
 * kiểm + trừ credit, bộ đo token, hồ sơ doanh nghiệp) + Postgres THẬT. CHỈ Gemini được giả (global.fetch) — nên `runChat`, model
 * policy, `generateGeminiContent`, `aiUsageMeter`, `aiCreditMeter` và bộ chuẩn hoá biểu mẫu đều chạy bản thật.
 *
 * Unit test mock trọn CSDL và credit nên không thấy được: (a) sổ `usage_logs` thật sự có ĐÚNG MỘT dòng `ai_credit` cho một lượt thành
 * công và KHÔNG dòng nào khi nháp hỏng; (b) token Google luôn vào sổ `ai_token` dưới feature `form_draft` kể cả lượt hỏng (Google
 * vẫn tính tiền); (c) nhân viên bấm thì chi phí tính cho CHỦ, người bấm nằm ở `actor_user_id`; (d) hết credit chặn TRƯỚC khi gọi
 * Google; (e) route chỉ trả nháp — bảng `forms` không có thêm dòng nào.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;

const token = (user) => jwt.sign({ userId: user.id, email: user.email, role: user.role || 'user' }, process.env.JWT_SECRET || 'test-jwt-secret');

const CONSULT = {
  kind: 'consult',
  title: 'Đăng ký học thử tiếng Anh cho bé',
  description: 'Điền thông tin để trung tâm gọi lại tư vấn.',
  submitButtonText: 'Đăng ký học thử',
  successMessage: 'Cảm ơn bạn, trung tâm sẽ gọi lại sớm.',
  fields: [
    { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
    { label: 'Bé mấy tuổi?', type: 'number', required: true },
    { label: 'Khung giờ rảnh', type: 'checkbox', required: false, options: ['Sáng', 'Chiều', 'Tối'] },
  ],
};

/** Gemini giả: mỗi lời gọi generateContent trả `reply()` (chuỗi JSON của model). Đếm số lượt gọi thật. */
function installGemini(reply) {
  const state = { generateCalls: 0 };
  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    if (target.includes(':generateContent')) {
      state.generateCalls += 1;
      const text = typeof reply === 'function' ? reply(state.generateCalls) : reply;
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 600, totalTokenCount: 1400 },
        }),
      };
    }
    throw new Error(`fetch không được giả lập: ${target}`);
  });
  return state;
}

const creditRows = async () => (await db.query(
  `SELECT id_user, actor_user_id, delta, metadata->>'feature' AS feature
     FROM usage_logs WHERE resource_type = 'ai_credit' ORDER BY id`
)).rows;
// users.id là BIGINT → pg trả chuỗi; ép số ở cả hai phía để so sánh không phụ thuộc kiểu cột.
const tokenRows = async () => (await db.query(
  `SELECT id_user::int AS id_user, metadata->>'feature' AS feature, (metadata->>'actorUserId')::int AS actor
     FROM usage_logs WHERE resource_type = 'ai_token' ORDER BY id`
)).rows;
const formCount = async () => Number((await db.query('SELECT COUNT(*)::int AS n FROM forms')).rows[0].n);

let app;
let owner;
let ownerAuth;

const post = (body, headers = ownerAuth) => request(app).post('/api/forms/ai-draft').set(headers).send(body);

async function ownerWithCredits(limit) {
  const plan = await createPlan({ code: `aidraft_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name: 'Goi AI draft', aiCreditsPerPeriod: limit });
  const user = await createUser({ username: `aidraft${Date.now()}${Math.floor(Math.random() * 1000)}`, planId: plan.id });
  await assignPlanToUser(user.id, plan.id);
  return user;
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  process.env.GEMINI_API_KEY = 'test-key-form-draft';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  owner = await ownerWithCredits(10);
  ownerAuth = { authorization: `Bearer ${token(owner)}` };
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  jest.restoreAllMocks();
});

describe('POST /api/forms/ai-draft — app thật + Postgres thật', () => {
  it('create: trả NHÁP đã chuẩn hoá, KHÔNG ghi bảng forms; đúng MỘT dòng credit feature form_draft + token ghi sổ', async () => {
    const gemini = installGemini(() => JSON.stringify({
      ...CONSULT,
      // model cố tình trả thứ KHÔNG được phép: tiền + tài khoản thật, loại tải tệp, khoá lạ
      paymentConfig: { enabled: true, method: 'bank', amount: 5000000, bankBin: '970436', accountNumber: '0123456789012', accountName: 'NGUYEN VAN A' },
      theme: { primaryColor: '#ff0000' },
      fields: [...CONSULT.fields, { label: 'Tải CV', type: 'file', required: true }],
    }));

    const res = await post({ mode: 'create', description: 'Form đăng ký học thử tiếng Anh cho trẻ', locale: 'vi' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const draft = res.body.data;
    expect(draft).toMatchObject({
      mode: 'create',
      kind: 'consult',
      title: 'Đăng ký học thử tiếng Anh cho bé',
      bookingConfig: null,
      paymentConfig: null,
      needsAttention: [],
      usage: { creditCost: 1 },
    });
    expect(draft.settings).toMatchObject({ consentEnabled: true, notifyOwner: true, submitButtonText: 'Đăng ký học thử' });
    expect(draft.fields.map((f) => f.type)).toEqual(['short_text', 'phone', 'number', 'checkbox']);
    expect(JSON.stringify(draft)).not.toMatch(/0123456789012|970436|NGUYEN VAN A|fileConfig/);

    expect(gemini.generateCalls).toBe(1);
    expect(await formCount()).toBe(0);
    const credits = await creditRows();
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ id_user: owner.id, delta: 1, feature: 'form_draft' });
    expect(await tokenRows()).toEqual([{ id_user: Number(owner.id), feature: 'form_draft', actor: Number(owner.id) }]);
  });

  it('loại thu tiền: nháp KHÔNG có paymentConfig, kèm nhắc cần khai; loại đặt lịch: khung giờ mặc định của mẫu + nhắc', async () => {
    installGemini(() => JSON.stringify({ ...CONSULT, kind: 'payment' }));
    let res = await post({ mode: 'create', description: 'Đặt cọc khoá học' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: 'payment', paymentConfig: null, needsAttention: ['payment'], bookingConfig: null });

    installGemini(() => JSON.stringify({ ...CONSULT, kind: 'booking', bookingConfig: { enabled: true, weeklySlots: { 0: ['03:00'] } } }));
    res = await post({ mode: 'create', description: 'Đặt lịch tư vấn', kind: 'booking' });
    expect(res.status).toBe(200);
    expect(res.body.data.needsAttention).toEqual(['booking']);
    expect(res.body.data.bookingConfig.weeklySlots['1']).toEqual(['09:00', '14:00']);
    expect(res.body.data.bookingConfig.weeklySlots['0']).toEqual([]);
    expect(res.body.data.paymentConfig).toBeNull();
    expect(await formCount()).toBe(0);
  });

  it('suggest_questions + rewrite: mỗi lượt đúng MỘT credit, đúng hình dạng, vẫn không ghi forms', async () => {
    const existingForm = {
      title: 'Đăng ký',
      description: '',
      fields: [
        { key: 'f_name0001', type: 'short_text', label: 'ten', required: true, role: 'name' },
        { key: 'f_phon0002', type: 'phone', label: 'sdt', required: true, role: 'phone' },
      ],
    };
    installGemini(() => JSON.stringify({
      fields: [
        { label: 'Họ và tên', type: 'short_text' }, // trùng nhãn "ten"? không — khác chữ → vẫn là câu mới
        { label: 'Số điện thoại liên hệ', type: 'phone' }, // đã có ô SĐT → bị loại
        { label: 'Bé học lớp mấy?', type: 'short_text', required: true },
      ],
    }));
    let res = await post({ mode: 'suggest_questions', existingForm, description: 'hỏi về bé' });
    expect(res.status).toBe(200);
    expect(res.body.data.fields.map((f) => f.label)).toEqual(['Họ và tên', 'Bé học lớp mấy?']);
    expect(res.body.data.fields.every((f) => !('key' in f))).toBe(true);
    // vai trò name đã có ở biểu mẫu hiện tại → câu "Họ và tên" mới không được cướp vai trò
    expect(res.body.data.fields[0].role).toBeUndefined();

    installGemini(() => JSON.stringify({
      fields: [
        { index: 0, label: 'Họ và tên của bạn', type: 'email', required: false, key: 'hacked' },
        { index: 1, label: 'Số điện thoại liên hệ' },
      ],
    }));
    res = await post({ mode: 'rewrite', existingForm });
    expect(res.status).toBe(200);
    expect(res.body.data.fields).toEqual([
      { key: 'f_name0001', label: 'Họ và tên của bạn', type: 'short_text', required: true, role: 'name' },
      { key: 'f_phon0002', label: 'Số điện thoại liên hệ', type: 'phone', required: true, role: 'phone' },
    ]);

    const credits = await creditRows();
    expect(credits).toHaveLength(2);
    expect(credits.every((c) => c.feature === 'form_draft' && Number(c.delta) === 1)).toBe(true);
    expect(await formCount()).toBe(0);
  });

  it('model trả rác / thiếu fields → 502, KHÔNG trừ credit nhưng token Google VẪN vào sổ', async () => {
    installGemini(() => 'Xin lỗi, tôi không làm được');
    const res = await post({ mode: 'create', description: 'Form liên hệ' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, code: 'AI_FORM_DRAFT_INVALID_OUTPUT' });
    expect(await creditRows()).toHaveLength(0);
    expect(await tokenRows()).toHaveLength(1);
    expect(await formCount()).toBe(0);
  });

  it('đầu vào sai → 400 trước khi gọi Google, không credit không token', async () => {
    const gemini = installGemini(() => JSON.stringify(CONSULT));
    expect((await post({ mode: 'create', description: '   ' })).status).toBe(400);
    expect((await post({ mode: 'create', description: 'x', kind: 'contact' })).status).toBe(400);
    expect((await post({ mode: 'hack', description: 'x' })).status).toBe(400);
    expect((await post({ mode: 'rewrite', existingForm: { fields: [{ type: 'page_break', label: '' }] } })).status).toBe(400);
    expect(gemini.generateCalls).toBe(0);
    expect(await creditRows()).toHaveLength(0);
    expect(await tokenRows()).toHaveLength(0);
  });

  it('HẾT CREDIT: lượt cuối còn credit thành công, lượt kế → 402 RESOURCE_LIMIT_EXCEEDED và Google KHÔNG bị gọi', async () => {
    const limited = await ownerWithCredits(1);
    const auth = { authorization: `Bearer ${token(limited)}` };
    const gemini = installGemini(() => JSON.stringify(CONSULT));

    const first = await post({ mode: 'create', description: 'Form liên hệ' }, auth);
    expect(first.status).toBe(200);
    const second = await post({ mode: 'create', description: 'Form liên hệ' }, auth);

    expect(second.status).toBe(402);
    expect(second.body).toMatchObject({ success: false, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', upgradeRequired: true });
    expect(gemini.generateCalls).toBe(1);
    expect((await creditRows()).filter((c) => String(c.id_user) === String(limited.id))).toHaveLength(1);
  });

  it('nhân viên (có quyền forms) bấm: chi phí + token tính cho CHỦ, người bấm ở actor; nhân viên KHÔNG có quyền forms → 403, Google không bị gọi', async () => {
    const employee = await createUser({ username: `aidraftemp${Date.now()}` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ forms: true })]
    );
    const asEmployee = { authorization: `Bearer ${token(employee)}`, 'X-Owner-Context': String(owner.id) };
    const gemini = installGemini(() => JSON.stringify(CONSULT));

    const res = await post({ mode: 'create', description: 'Form liên hệ' }, asEmployee);
    expect(res.status).toBe(200);
    const credits = await creditRows();
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ id_user: owner.id, actor_user_id: employee.id, delta: 1, feature: 'form_draft' });
    expect(await tokenRows()).toEqual([{ id_user: Number(owner.id), feature: 'form_draft', actor: Number(employee.id) }]);

    await db.query(`UPDATE user_members SET permissions = $1::jsonb WHERE employee_id = $2`, [JSON.stringify({ leads: true }), employee.id]);
    const denied = await post({ mode: 'create', description: 'Form liên hệ' }, asEmployee);
    expect(denied.status).toBe(403);
    expect(gemini.generateCalls).toBe(1);
    expect(await creditRows()).toHaveLength(1);
  });
});
