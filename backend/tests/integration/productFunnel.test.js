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

async function insertProduct(ownerId, name, kind = 'sale') {
  const { rows } = await db.query(
    `INSERT INTO products (id_user, workspace_owner_id, product_name, status, kind)
     VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
    [ownerId, ownerId, name, kind]
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
async function insertSubmission(ownerId, formId, { status, amount = null, daysAgo = 1, paidDaysAgo = null, reportedDaysAgo = null, receiptKey = null }) {
  await db.query(
    `INSERT INTO form_submissions
       (form_id, workspace_owner_id, access_token, status, payment_amount, created_at, paid_confirmed_at,
        payer_reported_paid_at, payment_receipt_key)
     VALUES ($1, $2, $3, $4, $5,
             NOW() - ($6::int * INTERVAL '1 day'),
             CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() - ($7::int * INTERVAL '1 day') END,
             CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() - ($8::int * INTERVAL '1 day') END,
             $9)`,
    [formId, ownerId, `t${Date.now()}${tokenSeq++}`, status, amount, daysAgo, paidDaysAgo, reportedDaysAgo, receiptKey]
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
    expect(rows[p2]).toEqual({
      productId: p2,
      submitted: 0,
      registered: 0,
      paid: 0,
      revenue: 0,
      awaitingConfirm: 0,
      awaitingAmount: 0,
      kind: 'sale',
      hasPaidForm: false,
      formIds: [],
      landingViews: 0,
      leads: 0,
      campaignClicks: 0,
      interested: 0,
      leftContact: 0,
    });
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

  it('Chờ xác nhận: pending_payment đã báo/có biên lai, KHÔNG theo khoảng ngày; pending chưa báo = 0; đã xác nhận không còn', async () => {
    const owner = await createUser({ username: 'funnel_await' });
    const p1 = await insertProduct(owner.id, 'SP chờ');
    const f1 = await insertForm(owner.id, 'F chờ', p1);
    // Đã báo chuyển khoản hôm qua (2.000)
    await insertSubmission(owner.id, f1, { status: 'pending_payment', amount: 2000, reportedDaysAgo: 1 });
    // Chỉ có biên lai, chưa bấm báo (3.000)
    await insertSubmission(owner.id, f1, { status: 'pending_payment', amount: 3000, receiptKey: 'receipts/x.jpg' });
    // Tạo + báo từ 60 ngày trước, chủ chưa xác nhận: vẫn tính dù chọn 7 ngày (5.000)
    await insertSubmission(owner.id, f1, { status: 'pending_payment', amount: 5000, daysAgo: 60, reportedDaysAgo: 60 });
    // Pending nhưng khách CHƯA báo, chưa biên lai: không tính
    await insertSubmission(owner.id, f1, { status: 'pending_payment', amount: 9000 });
    // Đã xác nhận (dù từng báo): không còn chờ
    await insertSubmission(owner.id, f1, { status: 'confirmed', amount: 4000, reportedDaysAgo: 2, paidDaysAgo: 1 });
    // Huỷ dù từng báo: không tính
    await insertSubmission(owner.id, f1, { status: 'cancelled', amount: 6000, reportedDaysAgo: 2 });

    const token = await loginAs(owner);
    const res = await request(app).get('/api/products/funnel?period=7d').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(byProduct(res)[p1]).toMatchObject({ awaitingConfirm: 3, awaitingAmount: 10000, paid: 1, revenue: 4000 });

    const resAll = await request(app).get('/api/products/funnel?period=all').set('Authorization', `Bearer ${token}`);
    expect(byProduct(resAll)[p1]).toMatchObject({ awaitingConfirm: 3, awaitingAmount: 10000 });
  });

  it('sản phẩm event: Đăng ký = mọi bài nộp chưa huỷ, Để lại thông tin = chỉ lead landing; tiền null nếu không có biểu mẫu thu phí, số thật nếu có; sale giữ nguyên', async () => {
    const owner = await createUser({ username: 'funnel_event' });
    const ev = await insertProduct(owner.id, 'Hội thảo', 'event');
    const evPaid = await insertProduct(owner.id, 'Workshop thu phí', 'event');
    const sale = await insertProduct(owner.id, 'Khoá bán');
    const lp = await insertLanding(owner.id, 'hoi-thao');
    const fFree = await insertForm(owner.id, 'Đăng ký hội thảo', ev);
    await attachFormToLanding(fFree, lp);
    const fPaid = await insertForm(owner.id, 'Workshop', evPaid);
    await db.query(`UPDATE forms SET payment_config = '{"enabled": true}'::jsonb WHERE id = $1`, [fPaid]);
    const fSale = await insertForm(owner.id, 'Mua khoá', sale);
    await db.query(`UPDATE forms SET payment_config = '{"enabled": true}'::jsonb WHERE id = $1`, [fSale]);

    // event miễn phí: 3 bài nộp (1 huỷ) + 2 lead landing
    await insertSubmission(owner.id, fFree, { status: 'submitted' });
    await insertSubmission(owner.id, fFree, { status: 'submitted' });
    await insertSubmission(owner.id, fFree, { status: 'cancelled' });
    await insertLead(owner.id, 'hoi-thao', 1);
    await insertLead(owner.id, 'hoi-thao', 2);
    // event thu phí: 1 bài đã xác nhận 3.000, 1 bài chờ xác nhận 2.000
    await insertSubmission(owner.id, fPaid, { status: 'confirmed', amount: 3000, paidDaysAgo: 1 });
    await insertSubmission(owner.id, fPaid, { status: 'pending_payment', amount: 2000, reportedDaysAgo: 1 });
    // sale: giữ định nghĩa cũ — bài 'submitted' KHÔNG phải Đăng ký
    await insertSubmission(owner.id, fSale, { status: 'submitted' });
    await insertSubmission(owner.id, fSale, { status: 'pending_payment', amount: 1000 });

    const token = await loginAs(owner);
    const res = await request(app).get('/api/products/funnel?period=30d').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = byProduct(res);
    expect(rows[ev]).toMatchObject({
      kind: 'event',
      hasPaidForm: false,
      registered: 2,
      leads: 2,
      leftContact: 2,
      paid: null,
      revenue: null,
      awaitingConfirm: null,
    });
    expect(rows[evPaid]).toMatchObject({
      kind: 'event',
      hasPaidForm: true,
      registered: 2,
      paid: 1,
      revenue: 3000,
      awaitingConfirm: 1,
      awaitingAmount: 2000,
    });
    expect(rows[sale]).toMatchObject({ kind: 'sale', hasPaidForm: true, registered: 1, submitted: 2, leftContact: 2, paid: 0, revenue: 0 });
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

async function insertLanding(ownerId, slug) {
  const { rows } = await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, is_published) VALUES ($1, $1, $2, TRUE) RETURNING id`,
    [ownerId, slug]
  );
  return Number(rows[0].id);
}

async function attachFormToLanding(formId, landingId) {
  await db.query('UPDATE forms SET landing_page_id = $1 WHERE id = $2', [landingId, formId]);
}

async function insertView(slug, daysAgo = 1) {
  await db.query(
    `INSERT INTO landing_page_events (event_type, landing_page_slug, created_at)
     VALUES ('view', $1, NOW() - ($2::int * INTERVAL '1 day'))`,
    [slug, daysAgo]
  );
}

async function insertLead(ownerId, slug, daysAgo = 1) {
  await db.query(
    `INSERT INTO leads (id_user, workspace_owner_id, email, landing_page_slug, created_at)
     VALUES ($1, $1, $2, $3, NOW() - ($4::int * INTERVAL '1 day'))`,
    [ownerId, `l${tokenSeq++}@x.vn`, slug, daysAgo]
  );
}

async function insertCustomer(ownerId, name) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, full_name, email) VALUES ($1, $1, $2, $3) RETURNING id`,
    [ownerId, name, `${name}${tokenSeq++}@x.vn`]
  );
  return Number(rows[0].id);
}

async function insertCampaign(ownerId) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name) VALUES ($1, $1, $2) RETURNING id`,
    [ownerId, `C${tokenSeq++}`]
  );
  return Number(rows[0].id);
}

async function insertClick(campaignId, customerId, targetUrl, { type = 'email_clicked', daysAgo = 1 } = {}) {
  await db.query(
    `INSERT INTO customer_journey (id_customer, id_campaign, event_type, event_channel, event_data, event_at)
     VALUES ($1, $2, $3, 'email', $4::jsonb, NOW() - ($5::int * INTERVAL '1 day'))`,
    [customerId, campaignId, type, JSON.stringify({ targetUrl }), daysAgo]
  );
}

describe('Phễu: Quan tâm / Để lại thông tin (PR-2 + PR-3)', () => {
  it('đếm lượt xem + lead của landing gắn form của sản phẩm, và người bấm link chiến dịch khớp sản phẩm', async () => {
    const owner = await createUser({ username: 'funnel23_owner' });
    const other = await createUser({ username: 'funnel23_other' });
    const p1 = await insertProduct(owner.id, 'Khoá AI');
    const p2 = await insertProduct(owner.id, 'Sản phẩm khác');
    await db.query(`UPDATE products SET product_url = $1 WHERE id = $2`, ['https://shop.vn/khoa-ai/', p1]);

    const lpMine = await insertLanding(owner.id, 'khoa-ai');
    const lpOther = await insertLanding(owner.id, 'trang-khac'); // landing của chủ nhưng form gắn p2
    await insertLanding(other.id, 'cua-nguoi-khac');
    const f1 = await insertForm(owner.id, 'F1', p1);
    const f2 = await insertForm(owner.id, 'F2', p2);
    await attachFormToLanding(f1, lpMine);
    await attachFormToLanding(f2, lpOther);
    await insertSubmission(owner.id, f1, { status: 'submitted' });

    // Landing của P1: 3 lượt xem trong khoảng, 1 ngoài khoảng; 1 lead trong khoảng, 1 lead ngoài khoảng
    await insertView('khoa-ai', 1);
    await insertView('khoa-ai', 2);
    await insertView('khoa-ai', 3);
    await insertView('khoa-ai', 60);
    await insertLead(owner.id, 'khoa-ai', 1);
    await insertLead(owner.id, 'khoa-ai', 60);
    // Landing khác không tính vào P1
    await insertView('trang-khac', 1);
    await insertLead(owner.id, 'trang-khac', 1);
    await insertView('cua-nguoi-khac', 1);

    // Lượt bấm link chiến dịch
    const camp = await insertCampaign(owner.id);
    const campOther = await insertCampaign(other.id);
    const a = await insertCustomer(owner.id, 'a');
    const b = await insertCustomer(owner.id, 'b');
    const c = await insertCustomer(owner.id, 'c');
    const d = await insertCustomer(other.id, 'd');
    await insertClick(camp, a, 'https://www.shop.vn/khoa-ai?utm_source=email_campaign&utm_customer=1'); // khớp product_url
    await insertClick(camp, a, 'https://shop.vn/khoa-ai/'); // a bấm lần 2 -> vẫn 1 người
    await insertClick(camp, b, 'https://founderai.biz/lp/khoa-ai.', { type: 'zalo_clicked' }); // địa chỉ landing + dấu chấm cuối
    await insertClick(camp, c, 'https://shop.vn/khoa-hoc-khac'); // khác path
    await insertClick(camp, c, 'https://shop.vn/khoa-ai', { daysAgo: 60 }); // ngoài khoảng
    await insertClick(campOther, d, 'https://shop.vn/khoa-ai'); // chiến dịch workspace khác

    const token = await loginAs(owner);
    const res = await request(app).get('/api/products/funnel?period=30d').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = byProduct(res);
    expect(rows[p1]).toMatchObject({
      landingViews: 3,
      leads: 1,
      submitted: 1,
      campaignClicks: 2,
      interested: 5,
      leftContact: 2,
    });
    // P2: landing khác có 1 view + 1 lead; không có link khớp
    expect(rows[p2]).toMatchObject({ landingViews: 1, leads: 1, campaignClicks: 0 });

    // Workspace khác không thấy gì của owner
    const tokenOther = await loginAs(other);
    const resOther = await request(app).get('/api/products/funnel?period=30d').set('Authorization', `Bearer ${tokenOther}`);
    expect(resOther.body.data.rows).toHaveLength(0);

    // period=all: lượt bấm cũ của c cũng tính (khớp product_url) -> 3 người; view 4
    const resAll = await request(app).get('/api/products/funnel?period=all').set('Authorization', `Bearer ${token}`);
    expect(byProduct(resAll)[p1].campaignClicks).toBe(3);
    expect(byProduct(resAll)[p1].landingViews).toBe(4);
  });

  it('địa chỉ công khai của landing qua tên miền active khớp; tên miền chưa active thì không', async () => {
    const owner = await createUser({ username: 'funnel23_domain' });
    const p1 = await insertProduct(owner.id, 'SP');
    const lp = await insertLanding(owner.id, 'sp-lp');
    const f1 = await insertForm(owner.id, 'F', p1);
    await attachFormToLanding(f1, lp);
    await db.query(
      `INSERT INTO landing_page_domains (landing_page_id, hostname, verification_token, status)
       VALUES ($1, 'sp-lp.founderai.biz', 'tok', 'active')`,
      [lp]
    );
    const camp = await insertCampaign(owner.id);
    const a = await insertCustomer(owner.id, 'a');
    const b = await insertCustomer(owner.id, 'b');
    await insertClick(camp, a, 'https://sp-lp.founderai.biz/?utm_source=email_campaign');
    await insertClick(camp, b, 'https://khac.founderai.biz/');
    const token = await loginAs(owner);
    const res = await request(app).get('/api/products/funnel?period=30d').set('Authorization', `Bearer ${token}`);
    expect(byProduct(res)[p1].campaignClicks).toBe(1);

    await db.query(`UPDATE landing_page_domains SET status = 'disabled'`);
    const res2 = await request(app).get('/api/products/funnel?period=30d').set('Authorization', `Bearer ${token}`);
    expect(byProduct(res2)[p1].campaignClicks).toBe(0);
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
