/**
 * PR-C3 (PLAN_RA_SOAT_DOT3_KHACH_HANG) — phần backend phục vụ giao diện Khách hàng:
 *   1. `GET /api/customers/export.csv`: BOM UTF-8, đúng cột, cùng bộ lọc với danh sách, cô lập workspace,
 *      trần 10.000 dòng (+ cờ báo bị cắt), cần đăng nhập.
 *   2. `GET /api/customers` trả thêm trạng thái email (huỷ đăng ký / bounce) và ngày vào chiến dịch; lọc `emailStatus`.
 *   3. Hồ sơ khách trả `consentSource`, `emailUnsubscribedAt`, `emailHardBounced`.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

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
  userId, email = null, phone = null, fullName = 'Khách', consentSource = null,
  subscribed = true, hardBounced = false, unsubscribedAt = null, createdAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name, consent_source, email_subscribed, email_hard_bounced,
                            email_unsubscribed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW())) RETURNING *`,
    [userId, email, phone, fullName, consentSource, subscribed, hardBounced, unsubscribedAt, createdAt]
  );
  return rows[0];
}

const get = (token, url) => request(app).get(url).set('Authorization', `Bearer ${token}`);

/** Tách thân CSV thành các dòng (bỏ BOM + dòng trống cuối). */
const csvLines = (text) => text.replace(/^﻿/, '').split('\r\n').filter(Boolean);

describe('PR-C3 — GET /api/customers/export.csv', () => {
  it('cần đăng nhập', async () => {
    const res = await request(app).get('/api/customers/export.csv');
    expect(res.status).toBe(401);
  });

  it('BOM UTF-8 + header đúng + cột cơ bản + nhãn trạng thái email', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, fullName: 'Nguyễn, An', email: 'an@u.local', phone: '0912345678', consentSource: 'manual' });
    await createCustomerRow({ userId: user.id, fullName: 'Bình', email: 'binh@u.local', consentSource: 'import', subscribed: false });
    await createCustomerRow({ userId: user.id, fullName: 'Chi', email: 'chi@u.local', consentSource: 'form_submission', hardBounced: true });
    const token = await loginAs(user);

    const res = await get(token, '/api/customers/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="khach-hang-\d{8}\.csv"$/);
    expect(res.headers['x-export-row-count']).toBe('3');
    expect(res.headers['x-export-truncated']).toBe('false');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);

    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Họ tên,Email,Số điện thoại,Nguồn dữ liệu,Trạng thái email,Ngày tạo');
    expect(lines).toHaveLength(4);
    // mới nhất trước: Chi, Bình, An
    expect(lines[1]).toMatch(/^Chi,chi@u\.local,,Biểu mẫu,Bounce,\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(lines[2]).toMatch(/^Bình,binh@u\.local,,Nhập file,Đã huỷ nhận,/);
    expect(lines[3]).toMatch(/^"Nguyễn, An",an@u\.local,0912345678,Thủ công,Đang nhận,/);
  });

  it('CHỈ xuất khách của workspace mình, kể cả khi người khác có dữ liệu trùng email', async () => {
    const mine = await createUser();
    const other = await createUser();
    await createCustomerRow({ userId: mine.id, fullName: 'Của tôi', email: 'chung@u.local' });
    await createCustomerRow({ userId: other.id, fullName: 'Của người khác', email: 'chung@u.local' });
    await createCustomerRow({ userId: other.id, fullName: 'Bí mật', email: 'bimat@u.local' });
    const token = await loginAs(mine);

    const res = await get(token, '/api/customers/export.csv');

    expect(res.status).toBe(200);
    const lines = csvLines(res.text);
    expect(lines).toHaveLength(2);
    expect(res.text).toContain('Của tôi');
    expect(res.text).not.toContain('Của người khác');
    expect(res.text).not.toContain('Bí mật');
  });

  it('cùng bộ lọc với danh sách: search, consentSource, emailStatus', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, fullName: 'An', email: 'an@u.local', consentSource: 'import' });
    await createCustomerRow({ userId: user.id, fullName: 'An Huỷ', email: 'anhuy@u.local', consentSource: 'import', subscribed: false });
    await createCustomerRow({ userId: user.id, fullName: 'Bình', email: 'binh@u.local', consentSource: 'manual', subscribed: false });
    await createCustomerRow({ userId: user.id, fullName: 'Chi Bounce', email: 'chi@u.local', consentSource: 'manual', hardBounced: true });
    const token = await loginAs(user);

    const bySearch = await get(token, '/api/customers/export.csv?search=an');
    expect(csvLines(bySearch.text).slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['An', 'An Huỷ']);

    const bySource = await get(token, '/api/customers/export.csv?consentSource=manual');
    expect(csvLines(bySource.text).slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['Bình', 'Chi Bounce']);

    const unsub = await get(token, '/api/customers/export.csv?emailStatus=unsubscribed');
    expect(csvLines(unsub.text).slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['An Huỷ', 'Bình']);

    const bounced = await get(token, '/api/customers/export.csv?emailStatus=bounced');
    expect(csvLines(bounced.text).slice(1).map((l) => l.split(',')[0])).toEqual(['Chi Bounce']);

    const subscribed = await get(token, '/api/customers/export.csv?emailStatus=subscribed');
    expect(csvLines(subscribed.text).slice(1).map((l) => l.split(',')[0])).toEqual(['An']);

    const combined = await get(token, '/api/customers/export.csv?consentSource=import&emailStatus=unsubscribed');
    expect(csvLines(combined.text).slice(1).map((l) => l.split(',')[0])).toEqual(['An Huỷ']);

    // danh sách và file xuất cho CÙNG kết quả với cùng bộ lọc
    const list = await get(token, '/api/customers?consentSource=import&emailStatus=unsubscribed');
    expect(list.body.data.items.map((i) => i.fullName)).toEqual(['An Huỷ']);
  });

  it('không có khách nào → vẫn trả file có BOM + tiêu đề, 0 dòng', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await get(token, '/api/customers/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['x-export-row-count']).toBe('0');
    expect(csvLines(res.text)).toHaveLength(1);
  });

  it('chống CSV injection: tên bắt đầu bằng "=" được chèn dấu nháy', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, fullName: '=HYPERLINK("http://evil")', email: 'x@u.local' });
    const token = await loginAs(user);
    const res = await get(token, '/api/customers/export.csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('trần 10.000 dòng: 10.005 khách → xuất 10.000 và báo bị cắt', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at)
       SELECT $1, 'bulk' || g || '@u.local', 'Khách ' || g, NOW() - (g || ' seconds')::interval
       FROM generate_series(1, 10005) AS g`,
      [user.id]
    );
    const token = await loginAs(user);

    const res = await get(token, '/api/customers/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['x-export-truncated']).toBe('true');
    expect(res.headers['x-export-row-count']).toBe('10000');
    expect(csvLines(res.text)).toHaveLength(10001); // tiêu đề + 10.000
  }, 60000);

  it('đúng 10.000 khách → không báo bị cắt', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO customers (id_user, email, full_name)
       SELECT $1, 'bulk' || g || '@u.local', 'Khách ' || g FROM generate_series(1, 10000) AS g`,
      [user.id]
    );
    const token = await loginAs(user);
    const res = await get(token, '/api/customers/export.csv');
    expect(res.headers['x-export-truncated']).toBe('false');
    expect(csvLines(res.text)).toHaveLength(10001);
  }, 60000);

  it('`/export.csv` không bị bắt nhầm làm `/:id` (không trả 400 "ID không hợp lệ")', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await get(token, '/api/customers/export.csv');
    expect(res.status).not.toBe(400);
  });
});

describe('PR-C3 — danh sách & hồ sơ trả trạng thái email', () => {
  it('GET /api/customers trả emailSubscribed/emailUnsubscribedAt/emailHardBounced', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, fullName: 'Huỷ', email: 'huy@u.local', subscribed: false, unsubscribedAt: '2026-10-05T03:00:00.000Z' });
    await createCustomerRow({ userId: user.id, fullName: 'Bounce', email: 'bounce@u.local', hardBounced: true });
    await createCustomerRow({ userId: user.id, fullName: 'Thường', email: 'thuong@u.local' });
    const token = await loginAs(user);

    const res = await get(token, '/api/customers?limit=10');
    const byName = Object.fromEntries(res.body.data.items.map((i) => [i.fullName, i]));

    expect(byName['Huỷ']).toMatchObject({ emailSubscribed: false, emailHardBounced: false });
    expect(new Date(byName['Huỷ'].emailUnsubscribedAt).toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(byName['Bounce']).toMatchObject({ emailSubscribed: true, emailHardBounced: true, emailUnsubscribedAt: null });
    expect(byName['Thường']).toMatchObject({ emailSubscribed: true, emailHardBounced: false, emailUnsubscribedAt: null });
  });

  it('lọc emailStatus trên danh sách (tổng + trang đúng) và bỏ qua giá trị lạ', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, fullName: 'A', email: 'a@u.local', subscribed: false });
    await createCustomerRow({ userId: user.id, fullName: 'B', email: 'b@u.local', hardBounced: true });
    await createCustomerRow({ userId: user.id, fullName: 'C', email: 'c@u.local' });
    const token = await loginAs(user);

    const unsub = await get(token, '/api/customers?emailStatus=unsubscribed');
    expect(unsub.body.data.items.map((i) => i.fullName)).toEqual(['A']);
    expect(unsub.body.data.pagination.total).toBe(1);

    const bounced = await get(token, '/api/customers?emailStatus=bounced');
    expect(bounced.body.data.items.map((i) => i.fullName)).toEqual(['B']);

    const ok = await get(token, '/api/customers?emailStatus=subscribed');
    expect(ok.body.data.items.map((i) => i.fullName)).toEqual(['C']);

    const weird = await get(token, "/api/customers?emailStatus=' OR 1=1 --");
    expect(weird.status).toBe(200);
    expect(weird.body.data.pagination.total).toBe(3);
  });

  it('có campaignId: mỗi khách kèm campaignJoinedAt = ngày vào chiến dịch (không phải ngày tạo khách)', async () => {
    const user = await createUser();
    const { rows: [campaign] } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'C', 'running') RETURNING id`, [user.id]
    );
    const customer = await createCustomerRow({ userId: user.id, fullName: 'Vào sau', email: 'v@u.local', createdAt: '2026-01-05T03:00:00.000Z' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at) VALUES ($1, $2, '2026-10-09T03:00:00.000Z'::timestamptz)`,
      [campaign.id, customer.id]
    );
    const token = await loginAs(user);

    const withCampaign = await get(token, `/api/customers?campaignId=${campaign.id}`);
    expect(new Date(withCampaign.body.data.items[0].campaignJoinedAt).toISOString()).toBe('2026-10-09T03:00:00.000Z');

    const without = await get(token, '/api/customers');
    expect(without.body.data.items[0].campaignJoinedAt).toBeNull();
  });

  it('hồ sơ khách trả consentSource + trạng thái huỷ/bounce', async () => {
    const user = await createUser();
    const customer = await createCustomerRow({
      userId: user.id, email: 'p@u.local', consentSource: 'landing_lead', subscribed: false, hardBounced: true,
      unsubscribedAt: '2026-10-05T03:00:00.000Z',
    });
    const token = await loginAs(user);
    const res = await get(token, `/api/customers/${customer.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ consentSource: 'landing_lead', emailSubscribed: false, emailHardBounced: true });
    expect(new Date(res.body.data.emailUnsubscribedAt).toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });
});
