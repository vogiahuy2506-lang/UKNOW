/**
 * PLAN_PHEU_BAN_HANG_THEO_SAN_PHAM_2026-10-03 — PR-1: gắn biểu mẫu với sản phẩm + API phễu
 * `GET /api/products/funnel` (Đăng ký / Đã trả / Doanh thu).
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let tokenSeq = 0;

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

async function insertProduct(ownerId, name) {
  const { rows } = await db.query(
    `INSERT INTO products (id_user, workspace_owner_id, product_name, status)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [ownerId, ownerId, name]
  );
  return Number(rows[0].id);
}

async function insertForm(ownerId, title, productId = null) {
  const { rows } = await db.query(
    `INSERT INTO forms (workspace_owner_id, public_key, title, product_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, `k${Date.now()}${tokenSeq++}`, title, productId]
  );
  return Number(rows[0].id);
}

/** daysAgo: created_at lùi N ngày; paidDaysAgo: paid_confirmed_at lùi N ngày (null = chưa xác nhận). */
async function insertSubmission(ownerId, formId, { status, amount = null, daysAgo = 1, paidDaysAgo = null }) {
  await db.query(
    `INSERT INTO form_submissions
       (form_id, workspace_owner_id, access_token, status, payment_amount, created_at, paid_confirmed_at)
     VALUES ($1, $2, $3, $4, $5,
             NOW() - ($6::int * INTERVAL '1 day'),
             CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() - ($7::int * INTERVAL '1 day') END)`,
    [formId, ownerId, `t${Date.now()}${tokenSeq++}`, status, amount, daysAgo, paidDaysAgo]
  );
}

function byProduct(res) {
  const map = {};
  for (const r of res.body.data.rows) map[r.productId] = r;
  return map;
}

describe('GET /api/products/funnel (PR-1)', () => {
  it('đếm Đăng ký / Đã trả / Doanh thu đúng theo từng sản phẩm; "đã trả" theo paid_confirmed_at', async () => {
    const owner = await createUser({ username: 'funnel_owner' });
    const other = await createUser({ username: 'funnel_other' });
    const p1 = await insertProduct(owner.id, 'Khoá AI');
    const p2 = await insertProduct(owner.id, 'Khoá trống');
    const pOther = await insertProduct(other.id, 'Của người khác');
    const f1 = await insertForm(owner.id, 'Form P1 a', p1);
    const f1b = await insertForm(owner.id, 'Form P1 b', p1);
    const fNone = await insertForm(owner.id, 'Form không gắn', null);
    const fOther = await insertForm(other.id, 'Form workspace khác', pOther);

    // Form P1 a: submitted, pending_payment, confirmed không tiền, confirmed đã trả (2.000), cancelled
    await insertSubmission(owner.id, f1, { status: 'submitted' });
    await insertSubmission(owner.id, f1, { status: 'pending_payment', amount: 2000 });
    await insertSubmission(owner.id, f1, { status: 'confirmed' }); // đặt lịch không thu tiền
    await insertSubmission(owner.id, f1, { status: 'confirmed', amount: 2000, paidDaysAgo: 1 });
    await insertSubmission(owner.id, f1, { status: 'cancelled', amount: 2000 });
    // Form P1 b: một bài tạo cách đây 40 ngày (ngoài 30d) nhưng được xác nhận trả 3 ngày trước → vào "Đã trả" kỳ này
    await insertSubmission(owner.id, f1b, { status: 'confirmed', amount: 5000, daysAgo: 40, paidDaysAgo: 3 });
    // Một bài trả ngoài khoảng (xác nhận 45 ngày trước)
    await insertSubmission(owner.id, f1b, { status: 'confirmed', amount: 7000, daysAgo: 50, paidDaysAgo: 45 });
    // Form không gắn + form workspace khác: không được tính vào sản phẩm nào
    await insertSubmission(owner.id, fNone, { status: 'confirmed', amount: 9000, paidDaysAgo: 1 });
    await insertSubmission(other.id, fOther, { status: 'confirmed', amount: 9000, paidDaysAgo: 1 });

    const token = await loginAs(owner);
    const res = await request(app)
      .get('/api/products/funnel?period=30d')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.filters.startDate).toBeDefined();
    const rows = byProduct(res);

    // P1 (trong 30 ngày theo created_at): submitted = 4 (submitted, pending, confirmed, confirmed-paid; bỏ cancelled; bỏ 2 bài cũ)
    expect(rows[p1].submitted).toBe(4);
    // registered = pending_payment + 2 confirmed = 3
    expect(rows[p1].registered).toBe(3);
    // paid = bài 2.000 (1 ngày trước) + bài 5.000 (xác nhận 3 ngày trước, tạo 40 ngày trước); bài xác nhận 45 ngày trước bị loại
    expect(rows[p1].paid).toBe(2);
    expect(rows[p1].revenue).toBe(7000);
    // Sản phẩm không có bài nộp vẫn có dòng 0
    expect(rows[p2]).toEqual({ productId: p2, submitted: 0, registered: 0, paid: 0, revenue: 0, formIds: [] });
    // formIds: các biểu mẫu gắn sản phẩm (để giao diện dẫn sang trang bài nộp)
    expect(rows[p1].formIds).toEqual([f1, f1b]);
    // Sản phẩm workspace khác không lộ ra
    expect(rows[pOther]).toBeUndefined();
    expect(res.body.data.rows).toHaveLength(2);

    // period=all gộp cả bài cũ: paid = 3, revenue = 14.000
    const resAll = await request(app)
      .get('/api/products/funnel?period=all')
      .set('Authorization', `Bearer ${token}`);
    expect(resAll.status).toBe(200);
    expect(byProduct(resAll)[p1].paid).toBe(3);
    expect(byProduct(resAll)[p1].revenue).toBe(14000);
  });

  it('nhân viên chỉ có quyền courses → 403; có reports_view → 200', async () => {
    const owner = await createUser({ username: 'funnel_owner2' });
    const employee = await createUser({ username: 'funnel_emp' });
    await addEmployeeMembership(owner.id, employee.id, { courses: true });
    const token = await loginAs(employee);
    const headers = { Authorization: `Bearer ${token}`, 'X-Owner-Context': String(owner.id) };

    const denied = await request(app).get('/api/products/funnel').set(headers);
    expect(denied.status).toBe(403);

    await db.query(
      `UPDATE user_members SET permissions = $1::jsonb WHERE owner_id = $2 AND employee_id = $3`,
      [JSON.stringify({ courses: true, reports_view: true }), owner.id, employee.id]
    );
    const allowed = await request(app).get('/api/products/funnel').set(headers);
    expect(allowed.status).toBe(200);
  });
});

describe('Gắn biểu mẫu với sản phẩm (PR-1)', () => {
  it('tạo / sửa / bỏ gắn productId; không cho gắn sản phẩm của workspace khác', async () => {
    const owner = await createUser({ username: 'formprod_owner' });
    const other = await createUser({ username: 'formprod_other' });
    const mine = await insertProduct(owner.id, 'Của tôi');
    const theirs = await insertProduct(other.id, 'Của họ');
    const token = await loginAs(owner);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app).post('/api/forms').set(auth).send({ title: 'F', productId: mine });
    expect(created.status).toBe(201);
    expect(created.body.data.productId).toBe(mine);

    const got = await request(app).get(`/api/forms/${created.body.data.id}`).set(auth);
    expect(got.body.data.productId).toBe(mine);

    const foreignCreate = await request(app).post('/api/forms').set(auth).send({ title: 'F2', productId: theirs });
    expect(foreignCreate.status).toBe(400);
    expect(foreignCreate.body.code).toBe('PRODUCT_NOT_IN_WORKSPACE');

    const foreignUpdate = await request(app)
      .put(`/api/forms/${created.body.data.id}`)
      .set(auth)
      .send({ productId: theirs });
    expect(foreignUpdate.status).toBe(400);
    const { rows } = await db.query('SELECT product_id FROM forms WHERE id = $1', [created.body.data.id]);
    expect(Number(rows[0].product_id)).toBe(mine);

    const cleared = await request(app)
      .put(`/api/forms/${created.body.data.id}`)
      .set(auth)
      .send({ productId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.productId).toBeNull();

    const bad = await request(app).post('/api/forms').set(auth).send({ title: 'F3', productId: 'abc' });
    expect(bad.status).toBe(400);
  });
});
