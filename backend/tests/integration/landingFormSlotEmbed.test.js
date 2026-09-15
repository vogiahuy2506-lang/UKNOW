/**
 * Integration tests cho PR-5b-2a (`PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md`, "Bổ sung 15/09
 * khi soạn lệnh PR-5b-2") — lưu landing page có chỗ trống `<div data-founderai-form-slot></div>`
 * tự tạo/tái dùng Biểu mẫu rồi thay chỗ trống bằng khối nhúng thật. Hành vi này KHÔNG phụ thuộc
 * `AI_LANDING_FORM_MODE` (test riêng ở `aiLandingPage.service.spec.js`) — người dùng có thể dán
 * tay chỗ trống, đây là test cho `landingPageAdmin.service.js` `create`/`update`.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
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

async function addLandingMembership(ownerId, employeeId, permissions = { landing_pages: true, forms: true }) {
  const { rows } = await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')
     RETURNING id`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
  return rows[0];
}

const SLOT_HTML = '<section><div data-founderai-form-slot></div></section>';
const TWO_SLOTS_HTML = `${SLOT_HTML}<section><div data-founderai-form-slot></div></section>`;
const NO_SLOT_HTML = '<section><p>không có chỗ trống</p></section>';
// Review PR-5b-2a nợ 1 — cùng nguyên văn ca review nêu (class + data-founderai-form-slot="").
const SLOT_WITH_EXTRA_ATTR_HTML = '<div class="my-8" data-founderai-form-slot=""></div>';
const MALFORMED_SLOT_HTML = '<div data-founderai-form-slot><p>x</p></div>';

describe('POST /api/admin/landing-pages — PR-5b-2a chỗ trống Biểu mẫu', () => {
  it('HTML có 1 chỗ trống + leadFormConfig occupation + 1 custom select → tạo 1 form đã xuất bản, gắn landing_page_id, đủ trường, HTML lưu có khối nhúng, không còn chỗ trống', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-c1' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'slot-create-1',
        title: 'Landing có chỗ trống',
        htmlContent: SLOT_HTML,
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
          customFields: [
            {
              key: 'cf_size',
              type: 'select',
              labelVi: 'Quy mô',
              required: false,
              options: [{ value: 'small', labelVi: 'Nhỏ' }],
            },
          ],
        },
      });
    expect(res.status).toBe(201);
    const landingId = res.body.data.id;

    // HTML lưu: có khối nhúng, không còn chỗ trống.
    const lpRow = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
    const savedHtml = lpRow.rows[0].html_content;
    expect(savedHtml).not.toContain('data-founderai-form-slot');
    expect(savedHtml).toMatch(/data-founderai-form="[A-Za-z0-9_-]+"/);
    expect(savedHtml).toContain('form-embed.js');

    // Đúng 1 form đã tạo, gắn landing_page_id, đã xuất bản, đủ trường.
    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(1);
    const form = formRows.rows[0];
    expect(Number(form.landing_page_id)).toBe(Number(landingId));
    expect(form.is_published).toBe(true);

    const publicKeyMatch = savedHtml.match(/data-founderai-form="([A-Za-z0-9_-]+)"/);
    expect(form.public_key).toBe(publicKeyMatch[1]);

    const roles = form.fields.map((f) => f.role).filter(Boolean);
    expect(roles).toEqual(['name', 'email', 'phone']);
    const labels = form.fields.map((f) => f.label);
    expect(labels).toContain('Nghề nghiệp');
    expect(labels).not.toContain('Lĩnh vực quan tâm');
    expect(labels).toContain('Quy mô');
  });

  it('HTML không có chỗ trống → không tạo form nào', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-c2' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'no-slot', title: 'Landing thường', htmlContent: NO_SLOT_HTML });
    expect(res.status).toBe(201);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(0);
  });

  it('HTML có 2 chỗ trống → 400, không tạo form, không lưu landing', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-c3' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'two-slots', title: 'Landing 2 chỗ trống', htmlContent: TWO_SLOTS_HTML });
    expect(res.status).toBe(400);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(0);
    const lpRows = await db.query('SELECT * FROM landing_pages WHERE slug = $1', ['two-slots']);
    expect(lpRows.rows).toHaveLength(0);
  });

  it('nhân viên lưu landing có chỗ trống → form thuộc workspace_owner_id của CHỦ, created_by_user_id = nhân viên', async () => {
    const owner = await createUserWithPlan({ userOverrides: { username: 'lp-slot-owner' } });
    const employee = await createUserWithPlan({ userOverrides: { username: 'lp-slot-employee' } });
    await addLandingMembership(owner.id, employee.id);
    const employeeToken = await loginAs(employee);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ slug: 'slot-employee', title: 'Landing nhân viên tạo', htmlContent: SLOT_HTML });
    expect(res.status).toBe(201);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [owner.id]);
    expect(formRows.rows).toHaveLength(1);
    expect(String(formRows.rows[0].created_by_user_id)).toBe(String(employee.id));
  });

  it('GET /api/public/forms/:publicKey của form vừa tạo → 200 (đã xuất bản)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-public' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-public', title: 'Landing public check', htmlContent: SLOT_HTML });
    expect(res.status).toBe(201);

    const formRow = await db.query('SELECT public_key FROM forms WHERE workspace_owner_id = $1', [me.id]);
    const publicKey = formRow.rows[0].public_key;

    const publicRes = await request(app).get(`/api/public/forms/${publicKey}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.publicKey).toBe(publicKey);
  });

  it('GET /api/forms/:id trả thêm landingPageId', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-getid' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-getid', title: 'Landing check landingPageId', htmlContent: SLOT_HTML });
    expect(createRes.status).toBe(201);
    const landingId = createRes.body.data.id;

    const formRow = await db.query('SELECT id FROM forms WHERE workspace_owner_id = $1', [me.id]);
    const formId = formRow.rows[0].id;

    const getRes = await request(app)
      .get(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.landingPageId).toBe(landingId);
  });

  // Review PR-5b-2a nợ 1 — ca ĐÚNG NGUYÊN VĂN review nêu: thêm class + data-founderai-form-slot=""
  // (cách viết HTML hợp lệ bình thường) trước đây bị đếm là 0, lưu ÂM THẦM cả div rỗng, không
  // tạo form. Giờ phải nhận ra và tạo form như chỗ trống "chuẩn".
  it('nợ 1 — chỗ trống có thêm thuộc tính (class + ="") vẫn được nhận ra → tạo form + thay chỗ trống', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-nodebt1a' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nodebt1a', title: 'Landing chỗ trống có class', htmlContent: SLOT_WITH_EXTRA_ATTR_HTML });
    expect(res.status).toBe(201);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(1);

    const lpRow = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [res.body.data.id]);
    expect(lpRow.rows[0].html_content).not.toContain('data-founderai-form-slot');
    expect(lpRow.rows[0].html_content).toContain(formRows.rows[0].public_key);
  });

  // Review PR-5b-2a nợ 1 — chỗ trống có nội dung con thật (hỏng dạng) → 400 rõ ràng, KHÔNG lưu
  // âm thầm div rỗng vô dụng.
  it('nợ 1 — chỗ trống sai dạng (có nội dung con) → 400, không tạo form, không lưu landing', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-nodebt1b' } });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nodebt1b', title: 'Landing chỗ trống hỏng', htmlContent: MALFORMED_SLOT_HTML });
    expect(res.status).toBe(400);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(0);
    const lpRows = await db.query('SELECT * FROM landing_pages WHERE slug = $1', ['nodebt1b']);
    expect(lpRows.rows).toHaveLength(0);
  });

  // Review PR-5b-2a nợ 2 — giao dịch lưu landing hỏng SAU KHI form đã tạo (form tạo qua pool,
  // TRƯỚC transaction insert landing) không được để lại form mồ côi. Ép insert landing lỗi
  // (deterministic, không cần đua race thật) để buộc nhánh catch chạy.
  it('nợ 2 — giao dịch lưu landing hỏng sau khi form đã tạo → không còn form mồ côi trong DB', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-nodebt2' } });
    const token = await loginAs(me);

    const insertSpy = jest
      .spyOn(landingPageRepository, 'insert')
      .mockRejectedValueOnce(new Error('nợ 2 test — ép insert landing lỗi sau khi form đã tạo'));

    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nodebt2', title: 'Landing giao dịch hỏng', htmlContent: SLOT_HTML });
    expect(res.status).toBe(500);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(0);
    const lpRows = await db.query('SELECT * FROM landing_pages WHERE slug = $1', ['nodebt2']);
    expect(lpRows.rows).toHaveLength(0);

    insertSpy.mockRestore();
  });

  it('GET /api/admin/landing-pages/:id trả linkedFormId khi landing có form gắn, null khi chưa có', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-linkedid' } });
    const token = await loginAs(me);

    const withFormRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'linked-yes', title: 'Landing có form', htmlContent: SLOT_HTML });
    const noFormRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'linked-no', title: 'Landing không form', htmlContent: NO_SLOT_HTML });

    const formRow = await db.query('SELECT id FROM forms WHERE workspace_owner_id = $1', [me.id]);
    const formId = formRow.rows[0].id;

    const getWithForm = await request(app)
      .get(`/api/admin/landing-pages/${withFormRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getWithForm.status).toBe(200);
    expect(getWithForm.body.data.linkedFormId).toBe(formId);

    const getNoForm = await request(app)
      .get(`/api/admin/landing-pages/${noFormRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getNoForm.status).toBe(200);
    expect(getNoForm.body.data.linkedFormId).toBeNull();
  });
});

describe('PUT /api/admin/landing-pages/:id — PR-5b-2a chỗ trống Biểu mẫu', () => {
  it('landing chưa có form gắn, cập nhật HTML có chỗ trống → tạo form mới, gắn landing_page_id, thay chỗ trống', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-u1' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-update-1', title: 'Landing chưa có form', htmlContent: NO_SLOT_HTML });
    const landingId = createRes.body.data.id;

    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-update-1', title: 'Landing chưa có form', htmlContent: SLOT_HTML });
    expect(updateRes.status).toBe(200);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(1);
    expect(Number(formRows.rows[0].landing_page_id)).toBe(Number(landingId));

    const lpRow = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
    expect(lpRow.rows[0].html_content).not.toContain('data-founderai-form-slot');
    expect(lpRow.rows[0].html_content).toContain(formRows.rows[0].public_key);
  });

  it('cập nhật landing ĐÃ có form gắn, HTML lại có chỗ trống → KHÔNG tạo form mới, dùng đúng publicKey cũ, trường form không bị ghi đè', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-u2' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'slot-update-2',
        title: 'Landing có form',
        htmlContent: SLOT_HTML,
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
          customFields: [],
        },
      });
    const landingId = createRes.body.data.id;
    const firstFormRow = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(firstFormRow.rows).toHaveLength(1);
    const firstForm = firstFormRow.rows[0];

    // Chủ tự sửa trực tiếp form (đổi title) — mô phỏng "chủ có thể đã sửa form" trong trình soạn riêng.
    await db.query('UPDATE forms SET title = $1 WHERE id = $2', ['Tiêu đề chủ tự sửa', firstForm.id]);

    // Cập nhật landing lần 2 với HTML lại có chỗ trống + leadFormConfig KHÁC (occupation tắt) —
    // nếu code lỡ tạo form mới hoặc ghi đè trường, test này bắt được ngay.
    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'slot-update-2',
        title: 'Landing có form',
        htmlContent: SLOT_HTML,
        leadFormConfig: {
          version: 1,
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [],
        },
      });
    expect(updateRes.status).toBe(200);

    const formRowsAfter = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRowsAfter.rows).toHaveLength(1); // vẫn chỉ 1 form — không đẻ thêm
    const formAfter = formRowsAfter.rows[0];
    expect(formAfter.id).toBe(firstForm.id);
    expect(formAfter.public_key).toBe(firstForm.public_key);
    expect(formAfter.title).toBe('Tiêu đề chủ tự sửa'); // KHÔNG bị ghi đè

    const lpRow = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
    expect(lpRow.rows[0].html_content).toContain(firstForm.public_key);
  });

  // Review PR-5b-2a nợ 3 — chủ tự tắt xuất bản form gắn landing (qua Forms admin), rồi lưu lại
  // landing (vẫn có chỗ trống) → khối nhúng trước đây vẫn trỏ vào form KHÔNG xuất bản, khách bấm
  // vào thấy "không tìm thấy". Chọn xuất bản lại (không tạo form mới, không báo lỗi chặn lưu).
  it('nợ 3 — form gắn landing đã bị tắt xuất bản, lưu landing lại có chỗ trống → tự xuất bản lại (không tạo form mới)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-nodebt3' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nodebt3', title: 'Landing form sẽ bị tắt', htmlContent: SLOT_HTML });
    const landingId = createRes.body.data.id;
    const formRow = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    const form = formRow.rows[0];
    expect(form.is_published).toBe(true);

    // Chủ tự tắt xuất bản form (mô phỏng PUT /api/forms/:id/publish isPublished=false).
    await db.query('UPDATE forms SET is_published = FALSE WHERE id = $1', [form.id]);

    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nodebt3', title: 'Landing form sẽ bị tắt', htmlContent: SLOT_HTML });
    expect(updateRes.status).toBe(200);

    const formAfter = await db.query('SELECT id, is_published FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formAfter.rows).toHaveLength(1); // không tạo form mới
    expect(formAfter.rows[0].id).toBe(form.id);
    expect(formAfter.rows[0].is_published).toBe(true); // được xuất bản lại

    // Khối nhúng vẫn trỏ đúng form đó, và public GET giờ phải 200 (đã xuất bản lại).
    const publicRes = await request(app).get(`/api/public/forms/${form.public_key}`);
    expect(publicRes.status).toBe(200);
  });

  it('HTML có 2 chỗ trống lúc update → 400, không đổi form/landing hiện có', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-u3' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-update-3', title: 'Landing', htmlContent: NO_SLOT_HTML });
    const landingId = createRes.body.data.id;
    // html_content lưu thật đã qua prepareLandingHtmlOnSave (chèn lp-track.js/founderai-capture.js)
    // nên khác nguyên văn NO_SLOT_HTML — chụp lại giá trị THẬT SỰ đã lưu để so "không đổi gì" cho
    // đúng, không so với chuỗi input thô.
    const beforeUpdate = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
    const htmlBeforeUpdate = beforeUpdate.rows[0].html_content;

    const updateRes = await request(app)
      .put(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-update-3', title: 'Landing', htmlContent: TWO_SLOTS_HTML });
    expect(updateRes.status).toBe(400);

    const formRows = await db.query('SELECT * FROM forms WHERE workspace_owner_id = $1', [me.id]);
    expect(formRows.rows).toHaveLength(0);
    const lpRow = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
    expect(lpRow.rows[0].html_content).toBe(htmlBeforeUpdate);
  });
});

describe('DELETE /api/admin/landing-pages/:id — PR-5b-2a', () => {
  it('xoá landing đã gắn form → form CÒN, landing_page_id NULL', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-slot-del' } });
    const token = await loginAs(me);

    const createRes = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slot-delete', title: 'Landing sẽ bị xoá', htmlContent: SLOT_HTML });
    const landingId = createRes.body.data.id;
    const formRow = await db.query('SELECT id FROM forms WHERE workspace_owner_id = $1', [me.id]);
    const formId = formRow.rows[0].id;

    const delRes = await request(app)
      .delete(`/api/admin/landing-pages/${landingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const formAfter = await db.query('SELECT id, landing_page_id FROM forms WHERE id = $1', [formId]);
    expect(formAfter.rows).toHaveLength(1);
    expect(formAfter.rows[0].landing_page_id).toBeNull();
  });
});
