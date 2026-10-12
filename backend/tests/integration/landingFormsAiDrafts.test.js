/**
 * Integration tests cho PR-7a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — NHÁP biểu mẫu AI theo chỗ trống lúc LƯU landing.
 *
 * AI landing (cờ AI_LANDING_FORM_MODE=form) đặt chỗ trống có loại và soạn nháp trường cho từng chỗ; trình duyệt gửi `formDrafts` kèm
 * `POST/PUT /api/admin/landing-pages`. Nháp đến từ CLIENT nên KHÔNG tin: chuẩn hoá lại bằng bộ chuẩn hoá thật, ÉP paymentConfig = null,
 * đồng ý + báo chủ = true; nháp sai loại / hỏng → dùng mẫu backend như PR-6 (lượt lưu không bao giờ hỏng vì nháp).
 * Nền: landingFormsMulti.test.js (không nháp → y như PR-6) vẫn xanh.
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
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function createUserWithPlan(username) {
  const user = await createUser({ role: 'user', username });
  const plan = await createPlan({});
  await assignPlanToUser(user.id, plan.id);
  return user;
}

const slot = (kind) => (kind === undefined ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const html3 = `<section>${slot()}</section><section>${slot('booking')}</section><section>${slot('payment')}</section>`;

const post = (token, body) => request(app).post('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`).send(body);
const put = (token, id, body) => request(app).put(`/api/admin/landing-pages/${id}`).set('Authorization', `Bearer ${token}`).send(body);
const getOne = (token, id) => request(app).get(`/api/admin/landing-pages/${id}`).set('Authorization', `Bearer ${token}`);

async function indexRows(landingId) {
  const { rows } = await db.query(
    `SELECT lpf.position, lpf.kind, f.public_key, f.title, f.description, f.is_published, f.payment_config, f.booking_config, f.settings, f.fields
     FROM landing_page_forms lpf JOIN forms f ON f.id = lpf.form_id
     WHERE lpf.landing_page_id = $1 ORDER BY lpf.position`,
    [landingId]
  );
  return rows;
}

const nameField = { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' };
const phoneField = { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' };
const emailField = { label: 'Email', type: 'email', required: true, role: 'email' };

const bookingDraft = (over = {}) => ({
  slotIndex: 1,
  kind: 'booking',
  title: 'Đặt lịch khám răng',
  description: 'Chọn giờ khám phù hợp với bạn',
  fields: [nameField, phoneField, emailField, { label: 'Bạn cần khám gì?', type: 'radio', required: true, options: ['Trám răng', 'Niềng răng'] }],
  settings: { submitButtonText: 'Đặt lịch khám', successMessage: 'Hẹn gặp bạn!', sendConfirmation: true },
  bookingConfig: { enabled: true, weeklySlots: { 2: ['08:00', '10:00'] }, daysAhead: 14 },
  needsAttention: ['booking'],
  ...over,
});

const paymentDraft = (over = {}) => ({
  slotIndex: 2,
  kind: 'payment',
  title: 'Giữ chỗ khoá IELTS',
  description: null,
  fields: [nameField, phoneField, { label: 'Trình độ hiện tại', type: 'select', required: true, options: ['A1', 'B1', 'C1'] }],
  settings: { submitButtonText: 'Giữ chỗ', successMessage: 'Cảm ơn bạn đã giữ chỗ!' },
  bookingConfig: null,
  needsAttention: ['payment'],
  ...over,
});

const templateLabels = { payment: ['Họ và tên', 'Số điện thoại', 'Địa chỉ Email', 'Ghi chú'] };

describe('PR-7a — lưu landing có nháp biểu mẫu AI theo chỗ trống (create)', () => {
  it('3 chỗ trống (trần / booking / payment) + nháp booking & payment → biểu mẫu dùng TRƯỜNG + TIÊU ĐỀ của nháp; payment_config null + cờ cần bổ sung; consult vẫn dựng từ leadFormConfig', async () => {
    const me = await createUserWithPlan('ai-draft-c1');
    const token = await loginAs(me);

    const res = await post(token, {
      slug: 'ai-draft-c1',
      title: 'Nha khoa Sáng',
      htmlContent: html3,
      formDrafts: [bookingDraft(), paymentDraft()],
    });
    expect(res.status).toBe(201);
    const landingId = res.body.data.id;

    const rows = await indexRows(landingId);
    expect(rows.map((r) => r.kind)).toEqual(['consult', 'booking', 'payment']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.every((r) => r.is_published === true)).toBe(true);
    expect(rows.map((r) => r.title)).toEqual(['Nha khoa Sáng', 'Đặt lịch khám răng', 'Giữ chỗ khoá IELTS']);

    const [consult, booking, payment] = rows;
    // consult: KHÔNG đổi — trường dựng từ leadFormConfig (họ tên / email / SĐT), không phải từ nháp
    expect(consult.fields.map((f) => f.role).filter(Boolean)).toEqual(['name', 'email', 'phone']);
    expect(consult.settings.consentEnabled).toBe(true);

    // booking: trường của nháp (đã chuẩn hoá, có khoá), mô tả + cài đặt của nháp, khung giờ của nháp đi qua normalizeBookingConfig
    expect(booking.fields.map((f) => f.label)).toEqual(['Họ và tên', 'Số điện thoại', 'Email', 'Bạn cần khám gì?']);
    expect(booking.fields.every((f) => typeof f.key === 'string' && f.key.length >= 3)).toBe(true);
    expect(booking.fields[3].options).toEqual([{ label: 'Trám răng', value: 'Trám răng' }, { label: 'Niềng răng', value: 'Niềng răng' }]);
    expect(booking.description).toBe('Chọn giờ khám phù hợp với bạn');
    expect(booking.settings).toMatchObject({ submitButtonText: 'Đặt lịch khám', successMessage: 'Hẹn gặp bạn!', sendConfirmation: true, consentEnabled: true, notifyOwner: true });
    expect(booking.booking_config.enabled).toBe(true);
    expect(booking.booking_config.weeklySlots['2']).toEqual(['08:00', '10:00']);
    expect(booking.payment_config).toBeNull();

    // payment (QĐ4): trường + tiêu đề của nháp, nhưng KHÔNG BAO GIỜ có tiền / tài khoản
    expect(payment.fields.map((f) => f.label)).toEqual(['Họ và tên', 'Số điện thoại', 'Trình độ hiện tại']);
    expect(payment.payment_config).toBeNull();
    expect(payment.booking_config).toBeNull();
    expect(payment.settings).toMatchObject({ consentEnabled: true, notifyOwner: true });

    // DTO: cờ "cần bổ sung" chỉ ở payment (nhắc điền số tiền + tài khoản)
    const got = await getOne(token, landingId);
    expect(got.body.data.linkedForms.map((f) => f.needsPaymentSetup)).toEqual([false, false, true]);

    // mở được công khai ngay
    for (const row of rows) {
      const pub = await request(app).get(`/api/public/forms/${row.public_key}`);
      expect(pub.status).toBe(200);
    }
  });

  it('nháp bị chỉnh sửa lén: paymentConfig có tiền + tài khoản, consentEnabled:false, notifyOwner:false, redirectUrl lạ → bị chuẩn hoá chặn / ép lại', async () => {
    const me = await createUserWithPlan('ai-draft-tamper');
    const token = await loginAs(me);
    const res = await post(token, {
      slug: 'ai-draft-tamper',
      title: 'Trang',
      htmlContent: slot('payment'),
      formDrafts: [paymentDraft({
        slotIndex: 0,
        paymentConfig: { enabled: true, methods: ['bank'], method: 'bank', amount: 500000, bankBin: '970436', accountNumber: '0123456789', accountName: 'KE XAU' },
        settings: { consentEnabled: false, notifyOwner: false, redirectUrl: 'https://evil.example/x', consentText: 'đồng ý hết', submitButtonText: 'Giữ chỗ' },
      })],
    });
    expect(res.status).toBe(201);
    const [payment] = await indexRows(res.body.data.id);
    expect(payment.title).toBe('Giữ chỗ khoá IELTS');
    expect(payment.payment_config).toBeNull();
    expect(JSON.stringify(payment)).not.toContain('0123456789');
    expect(payment.settings.consentEnabled).toBe(true);
    expect(payment.settings.notifyOwner).toBe(true);
    expect(payment.settings.redirectUrl).toBeNull();
    expect(payment.settings.consentText).toBeUndefined();
    expect(payment.settings.submitButtonText).toBe('Giữ chỗ');
  });

  it.each([
    ['trường loại file', [nameField, phoneField, { label: 'Tải CV', type: 'file', required: false }]],
    ['trường loại lạ', [nameField, phoneField, { label: 'Ký tên', type: 'signature' }]],
    ['lựa chọn rỗng', [nameField, phoneField, { label: 'Chọn', type: 'select', options: [] }]],
    ['không có SĐT / email', [nameField]],
  ])('nháp payment %s → bị chặn, DÙNG MẪU backend (tiêu đề "<tên trang> - Thu tiền / đặt cọc"), lưu vẫn 201', async (_name, fields) => {
    const me = await createUserWithPlan('ai-draft-bad');
    const token = await loginAs(me);
    const res = await post(token, {
      slug: 'ai-draft-bad',
      title: 'Trang X',
      htmlContent: slot('payment'),
      formDrafts: [paymentDraft({ slotIndex: 0, fields })],
    });
    expect(res.status).toBe(201);
    const [payment] = await indexRows(res.body.data.id);
    expect(payment.title).toBe('Trang X - Thu tiền / đặt cọc');
    expect(payment.fields.map((f) => f.label)).toEqual(templateLabels.payment);
    expect(payment.payment_config).toBeNull();
  });

  it('nháp SAI KIỂU so với chỗ trống (survey cho chỗ trống booking) hoặc chỉ số lệch → bỏ nháp, dùng mẫu', async () => {
    const me = await createUserWithPlan('ai-draft-kind');
    const token = await loginAs(me);
    const res = await post(token, {
      slug: 'ai-draft-kind',
      title: 'Trang K',
      htmlContent: `${slot()}${slot('booking')}`,
      formDrafts: [
        bookingDraft({ kind: 'survey', title: 'Sai loại' }), // slotIndex 1 là booking
        bookingDraft({ slotIndex: 7, title: 'Chỉ số ngoài trang' }),
      ],
    });
    expect(res.status).toBe(201);
    const rows = await indexRows(res.body.data.id);
    expect(rows.map((r) => r.title)).toEqual(['Trang K', 'Trang K - Đặt lịch hẹn']);
    expect(rows[1].fields.map((f) => f.label)).toEqual(['Họ và tên', 'Số điện thoại', 'Địa chỉ Email', 'Ghi chú']);
    expect(rows[1].booking_config.weeklySlots['1']).toEqual(['09:00', '14:00']);
  });

  it('nháp cho chỗ trống consult bị bỏ — consult luôn dựng từ leadFormConfig', async () => {
    const me = await createUserWithPlan('ai-draft-consult');
    const token = await loginAs(me);
    const res = await post(token, {
      slug: 'ai-draft-consult',
      title: 'Trang C',
      htmlContent: slot(),
      formDrafts: [{ slotIndex: 0, kind: 'consult', title: 'Tiêu đề lạ', fields: [nameField, phoneField] }],
    });
    expect(res.status).toBe(201);
    const [consult] = await indexRows(res.body.data.id);
    expect(consult.title).toBe('Trang C');
    expect(consult.fields.map((f) => f.role).filter(Boolean)).toEqual(['name', 'email', 'phone']);
  });

  it.each([
    ['chuỗi', 'rác'],
    ['object', { slotIndex: 0, kind: 'booking' }],
    ['mảng toàn rác', [null, 5, 'x', [], { slotIndex: 'a' }]],
    ['null', null],
  ])('formDrafts là %s → bỏ qua, lưu 201 và dùng mẫu như PR-6 (không 400)', async (_name, formDrafts) => {
    const me = await createUserWithPlan('ai-draft-junk');
    const token = await loginAs(me);
    const res = await post(token, { slug: 'ai-draft-junk', title: 'Trang J', htmlContent: slot('booking'), formDrafts });
    expect(res.status).toBe(201);
    const [booking] = await indexRows(res.body.data.id);
    expect(booking.title).toBe('Trang J - Đặt lịch hẹn');
  });

  it('KHÔNG gửi formDrafts → y như PR-6 (tiêu đề "<tên trang> - <loại>", mẫu backend)', async () => {
    const me = await createUserWithPlan('ai-draft-none');
    const token = await loginAs(me);
    const res = await post(token, { slug: 'ai-draft-none', title: 'Landing ba form', htmlContent: html3 });
    expect(res.status).toBe(201);
    const rows = await indexRows(res.body.data.id);
    expect(rows.map((r) => r.title)).toEqual(['Landing ba form', 'Landing ba form - Đặt lịch hẹn', 'Landing ba form - Thu tiền / đặt cọc']);
  });

  it('nháp có tiêu đề quá dài / chữ nút quá dài → cắt cho vừa, vẫn dùng nháp (không rơi về mẫu)', async () => {
    const me = await createUserWithPlan('ai-draft-long');
    const token = await loginAs(me);
    const res = await post(token, {
      slug: 'ai-draft-long',
      title: 'Trang L',
      htmlContent: slot('booking'),
      formDrafts: [bookingDraft({ slotIndex: 0, title: 'T'.repeat(400), settings: { submitButtonText: 'N'.repeat(300) } })],
    });
    expect(res.status).toBe(201);
    const [booking] = await indexRows(res.body.data.id);
    expect(booking.title).toHaveLength(200);
    expect(booking.settings.submitButtonText).toHaveLength(50);
    expect(booking.fields.map((f) => f.label)).toContain('Bạn cần khám gì?');
  });
});

describe('PR-7a — lưu landing có nháp biểu mẫu AI (update)', () => {
  const embedSection = (key) =>
    `<section data-founderai-form-section><div data-founderai-form="${key}"></div><script src="https://app.example/form-embed.js" defer></script></section>`;

  it('PUT: chỗ trống TRẦN tái dùng biểu mẫu consult cũ, chỗ trống booking (chỉ số 1) dùng nháp có slotIndex 1; nháp slotIndex 0 không bám sang chỗ nào', async () => {
    const me = await createUserWithPlan('ai-draft-u1');
    const token = await loginAs(me);
    const created = await post(token, { slug: 'ai-draft-u1', title: 'Trang U', htmlContent: slot() });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const consultBefore = (await indexRows(id))[0];

    const res = await put(token, id, {
      slug: 'ai-draft-u1',
      title: 'Trang U',
      htmlContent: `<section>${slot()}</section><section>${slot('booking')}</section>`,
      formDrafts: [bookingDraft({ slotIndex: 1 }), bookingDraft({ slotIndex: 0, title: 'Nháp chỉ số 0 — không được dùng' })],
    });
    expect(res.status).toBe(200);
    const rows = await indexRows(id);
    expect(rows.map((r) => r.kind)).toEqual(['consult', 'booking']);
    expect(rows[0].public_key).toBe(consultBefore.public_key); // tái dùng, không đẻ biểu mẫu mới
    expect(rows[1].title).toBe('Đặt lịch khám răng');
    const { rows: all } = await db.query('SELECT title FROM forms ORDER BY id');
    expect(all.map((r) => r.title)).not.toContain('Nháp chỉ số 0 — không được dùng');
  });

  it('PUT thêm chỗ trống payment vào trang đã có biểu mẫu nhúng → chỉ biểu mẫu MỚI dùng nháp; biểu mẫu nhúng cũ nguyên vẹn', async () => {
    const me = await createUserWithPlan('ai-draft-u2');
    const token = await loginAs(me);
    const created = await post(token, { slug: 'ai-draft-u2', title: 'Trang V', htmlContent: slot('booking'), formDrafts: [bookingDraft({ slotIndex: 0 })] });
    const id = created.body.data.id;
    const before = await indexRows(id);
    expect(before.map((r) => r.title)).toEqual(['Đặt lịch khám răng']);

    const res = await put(token, id, {
      slug: 'ai-draft-u2',
      title: 'Trang V',
      htmlContent: `${embedSection(before[0].public_key)}<section>${slot('payment')}</section>`,
      formDrafts: [paymentDraft({ slotIndex: 0, title: 'Thu cọc buổi học thử' })],
    });
    expect(res.status).toBe(200);
    const rows = await indexRows(id);
    expect(rows.map((r) => [r.kind, r.title])).toEqual([['booking', 'Đặt lịch khám răng'], ['payment', 'Thu cọc buổi học thử']]);
    expect(rows[0].public_key).toBe(before[0].public_key);
    expect(rows[1].payment_config).toBeNull();
  });
});
