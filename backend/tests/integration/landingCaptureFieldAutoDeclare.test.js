/**
 * Integration tests — tự khai báo trường form landing lúc lưu
 * (`_internal/PLAN_TU_KHAI_BAO_TRUONG_FORM_LANDING_2026-09-16.md`).
 *
 * `landingCaptureFieldAudit.test.js` đã phủ kênh CẢNH BÁO (9723d645). File này phủ phần MỚI:
 * `landingPageAdmin.service.js` `create()`/`update()` gọi `autoDeclareLandingCaptureFields`
 * TRƯỚC khi lưu — đổi `name=` trong HTML sang khoá `cf_*` + gộp khai báo vào `leadFormConfig`,
 * rồi khách gửi bài nộp thật qua `/api/public/leads` phải nhận đủ dữ liệu (không rơi mất, không
 * bị 400) — đúng bẫy nặng nhất trong plan (mục 6.2).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

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

async function getLatestLead() {
  const { rows } = await db.query(
    `SELECT id, email, custom_fields AS "customFields" FROM leads ORDER BY id DESC LIMIT 1`
  );
  return rows[0] || null;
}

const captureFormHtml = (extraFieldsHtml = '') =>
  '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận thông tin</label>' +
  extraFieldsHtml +
  '<button type="submit">Đăng ký</button>' +
  '</form>' +
  '<div class="founderai-capture-success" style="display:none"></div>' +
  '<div class="founderai-capture-error" style="display:none"></div>' +
  '</body></html>';

describe('Tự khai báo trường form landing lúc lưu — text field, submit thật', () => {
  it('name="chuc_vu" tự khai báo → khách gửi bài nộp với khoá mới → 201, lead lưu đủ giá trị (không rơi mất)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'auto-decl-t1' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'auto-decl-t1',
        title: 'Landing chuc_vu',
        isPublished: true,
        htmlContent: captureFormHtml('<input type="text" name="chuc_vu" />'),
      });
    expect(createRes.status).toBe(201);
    const declared = createRes.body.data.leadFormConfig.customFields[0];
    expect(declared.key).toMatch(/^cf_[a-z0-9_]+$/);

    const submitRes = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'An',
        lastName: 'Nguyen',
        email: 'chucvu@test.com',
        phone: '0901111111',
        landingPageSlug: 'auto-decl-t1',
        customFields: { [declared.key]: 'Trưởng phòng' },
      });
    expect(submitRes.status).toBe(201);

    const lead = await getLatestLead();
    expect(lead.email).toBe('chucvu@test.com');
    expect(lead.customFields[declared.key].value).toBe('Trưởng phòng');
    expect(lead.customFields[declared.key].displayVi).toBe('Trưởng phòng');
  });
});

describe('Tự khai báo — select có lựa chọn thật, submit thành công', () => {
  it('select 2 option giá trị thật → tự khai báo → submit đúng 1 giá trị → 201, displayVi đúng nhãn option', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'auto-decl-s1' } });
    const token = await loginAs(me);

    const html = captureFormHtml(
      '<select name="phuong_an_hop">' +
      '<option value="">— Chọn —</option>' +
      '<option value="online">Họp online</option>' +
      '<option value="offline">Họp trực tiếp</option>' +
      '</select>'
    );
    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'auto-decl-s1', title: 'Landing select', isPublished: true, htmlContent: html });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.warning).toBeUndefined();
    const declared = createRes.body.data.leadFormConfig.customFields[0];
    expect(declared.type).toBe('select');
    expect(declared.options.map((o) => o.value).sort()).toEqual(['offline', 'online']);
    expect(createRes.body.data.htmlContent).toContain(`name="${declared.key}"`);

    const submitRes = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Bình',
        lastName: 'Trần',
        email: 'select@test.com',
        phone: '0901111112',
        landingPageSlug: 'auto-decl-s1',
        customFields: { [declared.key]: 'online' },
      });
    expect(submitRes.status).toBe(201);

    const lead = await getLatestLead();
    expect(lead.customFields[declared.key].value).toBe('online');
    expect(lead.customFields[declared.key].displayVi).toBe('Họp online');
  });

  it('select CHỈ có option rỗng ("— Chọn —") → KHÔNG tự khai báo, giữ nguyên name; khách gửi bài (không kèm ô đó) vẫn 201, KHÔNG 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'auto-decl-s2' } });
    const token = await loginAs(me);

    const html = captureFormHtml('<select name="khung_gio_hen"><option value="">— Chọn —</option></select>');
    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'auto-decl-s2', title: 'Landing select rong', isPublished: true, htmlContent: html });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.warning).toContain('khung_gio_hen');
    expect(createRes.body.data.leadFormConfig.customFields).toHaveLength(0);
    expect(createRes.body.data.htmlContent).toContain('name="khung_gio_hen"');

    // Đúng bẫy 6.2: khách gửi bài nộp thật (form không có khoá hợp lệ cho ô này) KHÔNG được rơi
    // vào 400 — nếu tự khai báo lỡ khai báo select rỗng thì bước dưới đây sẽ ném lỗi cấu hình.
    const submitRes = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Cường',
        lastName: 'Lê',
        email: 'selectrong@test.com',
        phone: '0901111113',
        landingPageSlug: 'auto-decl-s2',
      });
    expect(submitRes.status).toBe(201);

    const lead = await getLatestLead();
    expect(lead.email).toBe('selectrong@test.com');
  });
});

describe('Tự khai báo — HTML thật của checkform (2 text + 1 select + 1 radio + 1 textarea)', () => {
  it('lưu 1 lần → khai báo đủ 5 trường, submit đủ 5 câu trả lời → lead lưu đủ, không cảnh báo còn sót', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'auto-decl-cf1' } });
    const token = await loginAs(me);

    const checkformExtra =
      '<input type="text" name="chuc_vu" />' +
      '<input type="text" name="don_vi_cong_tac" />' +
      '<select name="phuong_an_hop">' +
      '<option value="">— Chọn —</option>' +
      '<option value="online">Họp online</option>' +
      '<option value="offline">Họp trực tiếp</option>' +
      '</select>' +
      '<label><input type="radio" name="khung_gio_hen" value="sang" /> Buổi sáng</label>' +
      '<label><input type="radio" name="khung_gio_hen" value="chieu" /> Buổi chiều</label>' +
      '<textarea name="cau_hoi"></textarea>';

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'auto-decl-checkform',
        title: 'Checkform thật',
        isPublished: true,
        htmlContent: captureFormHtml(checkformExtra),
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.warning).toBeUndefined();
    const fields = createRes.body.data.leadFormConfig.customFields;
    expect(fields).toHaveLength(5);
    expect(fields.map((f) => f.type).sort()).toEqual(['radio', 'select', 'text', 'text', 'textarea']);

    const byType = (t) => fields.filter((f) => f.type === t);
    const [textA, textB] = byType('text');
    const select = byType('select')[0];
    const radio = byType('radio')[0];
    const textarea = byType('textarea')[0];

    const submitRes = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Dung',
        lastName: 'Phạm',
        email: 'checkform@test.com',
        phone: '0901111114',
        landingPageSlug: 'auto-decl-checkform',
        customFields: {
          [textA.key]: 'Giá trị A',
          [textB.key]: 'Giá trị B',
          [select.key]: 'online',
          [radio.key]: 'sang',
          [textarea.key]: 'Câu hỏi dài của khách',
        },
      });
    expect(submitRes.status).toBe(201);

    const lead = await getLatestLead();
    expect(Object.keys(lead.customFields)).toHaveLength(5);
    expect(lead.customFields[textA.key].value).toBe('Giá trị A');
    expect(lead.customFields[select.key].displayVi).toBe('Họp online');
    expect(lead.customFields[radio.key].displayVi).toBe('Buổi sáng');
    expect(lead.customFields[textarea.key].value).toBe('Câu hỏi dài của khách');
  });
});

describe('Tự khai báo — lưu hai lần liên tiếp cho kết quả y hệt (idempotent)', () => {
  it('update() lần 2 với HTML đã đổi tên từ lần 1 → không đổi tên/thêm khai báo nữa', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'auto-decl-idem' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'auto-decl-idem',
        title: 'Landing idempotent',
        htmlContent: captureFormHtml('<input type="text" name="chuc_vu" /><textarea name="cau_hoi"></textarea>'),
      });
    expect(createRes.status).toBe(201);
    const landingId = createRes.body.data.id;
    const firstHtml = createRes.body.data.htmlContent;
    const firstFields = createRes.body.data.leadFormConfig.customFields;
    expect(firstFields).toHaveLength(2);

    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'auto-decl-idem',
        title: 'Landing idempotent',
        htmlContent: firstHtml,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.warning).toBeUndefined();
    expect(updateRes.body.data.leadFormConfig.customFields).toHaveLength(2);
    expect(updateRes.body.data.leadFormConfig.customFields.map((f) => f.key).sort())
      .toEqual(firstFields.map((f) => f.key).sort());
    expect(updateRes.body.data.htmlContent).toBe(firstHtml);
  });
});
