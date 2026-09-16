/**
 * Integration tests — câu 3 sếp hỏi 14/09 ("dữ liệu điền vào form sẽ lưu về chỗ nào?").
 * Đo thật trên `checkform.founderai.biz`: form 8 ô nhưng chỉ 5 ô (name/email/phone/
 * marketingConsent/landingPageSlug) được lưu, 3 ô còn lại rơi mất, không báo gì.
 *
 * Test cho kênh cảnh báo lúc LƯU (`landingPageAdmin.service.js` `create`/`update`) —
 * `landingCaptureFieldAudit.util.js` soi ĐÚNG form `data-founderai-capture`, đối chiếu với
 * `leadFormConfig.customFields` đã khai báo. KHÔNG chặn lưu — chỉ cảnh báo.
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

const declaredField = (key, overrides = {}) => ({
  key,
  type: 'text',
  labelVi: key,
  required: false,
  ...overrides,
});

describe('POST /api/admin/landing-pages — cảnh báo ô form chưa khai báo (câu 3 sếp hỏi 14/09)', () => {
  it('ô name="chuc_vu" chưa khai báo → TỰ KHAI BÁO lúc lưu (PLAN_TU_KHAI_BAO 16/09): không còn cảnh báo, HTML đổi tên sang cf_*', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c1' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-1',
        title: 'Landing có ô lạ',
        htmlContent: captureFormHtml('<input type="text" name="chuc_vu" />'),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toBeUndefined();
    expect(res.body.data.leadFormConfig.customFields).toHaveLength(1);
    const declared = res.body.data.leadFormConfig.customFields[0];
    expect(declared.type).toBe('text');
    expect(declared.key).toMatch(/^cf_[a-z0-9_]+$/);
    expect(res.body.data.htmlContent).not.toContain('name="chuc_vu"');
    expect(res.body.data.htmlContent).toContain(`name="${declared.key}"`);

    const lpRows = await db.query('SELECT id FROM landing_pages WHERE slug = $1', ['capture-audit-1']);
    expect(lpRows.rows).toHaveLength(1);
  });

  it('ô cf_abcd_12 ĐÃ khai báo → không cảnh báo', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c2' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-2',
        title: 'Landing đã khai báo',
        htmlContent: captureFormHtml('<input type="text" name="cf_abcd_12" />'),
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [declaredField('cf_abcd_12', { labelVi: 'Chức vụ' })],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toBeUndefined();
  });

  it('ô cf_lung_tung CHƯA khai báo (đã khai báo field khác) → cũng TỰ KHAI BÁO thêm (không mất, không đè field cũ)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c3' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-3',
        title: 'Landing ô sai tên',
        htmlContent: captureFormHtml('<input type="text" name="cf_lung_tung" />'),
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [declaredField('cf_khac_biet', { labelVi: 'Đơn vị công tác' })],
        },
      });

    expect(res.status).toBe(201);
    // cf_lung_tung được TỰ KHAI BÁO nên không còn trong cảnh báo — cảnh báo còn lại (nếu có) chỉ
    // là declaredMissing cho cf_khac_biet (khai báo sẵn nhưng HTML không có ô này, không liên quan
    // tự khai báo).
    expect(res.body.data.warning).not.toContain('cf_lung_tung');
    if (res.body.data.warning) {
      expect(res.body.data.warning).toContain('cf_khac_biet');
    }
    expect(res.body.data.leadFormConfig.customFields).toHaveLength(2);
    expect(res.body.data.leadFormConfig.customFields.map((f) => f.key)).toContain('cf_khac_biet');
    expect(res.body.data.htmlContent).not.toContain('name="cf_lung_tung"');
  });

  it('trang không có form data-founderai-capture → không cảnh báo', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c4' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-4',
        title: 'Landing không form',
        htmlContent: '<!DOCTYPE html><html><body><p>Chưa có form đăng ký</p></body></html>',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toBeUndefined();
  });

  it('trang có form KHÁC (vd tìm kiếm) ngoài form capture → không soi form đó, không báo động giả', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c5' } });
    const token = await loginAs(me);

    const html =
      '<!DOCTYPE html><html><body>' +
      '<form id="search"><input type="text" name="q" /><input type="text" name="unrelated" /></form>' +
      captureFormHtml('') +
      '</body></html>';

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'capture-audit-5', title: 'Landing có form khác', htmlContent: html });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toBeUndefined();
  });

  it('đã khai báo 2 trường nhưng HTML chỉ có 1 → cảnh báo nêu đúng khoá bị thiếu', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-c6' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-6',
        title: 'Landing thiếu 1 field',
        htmlContent: captureFormHtml('<input type="text" name="cf_co_mat_ab12" />'),
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [
            declaredField('cf_co_mat_ab12', { labelVi: 'Có mặt' }),
            declaredField('cf_bi_thieu_cd34', { labelVi: 'Bị thiếu' }),
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warning).toContain('cf_bi_thieu_cd34');
  });
});

describe('PUT /api/admin/landing-pages/:id — cảnh báo ô form chưa khai báo (create + update đều có kênh)', () => {
  it('update() cũng chạy tự khai báo (không chỉ create) — ô mới thêm vào lúc sửa cũng được khai báo, không còn cảnh báo', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-u1' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'capture-audit-u1', title: 'Landing', htmlContent: captureFormHtml('') });
    expect(createRes.body.data.warning).toBeUndefined();
    const landingId = createRes.body.data.id;

    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'capture-audit-u1',
        title: 'Landing',
        htmlContent: captureFormHtml('<input type="text" name="cau_hoi" />'),
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.warning).toBeUndefined();
    expect(updateRes.body.data.leadFormConfig.customFields).toHaveLength(1);
    expect(updateRes.body.data.htmlContent).not.toContain('name="cau_hoi"');
  });

  it('gộp cảnh báo bản nháp (snapshot hết dung lượng) với cảnh báo ô lạ mà tự khai báo BỎ QUA (select rỗng) — cả hai câu cùng hiện, không mất câu nào', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'cap-audit-u2' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'capture-audit-u2', title: 'Landing', htmlContent: captureFormHtml('') });
    const landingId = createRes.body.data.id;

    // Ép snapshot GCS hết dung lượng → createSnapshotIfChanged trả warning riêng (path thật,
    // không mock — cùng kỹ thuật formsTheme.test.js dùng cho STORAGE_QUOTA_EXCEEDED).
    await db.query('UPDATE users SET storage_quota_override_bytes = 10 WHERE id = $1', [me.id]);

    process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    let updateRes;
    try {
      updateRes = await request(app)
        .put(`/api/admin/landing-pages/${landingId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'capture-audit-u2',
          title: 'Landing',
          // HTML khác bản cũ (kích hoạt snapshot) VÀ có select chỉ có option rỗng — tự khai báo
          // KHÔNG dám khai báo (mục 6.2, tránh làm mất lead), nên vẫn còn cảnh báo cho ô này.
          htmlContent: captureFormHtml(
            '<select name="khung_gio_hen"><option value="">— Chọn —</option></select>'
          ),
        });
    } finally {
      delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    }

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.warning).toContain('khung_gio_hen');
    expect(updateRes.body.data.warning).toMatch(/dung lượng/);
    expect(updateRes.body.data.htmlContent).toContain('name="khung_gio_hen"');
  });
});
