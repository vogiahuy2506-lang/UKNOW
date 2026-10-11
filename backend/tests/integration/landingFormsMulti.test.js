/**
 * Integration tests cho PR-6 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — NHIỀU biểu mẫu / landing.
 *
 * Landing ↔ Biểu mẫu là nhiều–nhiều: nguồn sự thật = khối nhúng trong HTML đã lưu, bảng chỉ mục `landing_page_forms`
 * (migration 297) được ghi LẠI từ HTML trong cùng transaction lưu landing. Chỗ trống có loại
 * (`<div data-founderai-form-slot="booking">`) → mỗi chỗ tạo một biểu mẫu đúng loại. Trần kỹ thuật 20.
 * Nền: `landingFormSlotEmbed.test.js` (1 chỗ trống trần) và `landingLinkedForm.test.js` (khoá cũ `linkedFormId`) giữ hành vi cũ.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';
import landingPageRepository from '../../src/repositories/landingPage.repository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_297 = path.resolve(here, '..', '..', 'migrations', '297_landing_page_forms.sql');

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

const slot = (kind) => (kind === undefined ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const NO_SLOT_HTML = '<section><p>không có chỗ trống</p></section>';
const html3 = `<section>${slot()}</section><section>${slot('booking')}</section><section>${slot('payment')}</section>`;

async function postLanding(token, body) {
  return request(app).post('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`).send(body);
}
async function putLanding(token, id, body) {
  return request(app).put(`/api/admin/landing-pages/${id}`).set('Authorization', `Bearer ${token}`).send(body);
}
async function getLanding(token, id) {
  return request(app).get(`/api/admin/landing-pages/${id}`).set('Authorization', `Bearer ${token}`);
}
async function loadLanding(id) {
  const { rows } = await db.query('SELECT html_content, custom_config FROM landing_pages WHERE id = $1', [id]);
  return rows[0];
}
/** Hàng chỉ mục của landing, đúng thứ tự vị trí, kèm khoá công khai của biểu mẫu. */
async function indexRows(landingId) {
  const { rows } = await db.query(
    `SELECT lpf.form_id, lpf.position, lpf.kind, f.public_key, f.title, f.is_published, f.payment_config, f.booking_config, f.settings, f.fields
     FROM landing_page_forms lpf JOIN forms f ON f.id = lpf.form_id
     WHERE lpf.landing_page_id = $1 ORDER BY lpf.position`,
    [landingId]
  );
  return rows;
}
/** Khoá nhúng theo thứ tự xuất hiện trong HTML đã lưu. */
function embedKeysInOrder(html) {
  return [...String(html).matchAll(/data-founderai-form="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
}
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
const embedSection = (key) =>
  `<section data-founderai-form-section><div data-founderai-form="${key}"></div><script src="https://app.example/form-embed.js" defer></script></section>`;

describe('PR-6 — landing có NHIỀU chỗ trống có loại (create)', () => {
  it('3 chỗ trống (trần / booking / payment) → 3 biểu mẫu đúng loại, đã xuất bản, chỉ mục 3 dòng đúng thứ tự, payment chưa có payment_config', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-c1' } });
    const token = await loginAs(me);

    const res = await postLanding(token, { slug: 'multi-c1', title: 'Landing ba form', htmlContent: html3 });
    expect(res.status).toBe(201);
    const landingId = res.body.data.id;

    const saved = (await loadLanding(landingId)).html_content;
    expect(saved).not.toContain('data-founderai-form-slot');
    const keys = embedKeysInOrder(saved);
    expect(keys).toHaveLength(3);

    const rows = await indexRows(landingId);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.kind)).toEqual(['consult', 'booking', 'payment']);
    // thứ tự chỉ mục == thứ tự khối nhúng trong HTML
    expect(rows.map((r) => r.public_key)).toEqual(keys);
    expect(rows.every((r) => r.is_published === true)).toBe(true);
    expect(rows.map((r) => r.title)).toEqual([
      'Landing ba form',
      'Landing ba form - Đặt lịch hẹn',
      'Landing ba form - Thu tiền / đặt cọc',
    ]);

    const [consult, booking, payment] = rows;
    // consult: trường dựng từ leadFormConfig như trước (name/email/phone), consent + thông báo chủ bật
    expect(consult.fields.map((f) => f.role).filter(Boolean)).toEqual(['name', 'email', 'phone']);
    expect(consult.settings.consentEnabled).toBe(true);
    expect(consult.settings.notifyOwner).toBe(true);
    expect(consult.booking_config).toBeNull();
    expect(consult.payment_config).toBeNull();
    // booking: khung giờ mặc định của mẫu (bật đặt lịch bắt buộc có khung giờ), Email bắt buộc, gửi xác nhận bật
    expect(booking.booking_config.enabled).toBe(true);
    expect(booking.booking_config.weeklySlots['1']).toEqual(['09:00', '14:00']);
    expect(booking.fields.find((f) => f.role === 'email').required).toBe(true);
    expect(booking.settings.sendConfirmation).toBe(true);
    expect(booking.settings.consentEnabled).toBe(true);
    expect(booking.payment_config).toBeNull();
    // payment (QĐ4): hệ thống KHÔNG BAO GIỜ điền tiền / tài khoản
    expect(payment.payment_config).toBeNull();
    expect(payment.booking_config).toBeNull();
    expect(payment.settings.consentEnabled).toBe(true);

    // mọi biểu mẫu mở được công khai ngay
    for (const row of rows) {
      const pub = await request(app).get(`/api/public/forms/${row.public_key}`);
      expect(pub.status).toBe(200);
    }
  });

  it('DTO: linkedForms đủ 3 phần tử đúng thứ tự + loại; cờ cần bổ sung CHỈ ở payment; khoá đơn cũ = biểu mẫu đầu tiên', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-dto' } });
    const token = await loginAs(me);
    const landingId = (await postLanding(token, { slug: 'multi-dto', title: 'Landing DTO', htmlContent: html3 })).body.data.id;

    const got = await getLanding(token, landingId);
    expect(got.status).toBe(200);
    const forms = got.body.data.linkedForms;
    expect(forms.map((f) => f.kind)).toEqual(['consult', 'booking', 'payment']);
    expect(forms.map((f) => f.position)).toEqual([0, 1, 2]);
    expect(forms.map((f) => f.needsPaymentSetup)).toEqual([false, false, true]);
    expect(forms.every((f) => f.isPublished === true)).toBe(true);
    expect(got.body.data.linkedFormId).toBe(forms[0].id);
    expect(got.body.data.linkedFormPublicKey).toBe(forms[0].publicKey);
    expect(got.body.data.linkedFormTitle).toBe('Landing DTO');

    // Danh sách landing cũng trả đủ linkedForms
    const list = await request(app).get('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.find((r) => r.id === landingId).linkedForms).toHaveLength(3);

    // Chủ khai thanh toán trong trình soạn Biểu mẫu → cờ tự hết (tính khi đọc, không cần ai dọn)
    const paymentFormId = forms[2].id;
    await db.query(`UPDATE forms SET payment_config = $2::jsonb WHERE id = $1`, [
      paymentFormId,
      JSON.stringify({ enabled: true, methods: ['bank'], method: 'bank', amount: 500000, holdMinutes: 30 }),
    ]);
    const after = await getLanding(token, landingId);
    expect(after.body.data.linkedForms.map((f) => f.needsPaymentSetup)).toEqual([false, false, false]);
  });

  it('HTML cũ 1 chỗ trống TRẦN vẫn chạy như trước: 1 biểu mẫu consult, tiêu đề = tên trang, kind consult', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-legacy' } });
    const token = await loginAs(me);
    const res = await postLanding(token, { slug: 'multi-legacy', title: 'Trang cũ', htmlContent: `<section>${slot()}</section>` });
    expect(res.status).toBe(201);
    const rows = await indexRows(res.body.data.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('consult');
    expect(rows[0].title).toBe('Trang cũ');
    expect(rows[0].position).toBe(0);
  });

  it('hai chỗ trống CÙNG loại → hai biểu mẫu khác tiêu đề (hậu tố thứ tự), không đè nhau', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-dup' } });
    const token = await loginAs(me);
    const res = await postLanding(token, {
      slug: 'multi-dup',
      title: 'Landing',
      htmlContent: `${slot('survey')}<p>x</p>${slot('survey')}${slot()}${slot('consult')}`,
    });
    expect(res.status).toBe(201);
    const rows = await indexRows(res.body.data.id);
    expect(rows.map((r) => r.kind)).toEqual(['survey', 'survey', 'consult', 'consult']);
    expect(rows.map((r) => r.title)).toEqual([
      'Landing - Khảo sát',
      'Landing - Khảo sát (2)',
      'Landing',
      'Landing - Đăng ký tư vấn (2)',
    ]);
    expect(new Set(rows.map((r) => r.public_key)).size).toBe(4);
  });

  it('trần kỹ thuật: đúng 20 chỗ trống → 201 (20 dòng chỉ mục); 21 chỗ trống → 400, không tạo biểu mẫu, không lưu landing', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-cap' } });
    const token = await loginAs(me);

    const twenty = Array.from({ length: 20 }, () => slot('blank')).join('');
    const ok = await postLanding(token, { slug: 'multi-cap-20', title: 'Hai mươi', htmlContent: twenty });
    expect(ok.status).toBe(201);
    expect(await indexRows(ok.body.data.id)).toHaveLength(20);

    const formsBefore = (await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c;
    const over = await postLanding(token, {
      slug: 'multi-cap-21',
      title: 'Hai mốt',
      htmlContent: Array.from({ length: 21 }, () => slot()).join(''),
    });
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/tối đa 20/);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(formsBefore);
    expect((await db.query(`SELECT 1 FROM landing_pages WHERE slug = 'multi-cap-21'`)).rows).toHaveLength(0);
  });

  it('loại LẠ (data-founderai-form-slot="contact") → 400 nêu giá trị lạ + loại hợp lệ, không tạo gì', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-badkind' } });
    const token = await loginAs(me);
    const res = await postLanding(token, {
      slug: 'multi-badkind',
      title: 'Loại lạ',
      htmlContent: `${slot('booking')}${slot('contact')}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('"contact"');
    expect(res.body.message).toContain('consult, booking, payment, survey, blank');
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(0);
    expect((await db.query(`SELECT 1 FROM landing_pages WHERE slug = 'multi-badkind'`)).rows).toHaveLength(0);
  });

  it('khoá nhúng của workspace KHÁC dán tay vào HTML → landing lưu được nhưng KHÔNG vào chỉ mục', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-foreign-a' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'multi-foreign-b' } });
    const token = await loginAs(me);
    const foreignForm = await insertUserForm(other.id, { title: 'Của người khác' });

    const res = await postLanding(token, {
      slug: 'multi-foreign',
      title: 'Dán khoá lạ',
      htmlContent: `${embedSection(foreignForm.public_key)}${slot('booking')}`,
    });
    expect(res.status).toBe(201);
    const rows = await indexRows(res.body.data.id);
    expect(rows.map((r) => r.kind)).toEqual(['booking']); // chỉ biểu mẫu vừa tạo của mình
    expect(rows.map((r) => String(r.form_id))).not.toContain(String(foreignForm.id));
  });

  it('giao dịch lưu landing hỏng sau khi tạo 3 biểu mẫu → không còn biểu mẫu mồ côi nào, không có chỉ mục', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-orphan' } });
    const token = await loginAs(me);
    const spy = jest.spyOn(landingPageRepository, 'insert').mockRejectedValueOnce(new Error('ép insert landing lỗi'));
    const res = await postLanding(token, { slug: 'multi-orphan', title: 'Hỏng', htmlContent: html3 });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(0);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM landing_page_forms')).rows[0].c).toBe(0);
  });
});

describe('PR-6 — sửa landing nhiều biểu mẫu (update): lưu–mở lại–bỏ–đổi thứ tự', () => {
  async function createThree(token, slug) {
    const res = await postLanding(token, { slug, title: `Landing ${slug}`, htmlContent: html3 });
    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  it('lưu lại đúng HTML đã lưu (đủ 3 khối nhúng, không chỗ trống) → không tạo biểu mẫu mới, chỉ mục giữ nguyên + giữ kind', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u1' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u1');
    const before = await indexRows(landingId);
    const html = (await getLanding(token, landingId)).body.data.htmlContent;

    const res = await putLanding(token, landingId, { slug: 'multi-u1', title: 'Landing multi-u1', htmlContent: html });
    expect(res.status).toBe(200);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(3);
    const after = await indexRows(landingId);
    expect(after.map((r) => [r.form_id, r.position, r.kind])).toEqual(before.map((r) => [r.form_id, r.position, r.kind]));
    expect(res.body.data.linkedForms.map((f) => f.kind)).toEqual(['consult', 'booking', 'payment']);
  });

  it('BỎ một biểu mẫu khỏi HTML → chỉ mục còn 2 dòng đánh lại vị trí 0,1; biểu mẫu + bài nộp của nó còn nguyên', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u2' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u2');
    const rows = await indexRows(landingId);
    const removed = rows[1]; // booking
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, respondent_name, respondent_email, marketing_consent)
       VALUES ($1, $2, $3, 'Khách', 'k@example.com', TRUE)`,
      [removed.form_id, me.id, crypto.randomBytes(16).toString('hex')]
    );
    const html = (await getLanding(token, landingId)).body.data.htmlContent;
    const sectionRe = new RegExp(`<section data-founderai-form-section>\\s*<div data-founderai-form="${removed.public_key}"></div>[\\s\\S]*?</section>`);
    expect(html).toMatch(sectionRe);
    const next = html.replace(sectionRe, '');

    const res = await putLanding(token, landingId, { slug: 'multi-u2', title: 'Landing multi-u2', htmlContent: next });
    expect(res.status).toBe(200);

    const after = await indexRows(landingId);
    expect(after.map((r) => r.position)).toEqual([0, 1]);
    expect(after.map((r) => r.kind)).toEqual(['consult', 'payment']);
    expect(after.map((r) => String(r.form_id))).not.toContain(String(removed.form_id));
    expect((await loadLanding(landingId)).html_content).not.toContain(removed.public_key);

    // Biểu mẫu bị bỏ khỏi trang vẫn còn trong mục Biểu mẫu cùng bài nộp; cột đơn cũ về NULL (không còn trang nào)
    const formRow = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [removed.form_id]);
    expect(formRow.rows).toHaveLength(1);
    expect(formRow.rows[0].landing_page_id).toBeNull();
    expect((await db.query('SELECT 1 FROM form_submissions WHERE form_id = $1', [removed.form_id])).rows).toHaveLength(1);
  });

  it('ĐỔI THỨ TỰ các khối nhúng trong HTML → chỉ mục đổi vị trí theo; kind đi theo biểu mẫu', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u3' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u3');
    const rows = await indexRows(landingId);
    const html = (await getLanding(token, landingId)).body.data.htmlContent;
    const block = (key) => new RegExp(`<section data-founderai-form-section>\\s*<div data-founderai-form="${key}"></div>[\\s\\S]*?</section>`);
    const [a, b, c] = rows.map((r) => html.match(block(r.public_key))[0]);
    // đảo: payment, consult, booking
    let next = html.replace(a, '@@A@@').replace(b, '@@B@@').replace(c, '@@C@@');
    next = next.replace('@@A@@', b).replace('@@B@@', c).replace('@@C@@', a);
    // (A→b tại vị trí 1, B→c tại vị trí 2, C→a tại vị trí 3) = booking, payment, consult

    const res = await putLanding(token, landingId, { slug: 'multi-u3', title: 'Landing multi-u3', htmlContent: next });
    expect(res.status).toBe(200);
    const after = await indexRows(landingId);
    expect(after.map((r) => r.kind)).toEqual(['booking', 'payment', 'consult']);
    expect(after.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(after.map((r) => r.public_key)).toEqual([rows[1].public_key, rows[2].public_key, rows[0].public_key]);
  });

  it('THÊM chỗ trống có loại vào trang đã có biểu mẫu → tạo thêm đúng 1 biểu mẫu mới, 3 biểu mẫu cũ không đổi', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u4' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u4');
    const before = await indexRows(landingId);
    const html = (await getLanding(token, landingId)).body.data.htmlContent;
    const next = `${html}${slot('survey')}`;

    const res = await putLanding(token, landingId, { slug: 'multi-u4', title: 'Landing multi-u4', htmlContent: next });
    expect(res.status).toBe(200);
    const after = await indexRows(landingId);
    expect(after.map((r) => r.kind)).toEqual(['consult', 'booking', 'payment', 'survey']);
    expect(after.slice(0, 3).map((r) => String(r.form_id))).toEqual(before.map((r) => String(r.form_id)));
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(4);
  });

  it('chỗ trống CÓ GIÁ TRỊ LOẠI (consult tường minh) KHÔNG tái dùng biểu mẫu cũ, còn chỗ trống TRẦN thì tái dùng', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u5' } });
    const token = await loginAs(me);
    const landingId = (await postLanding(token, { slug: 'multi-u5', title: 'Landing u5', htmlContent: slot() })).body.data.id;
    const first = (await indexRows(landingId))[0];

    // Trang viết lại: khối nhúng cũ biến mất, thay bằng chỗ trống TRẦN → tái dùng form cũ
    let res = await putLanding(token, landingId, { slug: 'multi-u5', title: 'Landing u5', htmlContent: slot() });
    expect(res.status).toBe(200);
    let rows = await indexRows(landingId);
    expect(rows.map((r) => String(r.form_id))).toEqual([String(first.form_id)]);

    // Chỗ trống consult TƯỜNG MINH = "tạo biểu mẫu mới" → không tái dùng
    res = await putLanding(token, landingId, { slug: 'multi-u5', title: 'Landing u5', htmlContent: slot('consult') });
    expect(res.status).toBe(200);
    rows = await indexRows(landingId);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].form_id)).not.toBe(String(first.form_id));
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(2);
  });

  it('lưu hỏng (UPDATE landing lỗi) khi đang thêm chỗ trống → biểu mẫu mới bị dọn, chỉ mục + HTML cũ giữ nguyên', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u6' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u6');
    const before = await indexRows(landingId);
    const htmlBefore = (await loadLanding(landingId)).html_content;

    const spy = jest.spyOn(landingPageRepository, 'updateByIdInScope').mockRejectedValueOnce(new Error('ép UPDATE landing lỗi'));
    const res = await putLanding(token, landingId, {
      slug: 'multi-u6',
      title: 'Landing multi-u6',
      htmlContent: `${htmlBefore}${slot('survey')}`,
    });
    spy.mockRestore();
    expect(res.status).toBe(500);

    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(3);
    const after = await indexRows(landingId);
    expect(after.map((r) => [r.form_id, r.position])).toEqual(before.map((r) => [r.form_id, r.position]));
    expect((await loadLanding(landingId)).html_content).toBe(htmlBefore);
  });

  it('update: tổng chỗ trống + khối nhúng vượt 20 → 400, không đổi gì', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-u7' } });
    const token = await loginAs(me);
    const landingId = await createThree(token, 'multi-u7');
    const htmlBefore = (await loadLanding(landingId)).html_content;
    // 3 khối nhúng đã có + 18 chỗ trống = 21
    const res = await putLanding(token, landingId, {
      slug: 'multi-u7',
      title: 'Landing multi-u7',
      htmlContent: `${htmlBefore}${Array.from({ length: 18 }, () => slot('blank')).join('')}`,
    });
    expect(res.status).toBe(400);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(3);
    expect((await loadLanding(landingId)).html_content).toBe(htmlBefore);
  });
});

describe('PR-6 — gắn biểu mẫu CÓ SẴN bằng danh sách linkedFormIds; một biểu mẫu dùng cho nhiều landing', () => {
  it('một biểu mẫu gắn 2 landing (không còn 409): cả hai chỉ mục có nó; DTO cả hai trang trả nó; bài nộp ghi đúng slug từng trang', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-share' } });
    const token = await loginAs(me);
    // Landing phải ĐÃ XUẤT BẢN thì bài nộp mới ghi được landingPageSlug (cùng luật PR-7a).
    const a = (await postLanding(token, { slug: 'share-a', title: 'Trang A', htmlContent: slot(), isPublished: true })).body.data.id;
    const formOfA = (await indexRows(a))[0];
    const b = (await postLanding(token, { slug: 'share-b', title: 'Trang B', htmlContent: NO_SLOT_HTML, isPublished: true })).body.data.id;

    const res = await putLanding(token, b, {
      slug: 'share-b',
      title: 'Trang B',
      htmlContent: NO_SLOT_HTML,
      isPublished: true,
      linkedFormIds: [formOfA.form_id],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.linkedForms.map((f) => f.id)).toEqual([formOfA.form_id]);

    expect((await indexRows(a)).map((r) => String(r.form_id))).toEqual([String(formOfA.form_id)]);
    expect((await indexRows(b)).map((r) => String(r.form_id))).toEqual([String(formOfA.form_id)]);
    // HTML trang B nhúng đúng khoá
    expect(embedKeysInOrder((await loadLanding(b)).html_content)).toEqual([formOfA.public_key]);
    // 1 biểu mẫu, không đẻ thêm
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(1);

    // Bài nộp từ hai landing ghi đúng slug từng trang
    const formRow = (await db.query('SELECT fields FROM forms WHERE id = $1', [formOfA.form_id])).rows[0];
    const answers = {};
    for (const f of formRow.fields) {
      if (f.type === 'email') answers[f.key] = 'khach@example.com';
      else if (f.type === 'phone') answers[f.key] = '0901234567';
      else if (['select', 'radio'].includes(f.type)) answers[f.key] = f.options[0].value;
      else if (f.type === 'checkbox') answers[f.key] = [f.options[0].value];
      else answers[f.key] = 'Nguyễn Văn A';
    }
    for (const slug of ['share-a', 'share-b']) {
      const sub = await request(app)
        .post(`/api/public/forms/${formOfA.public_key}/submissions`)
        .send({ answers, landingPageSlug: slug, marketingConsent: true });
      expect(sub.status).toBe(201);
    }
    const slugs = await db.query('SELECT landing_page_slug FROM form_submissions WHERE form_id = $1 ORDER BY id', [formOfA.form_id]);
    expect(slugs.rows.map((r) => r.landing_page_slug)).toEqual(['share-a', 'share-b']);
  });

  it('linkedFormIds nhiều biểu mẫu chưa nhúng: nối vào CUỐI trang đúng thứ tự mảng, biểu mẫu nháp được xuất bản, vẫn giữ biểu mẫu cũ', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-append' } });
    const token = await loginAs(me);
    const landingId = (await postLanding(token, {
      slug: 'multi-append',
      title: 'Landing',
      htmlContent: `<html><body><section>${slot('booking')}</section></body></html>`,
    })).body.data.id;
    const existing = (await indexRows(landingId))[0];
    const x = await insertUserForm(me.id, { title: 'Form X', isPublished: false });
    const y = await insertUserForm(me.id, { title: 'Form Y' });
    const html = (await loadLanding(landingId)).html_content;

    const res = await putLanding(token, landingId, {
      slug: 'multi-append',
      title: 'Landing',
      htmlContent: html,
      linkedFormIds: [y.id, x.id, existing.form_id], // existing đã nhúng → giữ chỗ cũ, không nhúng lần hai
    });
    expect(res.status).toBe(200);

    const saved = (await loadLanding(landingId)).html_content;
    expect(embedKeysInOrder(saved)).toEqual([existing.public_key, y.public_key, x.public_key]);
    expect(saved.indexOf(y.public_key)).toBeLessThan(saved.indexOf('</body>'));
    const rows = await indexRows(landingId);
    expect(rows.map((r) => String(r.form_id))).toEqual([String(existing.form_id), String(y.id), String(x.id)]);
    expect(rows.map((r) => r.kind)).toEqual(['booking', null, null]);
    expect(rows.every((r) => r.is_published === true)).toBe(true); // X nháp → đã xuất bản
    expect(res.body.data.linkedForms.map((f) => f.title)).toEqual([existing.title, 'Form Y', 'Form X']);
  });

  it('linkedFormIds: workspace khác → 404; bị khoá → 400; không phải mảng / phần tử sai → 400; nhân viên thiếu quyền forms → 403; không đổi gì khi lỗi', async () => {
    const owner = await createUserWithPlan({ userOverrides: { username: 'multi-val-o' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'multi-val-x' } });
    const employee = await createUserWithPlan({ userOverrides: { username: 'multi-val-e' } });
    const token = await loginAs(owner);
    const landingId = (await postLanding(token, { slug: 'multi-val', title: 'Landing', htmlContent: slot() })).body.data.id;
    const before = await indexRows(landingId);
    const htmlBefore = (await loadLanding(landingId)).html_content;
    const base = { slug: 'multi-val', title: 'Landing', htmlContent: htmlBefore };

    const foreign = await insertUserForm(other.id);
    const disabled = await insertUserForm(owner.id, { adminDisabledAt: new Date() });
    const ok = await insertUserForm(owner.id);

    expect((await putLanding(token, landingId, { ...base, linkedFormIds: [foreign.id] })).status).toBe(404);
    expect((await putLanding(token, landingId, { ...base, linkedFormIds: [ok.id, disabled.id] })).status).toBe(400);
    expect((await putLanding(token, landingId, { ...base, linkedFormIds: 'abc' })).status).toBe(400);
    for (const bad of [[0], [-1], ['x'], [1.5], [{}], [true]]) {
      expect((await putLanding(token, landingId, { ...base, linkedFormIds: bad })).status).toBe(400);
    }

    const { rows: members } = await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active') RETURNING id`,
      [owner.id, employee.id, JSON.stringify({ landing_pages: true })]
    );
    const employeeToken = await loginAs(employee);
    const asEmployee = (payload) =>
      request(app)
        .put(`/api/admin/landing-pages/${landingId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Owner-Context', String(owner.id))
        .send(payload);
    expect((await asEmployee({ ...base, linkedFormIds: [ok.id] })).status).toBe(403);

    // Không đổi gì sau mọi lần lỗi
    expect((await loadLanding(landingId)).html_content).toBe(htmlBefore);
    expect((await indexRows(landingId)).map((r) => String(r.form_id))).toEqual(before.map((r) => String(r.form_id)));

    // Có quyền forms → gắn được
    await db.query('UPDATE user_members SET permissions = $2::jsonb WHERE id = $1', [
      members[0].id,
      JSON.stringify({ landing_pages: true, forms: true }),
    ]);
    const allowed = await asEmployee({ ...base, linkedFormIds: [ok.id] });
    expect(allowed.status).toBe(200);
    expect((await indexRows(landingId)).map((r) => String(r.form_id))).toContain(String(ok.id));
  });

  it('khoá cũ linkedFormId (số) vẫn thay đúng chỗ trống trần và ghi chỉ mục = [biểu mẫu chọn]; biểu mẫu tự sinh cũ rời trang nhưng còn', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-legacy-link' } });
    const token = await loginAs(me);
    const landingId = (await postLanding(token, { slug: 'multi-legacy-link', title: 'Landing', htmlContent: slot() })).body.data.id;
    const auto = (await indexRows(landingId))[0];
    const x = await insertUserForm(me.id, { title: 'Chọn tay' });

    const res = await putLanding(token, landingId, {
      slug: 'multi-legacy-link',
      title: 'Landing',
      htmlContent: slot(),
      linkedFormId: x.id,
    });
    expect(res.status).toBe(200);
    expect((await indexRows(landingId)).map((r) => String(r.form_id))).toEqual([String(x.id)]);
    expect(res.body.data.linkedFormSource).toBe('chosen');
    // Biểu mẫu tự sinh cũ: còn trong mục Biểu mẫu, hết gắn trang
    const old = await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [auto.form_id]);
    expect(old.rows).toHaveLength(1);
    expect(old.rows[0].landing_page_id).toBeNull();
  });
});

describe('PR-6 — chỉ mục & cột đơn cũ forms.landing_page_id', () => {
  it('cột đơn cũ = landing GẮN SỚM NHẤT của biểu mẫu: gỡ khỏi landing đầu mà còn ở landing khác thì chuyển sang landing kia, không NULL oan', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-legacycol' } });
    const token = await loginAs(me);
    const a = (await postLanding(token, { slug: 'lc-a', title: 'A', htmlContent: slot() })).body.data.id;
    const form = (await indexRows(a))[0];
    const b = (await postLanding(token, { slug: 'lc-b', title: 'B', htmlContent: NO_SLOT_HTML })).body.data.id;
    expect(
      (await putLanding(token, b, { slug: 'lc-b', title: 'B', htmlContent: NO_SLOT_HTML, linkedFormIds: [form.form_id] })).status
    ).toBe(200);
    const col = async () => (await db.query('SELECT landing_page_id FROM forms WHERE id = $1', [form.form_id])).rows[0].landing_page_id;
    expect(Number(await col())).toBe(Number(a)); // gắn sớm nhất

    // Gỡ khỏi A (HTML A không còn khối nhúng)
    expect((await putLanding(token, a, { slug: 'lc-a', title: 'A', htmlContent: NO_SLOT_HTML })).status).toBe(200);
    expect(Number(await col())).toBe(Number(b));

    // Gỡ khỏi B → hết trang nào → NULL
    expect((await putLanding(token, b, { slug: 'lc-b', title: 'B', htmlContent: NO_SLOT_HTML })).status).toBe(200);
    expect(await col()).toBeNull();
  });

  it('xoá landing → dòng chỉ mục mất theo (CASCADE), biểu mẫu còn; xoá biểu mẫu → dòng chỉ mục mất, landing còn', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-cascade' } });
    const token = await loginAs(me);
    const a = (await postLanding(token, { slug: 'cas-a', title: 'A', htmlContent: `${slot()}${slot('booking')}` })).body.data.id;
    const rows = await indexRows(a);
    const b = (await postLanding(token, { slug: 'cas-b', title: 'B', htmlContent: NO_SLOT_HTML })).body.data.id;
    await putLanding(token, b, { slug: 'cas-b', title: 'B', htmlContent: NO_SLOT_HTML, linkedFormIds: [rows[0].form_id] });

    const del = await request(app).delete(`/api/admin/landing-pages/${a}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM landing_page_forms WHERE landing_page_id = $1', [a])).rows[0].c).toBe(0);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM forms')).rows[0].c).toBe(2);
    // biểu mẫu vẫn gắn B
    expect((await indexRows(b)).map((r) => String(r.form_id))).toEqual([String(rows[0].form_id)]);

    await db.query('DELETE FROM forms WHERE id = $1', [rows[0].form_id]);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM landing_page_forms WHERE form_id = $1', [rows[0].form_id])).rows[0].c).toBe(0);
    expect((await db.query('SELECT 1 FROM landing_pages WHERE id = $1', [b])).rows).toHaveLength(1);
  });
});

describe('PR-6 — migration 297: backfill từ forms.landing_page_id', () => {
  it('chạy file migration thật: mỗi form đang gắn landing → 1 dòng position 0; form không gắn không có dòng; chạy lại không nhân đôi', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'multi-backfill' } });
    const lp1 = Number((await db.query(
      `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, is_published) VALUES ($1, $1, 'bf-1', TRUE) RETURNING id`,
      [me.id]
    )).rows[0].id);
    const lp2 = Number((await db.query(
      `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, is_published) VALUES ($1, $1, 'bf-2', TRUE) RETURNING id`,
      [me.id]
    )).rows[0].id);
    const f1 = await insertUserForm(me.id, { title: 'Gắn lp1' });
    const f2 = await insertUserForm(me.id, { title: 'Gắn lp2' });
    const f3 = await insertUserForm(me.id, { title: 'Không gắn' });
    await db.query('UPDATE forms SET landing_page_id = $2 WHERE id = $1', [f1.id, lp1]);
    await db.query('UPDATE forms SET landing_page_id = $2 WHERE id = $1', [f2.id, lp2]);
    await db.query('DELETE FROM landing_page_forms'); // mô phỏng trạng thái TRƯỚC migration

    const sql = fs.readFileSync(MIGRATION_297, 'utf8');
    await db.query(sql);
    let rows = (await db.query('SELECT landing_page_id, form_id, position, kind FROM landing_page_forms ORDER BY form_id')).rows;
    expect(rows.map((r) => [String(r.landing_page_id), String(r.form_id), r.position, r.kind])).toEqual([
      [String(lp1), String(f1.id), 0, null],
      [String(lp2), String(f2.id), 0, null],
    ]);
    expect(rows.map((r) => String(r.form_id))).not.toContain(String(f3.id));

    await db.query(sql); // chạy lại
    rows = (await db.query('SELECT 1 FROM landing_page_forms')).rows;
    expect(rows).toHaveLength(2);
  });
});
