/**
 * PR-C2 (PLAN_RA_SOAT_DOT3_KHACH_HANG) — hiệu năng + dữ liệu đúng ở Khách hàng.
 *
 *   1. Danh sách khách: phân trang ổn định khi trùng created_at, tổng đúng kể cả trang rỗng, số liệu theo
 *      chiến dịch từ một LEFT JOIN.
 *   2. Lọc source=uknow_campaign gồm cả dữ liệu cũ 'campaign'.
 *   3. Dedup CHUNG giữa bulk và node "lưu khách" (email chữ thường, SĐT 9 số cuối).
 *   4. Bulk: trần 2.000 dòng, lỗi theo chỉ số, whitelist consentSource.
 *   5. Xoá khách chặn (409) khi đã có customer_purchases.
 *   6. interested-courses có campaignId không âm thầm trả khách của cả workspace.
 *   7. Hồ sơ/journey không còn kèm body email; body nạp riêng qua GET /:id/emails/:emailId.
 *   8. Journey detail chạy song song, không còn summaries.overall.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';

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
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createCustomerRow({
  userId, email = null, phone = null, fullName = 'Khách', source = null, createdAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name, customer_source, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`,
    [userId, email, phone, fullName, source, createdAt]
  );
  return rows[0];
}

async function createCampaignRow({ userId, name = 'C1' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'running') RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

const NODE_FIELD_MAP = {
  email: { mode: 'node', field: 'email' },
  phone: { mode: 'node', field: 'phone' },
  fullName: { mode: 'node', field: 'fullName' },
};

const get = (token, url) => request(app).get(url).set('Authorization', `Bearer ${token}`);
const post = (token, url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 1 — danh sách khách', () => {
  it('trùng created_at vẫn phân trang ổn định (id DESC làm tie-break): không sót, không lặp, tổng đúng mọi trang', async () => {
    const user = await createUser();
    const sameTime = '2026-10-01T03:00:00.000Z';
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const row = await createCustomerRow({ userId: user.id, email: `tie${i}@u.local`, createdAt: sameTime });
      ids.push(Number(row.id));
    }
    const token = await loginAs(user);

    const seen = [];
    for (const page of [1, 2, 3]) {
      const res = await get(token, `/api/customers?page=${page}&limit=2`);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.totalPages).toBe(3);
      seen.push(...res.body.data.items.map((item) => Number(item.id)));
    }
    expect(seen).toEqual([...ids].sort((a, b) => b - a));
  });

  it('trang vượt quá số trang → items rỗng nhưng total vẫn đúng', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, email: 'a@u.local' });
    await createCustomerRow({ userId: user.id, email: 'b@u.local' });
    const token = await loginAs(user);

    const res = await get(token, '/api/customers?page=50&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('không có khách nào → total 0, không lỗi', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await get(token, '/api/customers');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('lọc campaignId: số liệu theo chiến dịch (uknowStatus/opened/clicked/received) và campaignCount đúng', async () => {
    const user = await createUser();
    const campA = await createCampaignRow({ userId: user.id, name: 'A' });
    const campB = await createCampaignRow({ userId: user.id, name: 'B' });
    const inA = await createCustomerRow({ userId: user.id, email: 'in-a@u.local' });
    const inBoth = await createCustomerRow({ userId: user.id, email: 'in-both@u.local' });
    await createCustomerRow({ userId: user.id, email: 'outside@u.local' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, has_opened, has_clicked, uknow_status, last_activity_at)
       VALUES ($1, $2, 3, TRUE, FALSE, 'quan-tam', NOW())`,
      [campA.id, inA.id]
    );
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, has_opened, has_clicked, last_activity_at)
       VALUES ($1, $2, 1, FALSE, FALSE, NOW()), ($3, $2, 7, TRUE, TRUE, NOW())`,
      [campA.id, inBoth.id, campB.id]
    );
    const token = await loginAs(user);

    const res = await get(token, `/api/customers?campaignId=${campA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    const byEmail = Object.fromEntries(res.body.data.items.map((item) => [item.email, item]));
    expect(byEmail['in-a@u.local']).toMatchObject({
      uknowStatus: 'quan-tam',
      campaignHasOpened: true,
      campaignHasClicked: false,
      campaignEmailReceivedCount: 3,
      campaignCount: 1,
    });
    // dòng của chiến dịch A, KHÔNG phải số 7 của chiến dịch B
    expect(byEmail['in-both@u.local']).toMatchObject({ campaignEmailReceivedCount: 1, campaignCount: 2 });
    expect(byEmail['outside@u.local']).toBeUndefined();

    // không lọc chiến dịch: các cột theo chiến dịch là null
    const all = await get(token, '/api/customers');
    expect(all.body.data.items.every((item) => item.campaignEmailReceivedCount === null && item.uknowStatus === null)).toBe(true);
  });

  it('chiến dịch của workspace khác → không trả khách nào', async () => {
    const owner = await createUser({ username: 'c2_owner' });
    const other = await createUser({ username: 'c2_other' });
    const otherCamp = await createCampaignRow({ userId: other.id });
    const cu = await createCustomerRow({ userId: owner.id, email: 'mine@u.local' });
    await db.query(`INSERT INTO campaign_customers (id_campaign, id_customer) VALUES ($1, $2)`, [otherCamp.id, cu.id]);
    const token = await loginAs(owner);
    const res = await get(token, `/api/customers?campaignId=${otherCamp.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 4 — lọc source=uknow_campaign gồm dữ liệu cũ', () => {
  it("'campaign' (node lưu khách cũ ghi mặc định) và 'campaign_uknow' đều nằm trong nhóm uknow_campaign", async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, email: 'new@u.local', source: 'uknow_campaign' });
    await createCustomerRow({ userId: user.id, email: 'old@u.local', source: 'campaign' });
    await createCustomerRow({ userId: user.id, email: 'alias@u.local', source: 'campaign_uknow' });
    await createCustomerRow({ userId: user.id, email: 'fai@u.local', source: 'founderai' });
    await createCustomerRow({ userId: user.id, email: 'woo@u.local', source: 'woocommerce' });
    const token = await loginAs(user);

    const camp = await get(token, '/api/customers?source=uknow_campaign');
    expect(camp.body.data.items.map((i) => i.email).sort()).toEqual(['alias@u.local', 'new@u.local', 'old@u.local']);
    expect(camp.body.data.pagination.total).toBe(3);

    const fai = await get(token, '/api/customers?source=founderai');
    expect(fai.body.data.items.map((i) => i.email).sort()).toEqual(['fai@u.local', 'woo@u.local']);
  });

  it("node lưu khách ghi mặc định 'uknow_campaign'; khách cũ nguồn 'campaign' không bị UPDATE oan khi dữ liệu không đổi", async () => {
    const owner = await createUser({ username: 'c2_src_owner' });
    const camp = await createCampaignRow({ userId: owner.id });
    const run = (items) => campaignNodeDataService.saveCustomersFromCampaignDirect(
      items, camp.id, owner.id, { config: { saveCustomerFieldMap: NODE_FIELD_MAP } }, null
    );

    const first = await run([{ email: 'moi@u.local', phone: '0911000001', fullName: 'Mới' }]);
    expect(first.saved).toBe(1);
    const row = await db.query(`SELECT customer_source FROM customers WHERE email = 'moi@u.local'`);
    expect(row.rows[0].customer_source).toBe('uknow_campaign');

    // Khách cũ do bản trước ghi 'campaign': lưu lại cùng dữ liệu phải ra "không đổi".
    await db.query(
      `INSERT INTO customers (id_user, email, phone, full_name, customer_source) VALUES ($1, 'cu@u.local', '0911000002', 'Cũ', 'campaign')`,
      [owner.id]
    );
    const again = await run([{ email: 'cu@u.local', phone: '0911000002', fullName: 'Cũ' }]);
    expect(again).toMatchObject({ saved: 0, updated: 0, unchanged: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 5 — dedup chung giữa bulk và node lưu khách', () => {
  it('node lưu trước (email chữ thường, SĐT 0912…), bulk sau (EMAIL HOA, +84912…) → cập nhật, không tạo khách thứ hai', async () => {
    const owner = await createUser({ username: 'c2_dedup_1' });
    const camp = await createCampaignRow({ userId: owner.id });
    await campaignNodeDataService.saveCustomersFromCampaignDirect(
      [{ email: 'khach@mail.com', phone: '0912345678', fullName: 'Từ node' }],
      camp.id, owner.id, { config: { saveCustomerFieldMap: NODE_FIELD_MAP } }, null
    );
    const token = await loginAs(owner);

    const res = await post(token, '/api/customers/bulk', {
      items: [{ email: 'KHACH@Mail.COM', phone: '+84912345678', fullName: 'Từ bulk' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inserted: 0, updated: 1 });
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id_user = $1`, [owner.id])).rows[0].c).toBe(1);
  });

  it('bulk lưu trước (email hoa/thường lẫn lộn), node sau (chữ thường) → node nhận ra khách đã có', async () => {
    const owner = await createUser({ username: 'c2_dedup_2' });
    const camp = await createCampaignRow({ userId: owner.id });
    const token = await loginAs(owner);
    const bulk = await post(token, '/api/customers/bulk', { items: [{ email: 'Mixed.Case@Mail.com', phone: '0988777666' }] });
    expect(bulk.body.data.inserted).toBe(1);

    const summary = await campaignNodeDataService.saveCustomersFromCampaignDirect(
      [{ email: 'mixed.case@mail.com', phone: '+84 988 777 666', fullName: 'Từ node' }],
      camp.id, owner.id, { config: { saveCustomerFieldMap: NODE_FIELD_MAP } }, null
    );
    expect(summary.saved).toBe(0);
    expect(summary.updated + summary.unchanged).toBe(1);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id_user = $1`, [owner.id])).rows[0].c).toBe(1);
  });

  it('khớp theo SĐT khác định dạng khi chỉ có SĐT', async () => {
    const owner = await createUser({ username: 'c2_dedup_3' });
    await createCustomerRow({ userId: owner.id, phone: '0912345678', fullName: 'Có sẵn' });
    const token = await loginAs(owner);
    const res = await post(token, '/api/customers/bulk', { items: [{ phone: '84912345678', fullName: 'Cùng người' }] });
    expect(res.body.data).toMatchObject({ inserted: 0, updated: 1 });
  });

  it('không khớp khách của workspace khác (cô lập tenant)', async () => {
    const a = await createUser({ username: 'c2_dedup_a' });
    const b = await createUser({ username: 'c2_dedup_b' });
    await createCustomerRow({ userId: b.id, email: 'shared@u.local' });
    const token = await loginAs(a);
    const res = await post(token, '/api/customers/bulk', { items: [{ email: 'SHARED@u.local' }] });
    expect(res.body.data).toMatchObject({ inserted: 1, updated: 0 });
  });

  it('hai dòng trùng nhau trong cùng lô → một khách', async () => {
    const owner = await createUser({ username: 'c2_dedup_4' });
    const token = await loginAs(owner);
    const res = await post(token, '/api/customers/bulk', {
      items: [{ email: 'lap@u.local' }, { email: 'LAP@u.local', fullName: 'Lần hai' }],
    });
    expect(res.body.data).toMatchObject({ inserted: 1, updated: 1 });
    const rows = await db.query(`SELECT full_name FROM customers WHERE id_user = $1`, [owner.id]);
    expect(rows.rows).toEqual([{ full_name: 'Lần hai' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 6 — bulk: trần, lỗi theo chỉ số, whitelist consentSource', () => {
  it('2.001 dòng → 400 và không ghi gì; đúng 2.000 dòng vẫn xử lý', async () => {
    const owner = await createUser({ username: 'c2_cap' });
    const token = await loginAs(owner);

    const tooMany = Array.from({ length: 2001 }, (_, i) => ({ email: `cap${i}@u.local` }));
    const rejected = await post(token, '/api/customers/bulk', { items: tooMany });
    expect(rejected.status).toBe(400);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers`)).rows[0].c).toBe(0);

    const exact = Array.from({ length: 2000 }, (_, i) => ({ email: `cap${i}@u.local` }));
    const ok = await post(token, '/api/customers/bulk', { items: exact });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ inserted: 2000, invalid: 0 });
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers`)).rows[0].c).toBe(2000);
  }, 60000);

  it('dòng sai báo theo chỉ số; dòng đúng vẫn được ghi', async () => {
    const owner = await createUser({ username: 'c2_invalid' });
    const token = await loginAs(owner);
    const res = await post(token, '/api/customers/bulk', {
      items: [
        { email: 'tot1@u.local' },
        { email: 'khong-phai-email' },
        { phone: '12ab' },
        { email: 'tot2@u.local', phone: '0912345678' },
        { fullName: 'x'.repeat(300), email: 'dai@u.local' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inserted: 2, invalid: 3, total: 5 });
    expect(res.body.data.errors.map((e) => [e.index, e.field])).toEqual([
      [1, 'email'],
      [2, 'phone'],
      [4, 'fullName'],
    ]);
    const emails = (await db.query(`SELECT email FROM customers WHERE id_user = $1 ORDER BY email`, [owner.id])).rows.map((r) => r.email);
    expect(emails).toEqual(['tot1@u.local', 'tot2@u.local']);
  });

  it('consentSource tự khai ngoài {manual, import} → lỗi dòng, không ghi; hợp lệ → lưu đúng giá trị', async () => {
    const owner = await createUser({ username: 'c2_consent' });
    const token = await loginAs(owner);
    const res = await post(token, '/api/customers/bulk', {
      items: [
        { email: 'gia@u.local', consentSource: 'landing_lead' },
        { email: 'tay@u.local', consentSource: 'manual' },
        { email: 'file@u.local' },
      ],
    });
    expect(res.body.data).toMatchObject({ inserted: 2, invalid: 1 });
    expect(res.body.data.errors[0]).toMatchObject({ index: 0, field: 'consentSource' });
    const rows = await db.query(`SELECT email, consent_source FROM customers WHERE id_user = $1 ORDER BY email`, [owner.id]);
    expect(rows.rows).toEqual([
      { email: 'file@u.local', consent_source: 'import' },
      { email: 'tay@u.local', consent_source: 'manual' },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 8 — xoá khách chặn khi đã có đơn', () => {
  it('khách có customer_purchases → 409 kèm lý do, khách và đơn còn nguyên', async () => {
    const owner = await createUser({ username: 'c2_del_1' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'co-don@u.local' });
    await db.query(
      `INSERT INTO customer_purchases (id_customer, product_name, amount) VALUES ($1, 'Khoá A', 100000), ($1, 'Khoá B', 200000)`,
      [cu.id]
    );
    const token = await loginAs(owner);

    const res = await request(app).delete(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/2 đơn/);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1`, [cu.id])).rows[0].c).toBe(1);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases WHERE id_customer = $1`, [cu.id])).rows[0].c).toBe(2);
  });

  it('khách chưa có đơn → xoá bình thường', async () => {
    const owner = await createUser({ username: 'c2_del_2' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'khong-don@u.local' });
    const token = await loginAs(owner);
    const res = await request(app).delete(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id = $1`, [cu.id])).rows[0].c).toBe(0);
  });

  it('khách của workspace khác vẫn là 404 (không lộ là có đơn hay không)', async () => {
    const owner = await createUser({ username: 'c2_del_3' });
    const other = await createUser({ username: 'c2_del_4' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'x@u.local' });
    await db.query(`INSERT INTO customer_purchases (id_customer, product_name) VALUES ($1, 'K')`, [cu.id]);
    const token = await loginAs(other);
    const res = await request(app).delete(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 7 — interested-courses có campaignId không bỏ phạm vi', () => {
  it('chiến dịch chưa có ai quan tâm → rỗng (trước đây trả khách quan tâm của cả workspace)', async () => {
    const owner = await createUser({ username: 'c2_int' });
    const campEmpty = await createCampaignRow({ userId: owner.id, name: 'Trống' });
    const campFull = await createCampaignRow({ userId: owner.id, name: 'Có' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'quan-tam@u.local' });
    await db.query(
      `INSERT INTO customer_purchases (id_customer, id_campaign, product_name, product_type, id_run)
       VALUES ($1, $2, 'Khoá X', 'interested', NULL)`,
      [cu.id, campFull.id]
    );
    const token = await loginAs(owner);

    const empty = await get(token, `/api/customers/interested-courses?campaignId=${campEmpty.id}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]);
    expect(empty.body.data.filters.campaignId).toBe(Number(campEmpty.id));

    const full = await get(token, `/api/customers/interested-courses?campaignId=${campFull.id}`);
    expect(full.body.data.items).toHaveLength(1);

    const workspaceWide = await get(token, '/api/customers/interested-courses');
    expect(workspaceWide.body.data.items).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 2 — body email nạp riêng', () => {
  async function seedEmail(owner, { customerEmail = 'body@u.local' } = {}) {
    const cu = await createCustomerRow({ userId: owner.id, email: customerEmail });
    const camp = await createCampaignRow({ userId: owner.id });
    const run = (await db.query(`INSERT INTO campaign_runs (id_campaign, status, started_at) VALUES ($1, 'completed', NOW()) RETURNING id`, [camp.id])).rows[0];
    const email = (await db.query(
      `INSERT INTO email_messages (id_customer, id_campaign, id_run, subject, status, sent_at, body_html, body_text)
       VALUES ($1, $2, $3, 'Chủ đề', 'sent', NOW(), '<p>NOI-DUNG-HTML</p>', 'NOI-DUNG-TEXT') RETURNING id`,
      [cu.id, camp.id, run.id]
    )).rows[0];
    return { cu, camp, email };
  }

  it('hồ sơ khách và /journey KHÔNG kèm bodyHtml/bodyText; metadata email vẫn còn', async () => {
    const owner = await createUser({ username: 'c2_body_1' });
    const { cu, email } = await seedEmail(owner);
    const token = await loginAs(owner);

    const profile = await get(token, `/api/customers/${cu.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.emailJourney).toHaveLength(1);
    expect(profile.body.data.emailJourney[0]).toMatchObject({ emailMessageId: email.id, subject: 'Chủ đề' });
    expect(JSON.stringify(profile.body)).not.toContain('NOI-DUNG');

    const journey = await get(token, `/api/customers/${cu.id}/journey`);
    expect(journey.status).toBe(200);
    expect(journey.body.summary.emailJourney).toHaveLength(1);
    expect(journey.body.summary.emailJourney[0]).toMatchObject({ emailMessageId: email.id });
    expect(JSON.stringify(journey.body)).not.toContain('NOI-DUNG');
  });

  it('GET /:id/emails/:emailId trả body; sai chủ / sai khách / không tồn tại / id lạ', async () => {
    const owner = await createUser({ username: 'c2_body_2' });
    const other = await createUser({ username: 'c2_body_3' });
    const { cu, email } = await seedEmail(owner);
    const otherCustomer = await createCustomerRow({ userId: owner.id, email: 'khac@u.local' });
    const token = await loginAs(owner);

    const ok = await get(token, `/api/customers/${cu.id}/emails/${email.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: email.id, subject: 'Chủ đề', bodyHtml: '<p>NOI-DUNG-HTML</p>', bodyText: 'NOI-DUNG-TEXT' });

    // email của khách này nhưng gọi qua khách khác cùng workspace → 404
    expect((await get(token, `/api/customers/${otherCustomer.id}/emails/${email.id}`)).status).toBe(404);
    // workspace khác → 404 (khách không thuộc về họ)
    const otherToken = await loginAs(other);
    expect((await get(otherToken, `/api/customers/${cu.id}/emails/${email.id}`)).status).toBe(404);
    expect((await get(token, `/api/customers/${cu.id}/emails/99999999`)).status).toBe(404);
    expect((await get(token, `/api/customers/${cu.id}/emails/abc`)).status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PR-C2 việc 3 — journey detail chạy song song, bỏ tổng toàn workspace', () => {
  it('trả đủ emails/purchases/journey/runs; summaries chỉ còn byCampaign + byCustomer', async () => {
    const owner = await createUser({ username: 'c2_detail' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'detail@u.local' });
    const camp = await createCampaignRow({ userId: owner.id });
    const run = (await db.query(`INSERT INTO campaign_runs (id_campaign, status, started_at) VALUES ($1, 'completed', NOW()) RETURNING id`, [camp.id])).rows[0];
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, email_opened_count, email_clicked_count)
       VALUES ($1, $2, 2, 1, 0)`,
      [camp.id, cu.id]
    );
    await db.query(
      `INSERT INTO email_messages (id_customer, id_campaign, id_run, subject, status, sent_at, body_html)
       VALUES ($1, $2, $3, 'Chủ đề', 'sent', NOW(), '<p>CO-BODY</p>')`,
      [cu.id, camp.id, run.id]
    );
    await db.query(
      `INSERT INTO customer_purchases (id_customer, id_campaign, id_run, product_name, amount) VALUES ($1, $2, $3, 'Khoá', 500000)`,
      [cu.id, camp.id, run.id]
    );
    await db.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type) VALUES ($1, $2, $3, 'email_sent')`,
      [cu.id, camp.id, run.id]
    );
    const token = await loginAs(owner);

    const res = await get(token, `/api/customers/${cu.id}/campaigns/${camp.id}/journey`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.emails).toHaveLength(1);
    expect(data.emails[0].bodyHtml).toBe('<p>CO-BODY</p>'); // modal xem email vẫn dùng body ở endpoint này
    expect(data.purchases).toHaveLength(1);
    expect(data.journey.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(data.summaries).sort()).toEqual(['byCampaign', 'byCustomer']);
    expect(data.summaries.byCampaign).toMatchObject({ participantCount: 1, emailReceivedCount: 2, purchaseCount: 1, revenue: expect.anything() });
    expect(data.summaries.byCustomer).toMatchObject({ campaignCount: 1, emailReceivedCount: 2 });
  });

  it('chiến dịch / khách của workspace khác → 404', async () => {
    const owner = await createUser({ username: 'c2_detail_a' });
    const other = await createUser({ username: 'c2_detail_b' });
    const cu = await createCustomerRow({ userId: owner.id, email: 'x@u.local' });
    const camp = await createCampaignRow({ userId: owner.id });
    const token = await loginAs(other);
    const res = await get(token, `/api/customers/${cu.id}/campaigns/${camp.id}/journey`);
    expect(res.status).toBe(404);
  });
});
