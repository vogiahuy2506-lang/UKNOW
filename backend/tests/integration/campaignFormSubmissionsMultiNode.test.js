/**
 * PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7b — chiến dịch đọc ĐỦ mọi biểu mẫu của một landing.
 *
 * Sau PR-6 một landing có nhiều biểu mẫu (bảng `landing_page_forms`) nhưng node `read_form_submissions` chỉ nhận MỘT `formId` và AI chiến dịch
 * đại diện landing bằng biểu mẫu chính → người điền các biểu mẫu còn lại bị bỏ sót. Nay node nhận `formIds`; đồ thị cũ chỉ có `formId` chạy
 * y như cũ.
 *
 * Chạy trên Postgres thật: loader (`getCustomersFromDataNode`) gọi thẳng; API preview gộp + nhóm landing qua HTTP; chuỗi AI
 * (`applyLandingAudienceResolution` → `compileCampaign` → loader) với repository thật, không mock.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';
import { applyLandingAudienceResolution } from '../../src/services/ai/landingAudienceResolver.service.js';
import { compileCampaign } from '../../src/services/ai/campaignCompiler.service.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function createAndPublishForm(token, title, { consentEnabled = true } = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title,
      fields: [
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Email', type: 'email', required: false, role: 'email' },
        { label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
        { label: `Ghi chú ${title}`, type: 'short_text', required: false },
      ],
      settings: { consentEnabled },
    });
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  const publishRes = await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(publishRes.status).toBe(200);
  // API trả id dạng chuỗi (bigint) — test so sánh với id số lấy từ repository/loader.
  return { ...form, id: Number(form.id) };
}

let submissionSeq = 0;
/** Ghi thẳng một bài nộp (kiểm soát created_at để dựng thứ tự "mới nhất"). */
async function addSubmission(form, owner, {
  name = 'Khách', email = null, phone = null, consent = true, status = 'submitted', createdAt,
}) {
  submissionSeq += 1;
  const result = await db.query(
    `INSERT INTO form_submissions
       (form_id, workspace_owner_id, access_token, answers, respondent_name, respondent_email, respondent_phone,
        marketing_consent, status, created_at)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6, $7, $8, $9::timestamptz)
     RETURNING id`,
    [form.id, owner.id, `tok-${submissionSeq}-${crypto.randomBytes(6).toString('hex')}`, name, email, phone, consent, status, createdAt]
  );
  return Number(result.rows[0].id);
}

async function insertLanding(owner, slug, title = 'Landing') {
  const result = await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content, is_published)
     VALUES ($1, $1, $2, $3, '<p>x</p>', true) RETURNING id`,
    [owner.id, slug, title]
  );
  return Number(result.rows[0].id);
}

async function attachFormToLanding(formId, landingId, position) {
  await db.query(
    'INSERT INTO landing_page_forms (landing_page_id, form_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [landingId, formId, position]
  );
}

const readNode = (config) => ({ id: 'node_multi', node_subtype: 'read_form_submissions', config });
const run = (config, ownerId) => campaignNodeDataService.getCustomersFromDataNode(readNode(config), ownerId, []);
const emailsOf = (result) => result.items.map((i) => i.email).sort();

async function setup3Forms() {
  const owner = await createUser({ username: 'owner_multi' });
  const token = await loginAs(owner);
  const formA = await createAndPublishForm(token, 'A Tư vấn');
  const formB = await createAndPublishForm(token, 'B Đặt lịch');
  const formC = await createAndPublishForm(token, 'C Khảo sát');
  return { owner, token, formA, formB, formC };
}

describe('Node read_form_submissions nhiều biểu mẫu — loader (PR-7b)', () => {
  it('formIds [A,B,C]: ra đủ người của CẢ 3 biểu mẫu (A, B và C đều có người riêng)', async () => {
    const { owner, formA, formB, formC } = await setup3Forms();
    await addSubmission(formA, owner, { email: 'a1@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'b1@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formC, owner, { email: 'c1@x.com', createdAt: '2026-10-03T01:00:00Z' });

    const result = await run({ formIds: [formA.id, formB.id, formC.id] }, owner.id);

    expect(emailsOf(result)).toEqual(['a1@x.com', 'b1@x.com', 'c1@x.com']);
    // Mỗi item mang formId của biểu mẫu nguồn (nhận diện nguồn consent = form_submission).
    expect(result.items.map((i) => Number(i.formId)).sort()).toEqual([formA.id, formB.id, formC.id].sort());
  });

  it('khử trùng: người điền 2 biểu mẫu (cùng email khác hoa thường) chỉ ra MỘT item — bản MỚI NHẤT; SĐT +84 / 0 là cùng người', async () => {
    const { owner, formA, formB, formC } = await setup3Forms();
    await addSubmission(formA, owner, { name: 'An cũ', email: 'An@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { name: 'An mới', email: 'an@X.com', createdAt: '2026-10-05T01:00:00Z' });
    await addSubmission(formB, owner, { name: 'Bình B', phone: '0901000002', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formC, owner, { name: 'Bình C (mới)', phone: '+84 901 000 002', createdAt: '2026-10-04T01:00:00Z' });
    await addSubmission(formC, owner, { name: 'Cường', email: 'cuong@x.com', createdAt: '2026-10-03T01:00:00Z' });

    const result = await run({ formIds: [formA.id, formB.id, formC.id] }, owner.id);

    expect(result.items).toHaveLength(3);
    const byName = result.items.map((i) => i.fullName).sort();
    expect(byName).toEqual(['An mới', 'Bình C (mới)', 'Cường']);
    // Thứ tự cũ trước theo bài được giữ: Cường (10-03), Bình C (10-04), An mới (10-05).
    expect(result.items.map((i) => i.fullName)).toEqual(['Cường', 'Bình C (mới)', 'An mới']);
  });

  it('chỉ lấy bài ĐỒNG Ý và chưa huỷ ở mọi biểu mẫu (từ chối, chưa hỏi, đã huỷ bị loại)', async () => {
    const { owner, formA, formB } = await setup3Forms();
    await addSubmission(formA, owner, { email: 'yes@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formA, owner, { email: 'no@x.com', consent: false, createdAt: '2026-10-01T02:00:00Z' });
    await addSubmission(formB, owner, { email: 'unknown@x.com', consent: null, createdAt: '2026-10-01T03:00:00Z' });
    await addSubmission(formB, owner, { email: 'cancelled@x.com', status: 'cancelled', createdAt: '2026-10-01T04:00:00Z' });
    await addSubmission(formB, owner, { email: 'yes2@x.com', createdAt: '2026-10-01T05:00:00Z' });

    const result = await run({ formIds: [formA.id, formB.id] }, owner.id);
    expect(emailsOf(result)).toEqual(['yes2@x.com', 'yes@x.com']);
  });

  it('biểu mẫu của workspace KHÁC trong formIds bị bỏ — không bao giờ đọc bài nộp của họ; các biểu mẫu của mình vẫn chạy', async () => {
    const { owner, formA, formB } = await setup3Forms();
    const stranger = await createUser({ username: 'stranger_multi' });
    const strangerToken = await loginAs(stranger);
    const foreignForm = await createAndPublishForm(strangerToken, 'Của người lạ');
    await addSubmission(formA, owner, { email: 'mine-a@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'mine-b@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(foreignForm, stranger, { email: 'secret@stranger.com', createdAt: '2026-10-03T01:00:00Z' });

    const result = await run({ formIds: [formA.id, foreignForm.id, formB.id] }, owner.id);

    expect(emailsOf(result)).toEqual(['mine-a@x.com', 'mine-b@x.com']);
    expect(result.items.some((i) => i.email === 'secret@stranger.com')).toBe(false);
  });

  it('formIds chỉ toàn biểu mẫu của workspace khác / đã xoá → node throw lỗi rõ (không chạy ra 0 người trong im lặng)', async () => {
    const { owner } = await setup3Forms();
    const stranger = await createUser({ username: 'stranger_multi_2' });
    const strangerToken = await loginAs(stranger);
    const f1 = await createAndPublishForm(strangerToken, 'Lạ 1');
    const f2 = await createAndPublishForm(strangerToken, 'Lạ 2');

    await expect(run({ formIds: [f1.id, f2.id] }, owner.id)).rejects.toThrow(/Biểu mẫu đã bị xoá hoặc không thuộc quyền/);
    await expect(run({ formIds: [987654321, 987654322] }, owner.id)).rejects.toThrow(/Biểu mẫu đã bị xoá hoặc không thuộc quyền/);
  });

  it('ĐỒ THỊ CŨ chỉ có formId: chạy y như trước PR-7b — kể cả KHÔNG khử trùng người điền hai lần cùng một biểu mẫu', async () => {
    const { owner, formA } = await setup3Forms();
    await addSubmission(formA, owner, { name: 'Lần 1', email: 'rep@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formA, owner, { name: 'Lần 2', email: 'rep@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formA, owner, { name: 'Khác', email: 'other@x.com', createdAt: '2026-10-03T01:00:00Z' });

    const legacy = await run({ formId: formA.id }, owner.id);
    const legacyStr = await run({ formId: String(formA.id) }, owner.id);
    const listOfOne = await run({ formIds: [formA.id] }, owner.id);

    for (const result of [legacy, legacyStr, listOfOne]) {
      expect(result.items.map((i) => i.fullName)).toEqual(['Lần 1', 'Lần 2', 'Khác']); // cũ trước, đủ 3 bài
    }
  });

  it('formIds hợp lệ THẮNG formId cũ còn sót trong config', async () => {
    const { owner, formA, formB } = await setup3Forms();
    await addSubmission(formA, owner, { email: 'a@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'b@x.com', createdAt: '2026-10-02T01:00:00Z' });

    const result = await run({ formIds: [formB.id], formId: formA.id }, owner.id);
    expect(emailsOf(result)).toEqual(['b@x.com']);
  });

  it('không chọn biểu mẫu nào → throw "Chưa chọn biểu mẫu"', async () => {
    const { owner } = await setup3Forms();
    await expect(run({ formIds: [] }, owner.id)).rejects.toThrow(/Chưa chọn biểu mẫu/);
    await expect(run({}, owner.id)).rejects.toThrow(/Chưa chọn biểu mẫu/);
  });

  it('giới hạn TỔNG (formSubmissionsLimit) áp lên tập đã khử trùng, giữ người cũ nhất trước — không phải mỗi biểu mẫu một giới hạn', async () => {
    const { owner, formA, formB, formC } = await setup3Forms();
    await addSubmission(formA, owner, { email: 'p1@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'p2@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formC, owner, { email: 'p3@x.com', createdAt: '2026-10-03T01:00:00Z' });
    await addSubmission(formA, owner, { email: 'p4@x.com', createdAt: '2026-10-04T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'p1@x.com', createdAt: '2026-10-05T01:00:00Z' }); // p1 điền lại — không chiếm thêm chỗ

    const result = await run({ formIds: [formA.id, formB.id, formC.id], formSubmissionsLimit: 3 }, owner.id);

    expect(result.items).toHaveLength(3);
    // 4 người (p1..p4); p1 mới nhất ở 10-05 nên xếp cuối sau khi giữ bản mới → cũ trước: p2, p3, p4 → cắt 3.
    expect(emailsOf(result)).toEqual(['p2@x.com', 'p3@x.com', 'p4@x.com']);
  });

  it('fieldMap CHUNG: khoá trường chỉ có ở một biểu mẫu → biểu mẫu kia rơi về cột theo role, không lỗi', async () => {
    const { owner, token } = await setup3Forms();
    const withCompany = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Có email công ty',
        fields: [
          { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
          { label: 'Email', type: 'email', required: false, role: 'email' },
          { label: 'Email công ty', type: 'email', required: false },
        ],
      });
    const formWithCompany = withCompany.body.data;
    const plainForm = await createAndPublishForm(token, 'Không có email công ty');
    const companyField = formWithCompany.fields.find((f) => f.label === 'Email công ty');
    const nameField = formWithCompany.fields.find((f) => f.role === 'name');
    const emailField = formWithCompany.fields.find((f) => f.role === 'email');

    submissionSeq += 1;
    await db.query(
      `INSERT INTO form_submissions
         (form_id, workspace_owner_id, access_token, answers, respondent_name, respondent_email, marketing_consent, created_at)
       VALUES ($1, $2, $3, $4::jsonb, 'Có công ty', 'personal@x.com', TRUE, '2026-10-01T01:00:00Z')`,
      [
        formWithCompany.id,
        owner.id,
        `tok-company-${submissionSeq}`,
        JSON.stringify({
          [nameField.key]: { label: 'Họ và tên', type: 'short_text', value: 'Có công ty' },
          [emailField.key]: { label: 'Email', type: 'email', value: 'personal@x.com' },
          [companyField.key]: { label: 'Email công ty', type: 'email', value: 'Corp@X.com' },
        }),
      ]
    );
    await addSubmission(plainForm, owner, { name: 'Không có', email: 'plain@x.com', createdAt: '2026-10-02T01:00:00Z' });

    const result = await run(
      { formIds: [formWithCompany.id, plainForm.id], fieldMap: { emailKey: companyField.key } },
      owner.id
    );

    expect(emailsOf(result)).toEqual(['corp@x.com', 'plain@x.com']);
  });
});

describe('API preview gộp + nhóm landing (PR-7b)', () => {
  it('GET /api/forms/campaign-preview?formIds=A,B,C: items khử trùng, cột là hợp các trường, total = số người', async () => {
    const { owner, token, formA, formB, formC } = await setup3Forms();
    await addSubmission(formA, owner, { email: 'dup@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'DUP@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formC, owner, { email: 'solo@x.com', createdAt: '2026-10-03T01:00:00Z' });

    const res = await request(app)
      .get(`/api/forms/campaign-preview?formIds=${formA.id},${formB.id},${formC.id}&limit=1`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ total: 2, limit: 1, fetched: 1 });
    expect(res.body.data.items).toHaveLength(1);
    const keys = res.body.data.columns.map((c) => c.key);
    for (const form of [formA, formB, formC]) {
      for (const f of form.fields) expect(keys).toContain(f.key);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('route nằm TRƯỚC /:id: thiếu formIds trả 400 "Chưa chọn biểu mẫu" (không bị hiểu là :id)', async () => {
    const { token } = await setup3Forms();
    const res = await request(app).get('/api/forms/campaign-preview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Chưa chọn biểu mẫu');
  });

  it('biểu mẫu của workspace khác: lẫn trong danh sách thì bị bỏ; toàn bộ là của người khác thì 404', async () => {
    const { owner, token, formA } = await setup3Forms();
    const stranger = await createUser({ username: 'stranger_preview' });
    const foreign = await createAndPublishForm(await loginAs(stranger), 'Của người lạ');
    await addSubmission(formA, owner, { email: 'mine@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(foreign, stranger, { email: 'theirs@x.com', createdAt: '2026-10-02T01:00:00Z' });

    const mixed = await request(app)
      .get(`/api/forms/campaign-preview?formIds=${formA.id},${foreign.id}`)
      .set('Authorization', `Bearer ${token}`);
    // formA + foreign: chỉ còn formA (đường nhiều biểu mẫu vì danh sách có 2 id) → chỉ thấy khách của mình.
    expect(mixed.status).toBe(200);
    expect(mixed.body.data.items.map((i) => i.email)).toEqual(['mine@x.com']);

    const onlyForeign = await request(app)
      .get(`/api/forms/campaign-preview?formIds=${foreign.id},${foreign.id + 1000}`)
      .set('Authorization', `Bearer ${token}`);
    expect(onlyForeign.status).toBe(404);
  });

  it('GET /api/forms/landing-groups: landing kèm các biểu mẫu đang nhúng; bỏ biểu mẫu bị tắt, landing không có biểu mẫu và landing của workspace khác', async () => {
    const { owner, token, formA, formB, formC } = await setup3Forms();
    const landing = await insertLanding(owner, 'landing-3-form', 'Landing 3 biểu mẫu');
    await attachFormToLanding(formB.id, landing, 1);
    await attachFormToLanding(formA.id, landing, 0);
    await attachFormToLanding(formC.id, landing, 2);
    await db.query('UPDATE forms SET admin_disabled_at = NOW() WHERE id = $1', [formC.id]);
    await insertLanding(owner, 'landing-khong-form', 'Không biểu mẫu');
    const stranger = await createUser({ username: 'stranger_groups' });
    const strangerForm = await createAndPublishForm(await loginAs(stranger), 'Lạ');
    const strangerLanding = await insertLanding(stranger, 'landing-cua-la', 'Của lạ');
    await attachFormToLanding(strangerForm.id, strangerLanding, 0);

    const res = await request(app).get('/api/forms/landing-groups').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { slug: 'landing-3-form', title: 'Landing 3 biểu mẫu', formIds: [formA.id, formB.id] },
    ]);
  });
});

describe('Chuỗi AI chiến dịch: landing nhiều biểu mẫu → node đọc ĐỦ (PR-7b, repository thật)', () => {
  it('landing 3 biểu mẫu: applyLandingAudienceResolution → compileCampaign dựng node formIds=[A,B,C] và loader trả người của cả 3', async () => {
    const { owner, formA, formB, formC } = await setup3Forms();
    const landing = await insertLanding(owner, 'landing-3-form');
    await attachFormToLanding(formA.id, landing, 0);
    await attachFormToLanding(formB.id, landing, 1);
    await attachFormToLanding(formC.id, landing, 2);
    await addSubmission(formA, owner, { email: 'a@x.com', createdAt: '2026-10-01T01:00:00Z' });
    await addSubmission(formB, owner, { email: 'b@x.com', createdAt: '2026-10-02T01:00:00Z' });
    await addSubmission(formC, owner, { email: 'c@x.com', createdAt: '2026-10-03T01:00:00Z' });

    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'landing', slugs: ['landing-3-form'], recipientKind: 'email' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Ra mắt khoá học', locale: 'vi' },
    };
    const resolved = await applyLandingAudienceResolution(intent, owner.id);
    expect(resolved.audience).toMatchObject({ type: 'form', formIds: [formA.id, formB.id, formC.id] });

    const graph = compileCampaign(resolved);
    const formNode = graph.nodes.find((n) => n.nodeSubtype === 'read_form_submissions');
    expect(formNode.config).toEqual({ formIds: [formA.id, formB.id, formC.id] });
    expect(graph.nodes.some((n) => n.nodeSubtype === 'read_landing_leads')).toBe(false);

    const result = await run(formNode.config, owner.id);
    expect(emailsOf(result)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('landing của workspace khác: không lộ biểu mẫu (resolver trả null → giữ read_landing_leads)', async () => {
    const { owner } = await setup3Forms();
    const stranger = await createUser({ username: 'stranger_ai' });
    const foreignForm = await createAndPublishForm(await loginAs(stranger), 'Lạ');
    const foreignLanding = await insertLanding(stranger, 'landing-cua-la-ai');
    await attachFormToLanding(foreignForm.id, foreignLanding, 0);

    const intent = {
      version: 1,
      channel: 'email',
      audience: { type: 'landing', slugs: ['landing-cua-la-ai'], recipientKind: 'email' },
    };
    const resolved = await applyLandingAudienceResolution(intent, owner.id);
    expect(resolved).toBe(intent);
  });
});
