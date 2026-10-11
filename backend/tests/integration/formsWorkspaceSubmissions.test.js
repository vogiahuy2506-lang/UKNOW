/**
 * GET /api/forms/submissions — bài nộp của MỌI biểu mẫu trong workspace
 * (màn "Khách để lại thông tin" → tab "Từ biểu mẫu", PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-1).
 *
 * Truy vấn thật → integration là nơi đúng: lọc, phân trang, giờ VN, cô lập workspace và nhân viên.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

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

async function addEmployeeMembership(ownerId, employeeId, permissions = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

async function createFormVia(token, title) {
  const res = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title,
      fields: [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

/** Chèn thẳng bài nộp để kiểm soát created_at / landing slug (đường nộp công khai đã có test riêng). */
async function insertSubmission({
  formId,
  ownerId,
  name,
  createdAt,
  landingPageSlug = null,
  utmSource = null,
  status = 'submitted',
}) {
  const res = await db.query(
    `INSERT INTO form_submissions
       (form_id, workspace_owner_id, access_token, answers, respondent_name, respondent_email,
        status, landing_page_slug, utm_source, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      formId,
      ownerId,
      crypto.randomBytes(16).toString('hex'),
      JSON.stringify({ k1: { label: 'Họ và tên', type: 'short_text', value: name } }),
      name,
      `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      status,
      landingPageSlug,
      utmSource,
      createdAt,
    ]
  );
  return Number(res.rows[0].id);
}

const get = (token, query = '', ownerContext = null) => {
  const req = request(app).get(`/api/forms/submissions${query}`).set('Authorization', `Bearer ${token}`);
  if (ownerContext) req.set('X-Owner-Context', String(ownerContext));
  return req;
};

describe('GET /api/forms/submissions (màn gộp "Khách để lại thông tin" → tab Từ biểu mẫu)', () => {
  it('gộp bài nộp của nhiều biểu mẫu, mới nhất trước, kèm formTitle; KHÔNG trả accessToken/mã thanh toán', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_1' });
    const token = await loginAs(owner);
    const formA = await createFormVia(token, 'Biểu mẫu A');
    const formB = await createFormVia(token, 'Biểu mẫu B');
    await insertSubmission({ formId: formA.id, ownerId: owner.id, name: 'An', createdAt: '2026-10-01T03:00:00Z', landingPageSlug: 'khoa-hoc', utmSource: 'facebook' });
    await insertSubmission({ formId: formB.id, ownerId: owner.id, name: 'Binh', createdAt: '2026-10-03T03:00:00Z' });
    await insertSubmission({ formId: formA.id, ownerId: owner.id, name: 'Cuong', createdAt: '2026-10-02T03:00:00Z' });

    const res = await get(token);

    // Nếu route nằm SAU '/:id' thì 'submissions' bị hiểu là :id → 400 INVALID_ID.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { items, total, page, limit } = res.body.data;
    expect(total).toBe(3);
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(items.map((i) => i.respondentName)).toEqual(['Binh', 'Cuong', 'An']);
    expect(items[0]).toMatchObject({ formId: formB.id, formTitle: 'Biểu mẫu B', status: 'submitted' });
    const an = items[2];
    expect(an).toMatchObject({
      formTitle: 'Biểu mẫu A',
      respondentEmail: 'an@example.com',
      landingPageSlug: 'khoa-hoc',
      utmSource: 'facebook',
    });
    expect(an.answers.k1.value).toBe('An');
    expect(an.createdAt).toBeDefined();
    for (const item of items) {
      expect(item).not.toHaveProperty('accessToken');
      expect(item).not.toHaveProperty('paymentCode');
      expect(item).not.toHaveProperty('paymentSnapshot');
    }
  });

  it('lọc theo formId', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_2' });
    const token = await loginAs(owner);
    const formA = await createFormVia(token, 'Biểu mẫu A');
    const formB = await createFormVia(token, 'Biểu mẫu B');
    await insertSubmission({ formId: formA.id, ownerId: owner.id, name: 'An', createdAt: '2026-10-01T03:00:00Z' });
    await insertSubmission({ formId: formB.id, ownerId: owner.id, name: 'Binh', createdAt: '2026-10-02T03:00:00Z' });
    await insertSubmission({ formId: formB.id, ownerId: owner.id, name: 'Cuong', createdAt: '2026-10-03T03:00:00Z' });

    const res = await get(token, `?formId=${formB.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.map((i) => i.respondentName)).toEqual(['Cuong', 'Binh']);
    expect(res.body.data.items.every((i) => i.formId === formB.id)).toBe(true);
  });

  it('lọc theo landingPageSlug (chuẩn hoá chữ hoa và "/" đầu cuối như lúc lưu)', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_3' });
    const token = await loginAs(owner);
    const form = await createFormVia(token, 'Biểu mẫu A');
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'An', createdAt: '2026-10-01T03:00:00Z', landingPageSlug: 'khoa-hoc' });
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'Binh', createdAt: '2026-10-02T03:00:00Z', landingPageSlug: 'workshop' });
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'Cuong', createdAt: '2026-10-03T03:00:00Z' });

    const res = await get(token, `?landingPageSlug=${encodeURIComponent('/Khoa-Hoc/')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].respondentName).toBe('An');
  });

  it('lọc khoảng ngày theo GIỜ VIỆT NAM, gồm cả hai đầu', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_4' });
    const token = await loginAs(owner);
    const form = await createFormVia(token, 'Biểu mẫu A');
    // 01/10 23:59:59 giờ VN = 16:59:59Z  → ngày 01/10
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'Truoc', createdAt: '2026-10-01T16:59:59Z' });
    // 02/10 00:00:00 giờ VN = 17:00:00Z → ngày 02/10 (đầu vào)
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'DauNgay', createdAt: '2026-10-01T17:00:00Z' });
    // 03/10 23:59:59 giờ VN = 16:59:59Z → ngày 03/10 (cuối ra)
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'CuoiNgay', createdAt: '2026-10-03T16:59:59Z' });
    // 04/10 00:00:00 giờ VN = 17:00:00Z → ngày 04/10
    await insertSubmission({ formId: form.id, ownerId: owner.id, name: 'Sau', createdAt: '2026-10-03T17:00:00Z' });

    const range = await get(token, '?from=2026-10-02&to=2026-10-03');
    expect(range.status).toBe(200);
    expect(range.body.data.items.map((i) => i.respondentName)).toEqual(['CuoiNgay', 'DauNgay']);

    const onlyFrom = await get(token, '?from=2026-10-03');
    expect(onlyFrom.body.data.items.map((i) => i.respondentName)).toEqual(['Sau', 'CuoiNgay']);

    const onlyTo = await get(token, '?to=2026-10-01');
    expect(onlyTo.body.data.items.map((i) => i.respondentName)).toEqual(['Truoc']);
  });

  it('phân trang: limit mặc định 20, tối đa 50, total không đổi giữa các trang', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_5' });
    const token = await loginAs(owner);
    const form = await createFormVia(token, 'Biểu mẫu A');
    for (let i = 1; i <= 5; i += 1) {
      await insertSubmission({ formId: form.id, ownerId: owner.id, name: `Khach${i}`, createdAt: `2026-10-0${i}T03:00:00Z` });
    }

    const p1 = await get(token, '?limit=2&page=1');
    const p2 = await get(token, '?limit=2&page=2');
    const p3 = await get(token, '?limit=2&page=3');
    const p4 = await get(token, '?limit=2&page=4');

    expect(p1.body.data.items.map((i) => i.respondentName)).toEqual(['Khach5', 'Khach4']);
    expect(p2.body.data.items.map((i) => i.respondentName)).toEqual(['Khach3', 'Khach2']);
    expect(p3.body.data.items.map((i) => i.respondentName)).toEqual(['Khach1']);
    expect(p4.body.data.items).toEqual([]);
    for (const r of [p1, p2, p3, p4]) expect(r.body.data.total).toBe(5);
    expect(p2.body.data).toMatchObject({ page: 2, limit: 2 });

    const huge = await get(token, '?limit=999');
    expect(huge.body.data.limit).toBe(50);
    const rac = await get(token, '?limit=abc&page=-3');
    expect(rac.body.data).toMatchObject({ limit: 20, page: 1 });
  });

  it('cô lập workspace: chủ A không thấy bài nộp của chủ B, kể cả khi truyền formId của B', async () => {
    const ownerA = await createUser({ username: 'ws_sub_owner_A' });
    const ownerB = await createUser({ username: 'ws_sub_owner_B' });
    const tokenA = await loginAs(ownerA);
    const tokenB = await loginAs(ownerB);
    const formA = await createFormVia(tokenA, 'Form của A');
    const formB = await createFormVia(tokenB, 'Form của B');
    await insertSubmission({ formId: formA.id, ownerId: ownerA.id, name: 'KhachCuaA', createdAt: '2026-10-01T03:00:00Z', landingPageSlug: 'chung' });
    await insertSubmission({ formId: formB.id, ownerId: ownerB.id, name: 'KhachCuaB', createdAt: '2026-10-02T03:00:00Z', landingPageSlug: 'chung' });

    const listA = await get(tokenA);
    expect(listA.status).toBe(200);
    expect(listA.body.data.items.map((i) => i.respondentName)).toEqual(['KhachCuaA']);
    expect(listA.body.data.total).toBe(1);

    const crossForm = await get(tokenA, `?formId=${formB.id}`);
    expect(crossForm.status).toBe(200);
    expect(crossForm.body.data.total).toBe(0);
    expect(crossForm.body.data.items).toEqual([]);

    // Cùng slug 'chung' ở hai workspace: lọc theo slug vẫn chỉ trong workspace của mình.
    const sameSlug = await get(tokenA, '?landingPageSlug=chung');
    expect(sameSlug.body.data.items.map((i) => i.respondentName)).toEqual(['KhachCuaA']);

    // workspaceOwnerId từ query không có tác dụng.
    const spoof = await get(tokenA, `?workspaceOwnerId=${ownerB.id}&owner_id=${ownerB.id}`);
    expect(spoof.body.data.items.map((i) => i.respondentName)).toEqual(['KhachCuaA']);
  });

  it('nhân viên có quyền forms (X-Owner-Context) thấy dữ liệu workspace CHỦ, không lẫn workspace riêng của mình', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_emp' });
    const employee = await createUser({ username: 'ws_sub_emp' });
    const ownerToken = await loginAs(owner);
    const empToken = await loginAs(employee);
    const ownerForm = await createFormVia(ownerToken, 'Form của chủ');
    const empOwnForm = await createFormVia(empToken, 'Form riêng nhân viên');
    await insertSubmission({ formId: ownerForm.id, ownerId: owner.id, name: 'KhachCuaChu', createdAt: '2026-10-01T03:00:00Z' });
    await insertSubmission({ formId: empOwnForm.id, ownerId: employee.id, name: 'KhachRiengNV', createdAt: '2026-10-02T03:00:00Z' });
    await addEmployeeMembership(owner.id, employee.id, { forms: true });

    const inOwnerWorkspace = await get(empToken, '', owner.id);
    expect(inOwnerWorkspace.status).toBe(200);
    expect(inOwnerWorkspace.body.data.items.map((i) => i.respondentName)).toEqual(['KhachCuaChu']);
    expect(inOwnerWorkspace.body.data.items[0].formTitle).toBe('Form của chủ');

    // Không gửi X-Owner-Context → workspace riêng của nhân viên.
    const inOwnWorkspace = await get(empToken);
    expect(inOwnWorkspace.body.data.items.map((i) => i.respondentName)).toEqual(['KhachRiengNV']);
  });

  it('nhân viên KHÔNG có quyền forms → 403 (chỉ có quyền leads thì tab Từ biểu mẫu không đọc được)', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_noperm' });
    const employee = await createUser({ username: 'ws_sub_emp_noperm' });
    await addEmployeeMembership(owner.id, employee.id, { leads: true });
    const empToken = await loginAs(employee);

    const res = await get(empToken, '', owner.id);

    expect(res.status).toBe(403);
  });

  it('tham số sai → 400 có mã lỗi rõ, không chạm DB', async () => {
    const owner = await createUser({ username: 'ws_sub_owner_bad' });
    const token = await loginAs(owner);

    const badForm = await get(token, '?formId=abc');
    expect(badForm.status).toBe(400);
    expect(badForm.body.code).toBe('INVALID_FORM_ID');

    const badFormMixed = await get(token, '?formId=12abc');
    expect(badFormMixed.status).toBe(400);

    const badDate = await get(token, '?from=2026-02-31');
    expect(badDate.status).toBe(400);
    expect(badDate.body.code).toBe('INVALID_DATE');

    const badRange = await get(token, '?from=2026-10-05&to=2026-10-01');
    expect(badRange.status).toBe(400);
    expect(badRange.body.code).toBe('INVALID_DATE_RANGE');
  });

  it('chưa đăng nhập → 401', async () => {
    const res = await request(app).get('/api/forms/submissions');
    expect(res.status).toBe(401);
  });
});
