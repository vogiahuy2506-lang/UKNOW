/**
 * Integration tests cho PR-F (`PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md`) — "Dùng biểu mẫu đã
 * tạo" lưu được thật: PUT /api/admin/landing-pages/:id nhận `linkedFormId` (số = gắn biểu mẫu có sẵn, null = về Form
 * cơ bản, thiếu = hành vi cũ). Nền: `landingFormSlotEmbed.test.js` (chỗ trống → khối nhúng) không đổi.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';
import landingPageRepository from '../../src/repositories/landingPage.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({
    username: user.username,
    password: user.plainPassword,
  });
  return res.body.data.accessToken;
}

async function createUserWithPlan({ userOverrides = {}, planOverrides = {} } = {}) {
  const user = await createUser({ role: 'user', ...userOverrides });
  const plan = await createPlan(planOverrides);
  await assignPlanToUser(user.id, plan.id);
  return user;
}

/** Biểu mẫu "của khách" tạo trong mục Biểu mẫu (không gắn landing nào). */
async function insertUserForm(ownerId, overrides = {}) {
  const { rows } = await db.query(
    `INSERT INTO forms (workspace_owner_id, created_by_user_id, public_key, title, fields, settings, is_published, admin_disabled_at)
     VALUES ($1, $1, $2, $3, '[]'::jsonb, '{}'::jsonb, $4, $5)
     RETURNING *`,
    [
      ownerId,
      overrides.publicKey || crypto.randomBytes(12).toString('base64url'),
      overrides.title || 'Biểu mẫu của khách',
      overrides.isPublished ?? true,
      overrides.adminDisabledAt ?? null,
    ]
  );
  return rows[0];
}

async function insertSubmission(form) {
  await db.query(
    `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, respondent_name, respondent_email, marketing_consent)
     VALUES ($1, $2, $3, 'Khách thử', 'khach@example.com', TRUE)`,
    [form.id, form.workspace_owner_id, crypto.randomBytes(16).toString('hex')]
  );
}

const SLOT_HTML = '<section><div data-founderai-form-slot></div></section>';
const NO_SLOT_HTML = '<section><p>không có chỗ trống</p></section>';

async function createLandingWithAutoForm(token, slug, title = 'Landing thử') {
  const res = await request(app)
    .post('/api/admin/landing-pages')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, title, htmlContent: SLOT_HTML });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function putLanding(token, id, body) {
  return request(app)
    .put(`/api/admin/landing-pages/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function loadLanding(id) {
  const { rows } = await db.query('SELECT html_content, custom_config FROM landing_pages WHERE id = $1', [id]);
  return rows[0];
}

async function formsOfLanding(landingId) {
  const { rows } = await db.query('SELECT id, public_key, is_published FROM forms WHERE landing_page_id = $1 ORDER BY id', [
    landingId,
  ]);
  return rows;
}

describe('PUT /api/admin/landing-pages/:id — PR-F linkedFormId', () => {
  it('(1) gắn biểu mẫu X: X gắn landing, form tự sinh cũ NULL nhưng CÒN, HTML nhúng publicKey của X, X nháp được xuất bản', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-1' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-1');
    const autoForm = (await formsOfLanding(landingId))[0];
    const formX = await insertUserForm(me.id, { title: 'Form đăng ký khoá học', isPublished: false });
    await insertSubmission({ id: autoForm.id, workspace_owner_id: me.id });
    await insertSubmission(formX);

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-1',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: formX.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.linkedFormId).toBe(formX.id);
    expect(res.body.data.linkedFormTitle).toBe('Form đăng ký khoá học');
    expect(res.body.data.linkedFormSource).toBe('chosen');

    // X gắn landing, đúng MỘT form gắn landing này (form cũ đã gỡ gắn).
    const linked = await formsOfLanding(landingId);
    expect(linked.map((f) => f.id)).toEqual([formX.id]);
    expect(linked[0].is_published).toBe(true);

    // Form tự sinh cũ vẫn còn, landing_page_id NULL, bài nộp của cả hai còn nguyên.
    const old = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [autoForm.id]);
    expect(old.rows).toHaveLength(1);
    expect(old.rows[0].landing_page_id).toBeNull();
    const subs = await db.query('SELECT form_id FROM form_submissions ORDER BY form_id');
    expect(subs.rows.map((r) => String(r.form_id))).toEqual([String(autoForm.id), String(formX.id)].sort());

    // HTML nhúng đúng khoá của X, không còn chỗ trống, không còn khoá form cũ.
    const lp = await loadLanding(landingId);
    expect(lp.html_content).toContain(`data-founderai-form="${formX.public_key}"`);
    expect(lp.html_content).not.toContain('data-founderai-form-slot');
    expect(lp.html_content).not.toContain(autoForm.public_key);
    expect(Number(lp.custom_config.chosenFormId)).toBe(Number(formX.id));

    // GET trả lại đúng thông tin.
    const got = await request(app).get(`/api/admin/landing-pages/${landingId}`).set('Authorization', `Bearer ${token}`);
    expect(got.body.data.linkedFormId).toBe(formX.id);
    expect(got.body.data.linkedFormSource).toBe('chosen');
    expect(got.body.data.linkedFormPublicKey).toBe(formX.public_key);
  });

  it('(1b) gắn lại CHÍNH biểu mẫu đang gắn (lưu lần 2) → vẫn đúng 1 form gắn, không tạo form mới', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-1b' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-1b');
    const formX = await insertUserForm(me.id);
    const body = { slug: 'lf-link-1b', title: 'Landing thử', htmlContent: SLOT_HTML, linkedFormId: formX.id };
    expect((await putLanding(token, landingId, body)).status).toBe(200);
    const formCountBefore = (await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c;

    expect((await putLanding(token, landingId, body)).status).toBe(200);
    // Lưu tiếp KHÔNG gửi linkedFormId (trình soạn vẫn giữ chỗ trống) → dùng lại form X, không đẻ form mới.
    const { linkedFormId: _drop, ...bodyNoLink } = body;
    expect((await putLanding(token, landingId, bodyNoLink)).status).toBe(200);

    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual([formX.id]);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(formCountBefore);
    expect((await loadLanding(landingId)).html_content).toContain(`data-founderai-form="${formX.public_key}"`);
  });

  it('(2) biểu mẫu của workspace khác → 404, không đổi gì', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-2a' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'lf-link-2b' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-2');
    const autoBefore = await formsOfLanding(landingId);
    const foreignForm = await insertUserForm(other.id, { title: 'Form người khác' });
    const htmlBefore = (await loadLanding(landingId)).html_content;

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-2',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: foreignForm.id,
    });
    expect(res.status).toBe(404);

    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual(autoBefore.map((f) => f.id));
    const foreignAfter = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [foreignForm.id]);
    expect(foreignAfter.rows[0].landing_page_id).toBeNull();
    expect((await loadLanding(landingId)).html_content).toBe(htmlBefore);
  });

  it('(3) biểu mẫu đang gắn landing KHÁC → 409 nêu tên trang đó, không đổi gì', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-3' } });
    const token = await loginAs(me);
    const landingA = await createLandingWithAutoForm(token, 'lf-link-3a', 'Trang Alpha');
    const landingB = await createLandingWithAutoForm(token, 'lf-link-3b', 'Trang Beta');
    const formOfB = (await formsOfLanding(landingB))[0];
    const aBefore = await formsOfLanding(landingA);

    const res = await putLanding(token, landingA, {
      slug: 'lf-link-3a',
      title: 'Trang Alpha',
      htmlContent: SLOT_HTML,
      linkedFormId: formOfB.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Trang Beta');

    expect((await formsOfLanding(landingA)).map((f) => f.id)).toEqual(aBefore.map((f) => f.id));
    expect((await formsOfLanding(landingB)).map((f) => f.id)).toEqual([formOfB.id]);
  });

  it('(4) null khi đang dùng biểu mẫu khách chọn → gỡ gắn X (X + bài nộp còn nguyên), tạo form cơ bản MỚI, HTML nhúng khoá mới', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-4' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-4');
    const formX = await insertUserForm(me.id, { title: 'Biểu mẫu X' });
    await insertSubmission(formX);
    expect(
      (await putLanding(token, landingId, { slug: 'lf-link-4', title: 'Landing thử', htmlContent: SLOT_HTML, linkedFormId: formX.id })).status
    ).toBe(200);

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-4',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.linkedFormSource).toBe('basic');
    expect(res.body.data.linkedFormId).not.toBe(formX.id);

    const linked = await formsOfLanding(landingId);
    expect(linked).toHaveLength(1);
    expect(String(linked[0].id)).not.toBe(String(formX.id));
    expect(linked[0].is_published).toBe(true);

    const xAfter = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [formX.id]);
    expect(xAfter.rows).toHaveLength(1);
    expect(xAfter.rows[0].landing_page_id).toBeNull();
    const subs = await db.query('SELECT 1 FROM form_submissions WHERE form_id = $1', [formX.id]);
    expect(subs.rows).toHaveLength(1);

    const lp = await loadLanding(landingId);
    expect(lp.html_content).toContain(`data-founderai-form="${linked[0].public_key}"`);
    expect(lp.html_content).not.toContain(formX.public_key);
    expect(lp.custom_config.chosenFormId).toBeUndefined();
  });

  it('(4b) null khi đang là Form cơ bản (form tự sinh) → không gỡ, không tạo form mới', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-4b' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-4b');
    const before = await formsOfLanding(landingId);

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-4b',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: null,
    });
    expect(res.status).toBe(200);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual(before.map((f) => f.id));
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(1);
    expect(res.body.data.linkedFormSource).toBe('basic');
  });

  it('(5) không gửi linkedFormId → hành vi cũ: tái dùng form tự sinh, không tạo form mới, không đổi cờ', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-5' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-5');
    const before = await formsOfLanding(landingId);

    const res = await putLanding(token, landingId, { slug: 'lf-link-5', title: 'Landing thử', htmlContent: SLOT_HTML });
    expect(res.status).toBe(200);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual(before.map((f) => f.id));
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(1);
    expect(res.body.data.linkedFormId).toBe(before[0].id);
    expect(res.body.data.linkedFormSource).toBe('basic');
    expect((await loadLanding(landingId)).html_content).toContain(before[0].public_key);
  });

  it('(6) HTML không có chỗ trống và chưa nhúng biểu mẫu đó → 400, không gắn suông', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-6' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-6');
    const before = await formsOfLanding(landingId);
    const formX = await insertUserForm(me.id);

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-6',
      title: 'Landing thử',
      htmlContent: NO_SLOT_HTML,
      linkedFormId: formX.id,
    });
    expect(res.status).toBe(400);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual(before.map((f) => f.id));
  });

  it('(6b) HTML đã nhúng sẵn khoá của X (dán tay) và không có chỗ trống → gắn được, HTML giữ nguyên khối nhúng', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-6b' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-6b');
    const formX = await insertUserForm(me.id);
    const html = `<section><div data-founderai-form="${formX.public_key}"></div><script src="https://app.example/form-embed.js" defer></script></section>`;

    const res = await putLanding(token, landingId, {
      slug: 'lf-link-6b',
      title: 'Landing thử',
      htmlContent: html,
      linkedFormId: formX.id,
    });
    expect(res.status).toBe(200);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual([formX.id]);
    expect((await loadLanding(landingId)).html_content).toContain(`data-founderai-form="${formX.public_key}"`);
  });

  it('(7) linkedFormId không hợp lệ → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-7' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-7');
    for (const bad of ['abc', 0, -3, 1.5, {}, true]) {
      const res = await putLanding(token, landingId, {
        slug: 'lf-link-7',
        title: 'Landing thử',
        htmlContent: SLOT_HTML,
        linkedFormId: bad,
      });
      expect(res.status).toBe(400);
    }
  });

  it('(8) biểu mẫu bị quản trị viên khoá → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-8' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-8');
    const formX = await insertUserForm(me.id, { adminDisabledAt: new Date() });
    const res = await putLanding(token, landingId, {
      slug: 'lf-link-8',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: formX.id,
    });
    expect(res.status).toBe(400);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).not.toContain(formX.id);
  });

  it('(9) nhân viên có quyền landing_pages nhưng KHÔNG có quyền forms → 403; có quyền forms → gắn được', async () => {
    const owner = await createUserWithPlan({ userOverrides: { username: 'lf-link-9o' } });
    const employee = await createUserWithPlan({ userOverrides: { username: 'lf-link-9e' } });
    const ownerToken = await loginAs(owner);
    const landingId = await createLandingWithAutoForm(ownerToken, 'lf-link-9');
    const formX = await insertUserForm(owner.id);
    const { rows } = await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active') RETURNING id`,
      [owner.id, employee.id, JSON.stringify({ landing_pages: true })]
    );
    const membershipId = rows[0].id;
    const employeeToken = await loginAs(employee);
    const body = { slug: 'lf-link-9', title: 'Landing thử', htmlContent: SLOT_HTML, linkedFormId: formX.id };

    const asEmployee = (payload) =>
      request(app)
        .put(`/api/admin/landing-pages/${landingId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Owner-Context', String(owner.id))
        .send(payload);

    const denied = await asEmployee(body);
    expect(denied.status).toBe(403);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).not.toContain(formX.id);

    await db.query('UPDATE user_members SET permissions = $2::jsonb WHERE id = $1', [
      membershipId,
      JSON.stringify({ landing_pages: true, forms: true }),
    ]);
    const allowed = await asEmployee(body);
    expect(allowed.status).toBe(200);
    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual([formX.id]);
  });

  it('(10) lưu landing hỏng SAU khi gắn form → hoàn lại: form cũ vẫn gắn, X không gắn, HTML cũ nguyên', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-10' } });
    const token = await loginAs(me);
    const landingId = await createLandingWithAutoForm(token, 'lf-link-10');
    const before = await formsOfLanding(landingId);
    const formX = await insertUserForm(me.id);
    const htmlBefore = (await loadLanding(landingId)).html_content;

    const spy = jest
      .spyOn(landingPageRepository, 'updateByIdInScope')
      .mockRejectedValueOnce(new Error('ép UPDATE landing lỗi sau khi đã gắn biểu mẫu'));
    const res = await putLanding(token, landingId, {
      slug: 'lf-link-10',
      title: 'Landing thử',
      htmlContent: SLOT_HTML,
      linkedFormId: formX.id,
    });
    spy.mockRestore();
    expect(res.status).toBe(500);

    expect((await formsOfLanding(landingId)).map((f) => f.id)).toEqual(before.map((f) => f.id));
    const xAfter = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [formX.id]);
    expect(xAfter.rows[0].landing_page_id).toBeNull();
    expect((await loadLanding(landingId)).html_content).toBe(htmlBefore);
  });

  it('(11) danh sách landing trả linkedFormId / linkedFormTitle / linkedFormSource', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lf-link-11' } });
    const token = await loginAs(me);
    const withForm = await createLandingWithAutoForm(token, 'lf-link-11a', 'Có form');
    const noFormRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'lf-link-11b', title: 'Không form', htmlContent: NO_SLOT_HTML });
    const formX = await insertUserForm(me.id, { title: 'Biểu mẫu chọn' });
    await putLanding(token, withForm, { slug: 'lf-link-11a', title: 'Có form', htmlContent: SLOT_HTML, linkedFormId: formX.id });

    const list = await request(app).get('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const rowWith = list.body.data.find((r) => r.id === withForm);
    const rowWithout = list.body.data.find((r) => r.id === noFormRes.body.data.id);
    expect(rowWith.linkedFormId).toBe(formX.id);
    expect(rowWith.linkedFormTitle).toBe('Biểu mẫu chọn');
    expect(rowWith.linkedFormSource).toBe('chosen');
    expect(rowWithout.linkedFormId).toBeNull();
    expect(rowWithout.linkedFormSource).toBeNull();
  });
});
