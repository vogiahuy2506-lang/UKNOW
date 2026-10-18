/**
 * PR-T1 (PLAN_TAG_KHACH_HANG) — tag khách hàng: CRUD, gắn/bỏ hàng loạt, lọc danh sách, cách ly workspace.
 * SQL thật trên Postgres (mock DB từng làm lọt SQL sai cột ở các đợt trước).
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

async function createCustomerRow({ userId, email, fullName = 'Khách' }) {
  const { rows } = await db.query(
    'INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, $3) RETURNING *',
    [userId, email, fullName],
  );
  return Number(rows[0].id);
}

const call = (method, token, url, body) => {
  const req = request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
};

async function setup() {
  const a = await createUser();
  const b = await createUser();
  const tokenA = await loginAs(a);
  const tokenB = await loginAs(b);
  return { a, b, tokenA, tokenB };
}

describe('CRUD tag', () => {
  it('tạo / liệt kê kèm số khách / đổi tên + màu / xoá', async () => {
    const { a, tokenA } = await setup();
    const c1 = await createCustomerRow({ userId: a.id, email: 'c1@x.vn' });
    const created = await call('post', tokenA, '/api/customers/tags', { name: '  Khách  VIP ', color: '#FF0000' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Khách VIP', color: '#ff0000' });
    const tagId = created.body.data.id;

    expect((await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [c1], tagIds: [tagId] })).status).toBe(200);
    const list = await call('get', tokenA, '/api/customers/tags');
    expect(list.body.data).toEqual([expect.objectContaining({ id: tagId, name: 'Khách VIP', customerCount: 1 })]);

    const renamed = await call('put', tokenA, `/api/customers/tags/${tagId}`, { name: 'VIP vàng', color: null });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ name: 'VIP vàng', color: null });

    const del = await call('delete', tokenA, `/api/customers/tags/${tagId}`);
    expect(del.status).toBe(200);
    expect(del.body.data.customerCount).toBe(1);
    expect((await call('get', tokenA, '/api/customers/tags')).body.data).toEqual([]);
  });

  it('trùng tên KHÔNG phân biệt hoa/thường → 409 (tạo và đổi tên); workspace khác được dùng cùng tên', async () => {
    const { tokenA, tokenB } = await setup();
    expect((await call('post', tokenA, '/api/customers/tags', { name: 'VIP' })).status).toBe(201);
    expect((await call('post', tokenA, '/api/customers/tags', { name: 'vip' })).status).toBe(409);
    expect((await call('post', tokenA, '/api/customers/tags', { name: ' ViP ' })).status).toBe(409);
    const other = await call('post', tokenA, '/api/customers/tags', { name: 'Khác' });
    expect((await call('put', tokenA, `/api/customers/tags/${other.body.data.id}`, { name: 'vIp' })).status).toBe(409);
    expect((await call('post', tokenB, '/api/customers/tags', { name: 'VIP' })).status).toBe(201);
  });

  it('đầu vào sai → 400', async () => {
    const { tokenA } = await setup();
    expect((await call('post', tokenA, '/api/customers/tags', { name: '   ' })).status).toBe(400);
    expect((await call('post', tokenA, '/api/customers/tags', { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await call('post', tokenA, '/api/customers/tags', { name: 'ok', color: 'red' })).status).toBe(400);
    expect((await call('put', tokenA, '/api/customers/tags/abc', { name: 'ok' })).status).toBe(400);
  });
});

describe('gắn / bỏ tag hàng loạt', () => {
  it('gắn nhiều khách x nhiều tag, chạy lại không nhân đôi, tagNames tạo tag mới / dùng lại tag cũ, rồi bỏ', async () => {
    const { a, tokenA } = await setup();
    const c1 = await createCustomerRow({ userId: a.id, email: 'c1@x.vn' });
    const c2 = await createCustomerRow({ userId: a.id, email: 'c2@x.vn' });
    const vip = (await call('post', tokenA, '/api/customers/tags', { name: 'VIP' })).body.data.id;

    const first = await call('post', tokenA, '/api/customers/tags/assign', {
      customerIds: [c1, c2], tagIds: [vip], tagNames: ['Mới', 'vip'],
    });
    expect(first.status).toBe(200);
    expect(first.body.data.assigned).toBe(4); // 2 khách x {VIP, Mới}; 'vip' trùng VIP không tạo tag thứ ba
    const again = await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [c1, c2], tagIds: [vip] });
    expect(again.body.data.assigned).toBe(0);
    expect((await call('get', tokenA, '/api/customers/tags')).body.data).toHaveLength(2);

    const profile = await call('get', tokenA, `/api/customers/${c1}/tags`);
    expect(profile.body.data.map((t) => t.name).sort()).toEqual(['Mới', 'VIP']);

    const removed = await call('post', tokenA, '/api/customers/tags/unassign', { customerIds: [c1], tagIds: [vip] });
    expect(removed.body.data.removed).toBe(1);
    expect((await call('get', tokenA, `/api/customers/${c1}/tags`)).body.data.map((t) => t.name)).toEqual(['Mới']);
  });

  it('trần 5.000 khách mỗi lần → 400', async () => {
    const { tokenA } = await setup();
    const tag = (await call('post', tokenA, '/api/customers/tags', { name: 'VIP' })).body.data.id;
    const ids = Array.from({ length: 5001 }, (_, i) => i + 1);
    const res = await call('post', tokenA, '/api/customers/tags/assign', { customerIds: ids, tagIds: [tag] });
    expect(res.status).toBe(400);
  });
});

describe('cách ly workspace', () => {
  it('chủ A không gắn được tag của B, không gắn được khách của B, không sửa/xoá/thấy tag của B', async () => {
    const { a, b, tokenA, tokenB } = await setup();
    const cA = await createCustomerRow({ userId: a.id, email: 'a@x.vn' });
    const cB = await createCustomerRow({ userId: b.id, email: 'b@x.vn' });
    const tagA = (await call('post', tokenA, '/api/customers/tags', { name: 'Của A' })).body.data.id;
    const tagB = (await call('post', tokenB, '/api/customers/tags', { name: 'Của B' })).body.data.id;

    // A gắn tag của B → 404, không ghi.
    expect((await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [cA], tagIds: [tagB] })).status).toBe(404);
    // A gắn tag của mình cho khách của B → bỏ qua (0 dòng), B vẫn sạch.
    const cross = await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [cB], tagIds: [tagA] });
    expect(cross.status).toBe(200);
    expect(cross.body.data.assigned).toBe(0);
    const { rows: leaked } = await db.query('SELECT 1 FROM customer_tag_assignments WHERE customer_id = $1', [cB]);
    expect(leaked).toHaveLength(0);

    // B gắn thật; A không gỡ được.
    await call('post', tokenB, '/api/customers/tags/assign', { customerIds: [cB], tagIds: [tagB] });
    const unassign = await call('post', tokenA, '/api/customers/tags/unassign', { customerIds: [cB], tagIds: [tagB] });
    expect(unassign.body.data.removed).toBe(0);
    const { rows: still } = await db.query('SELECT 1 FROM customer_tag_assignments WHERE customer_id = $1', [cB]);
    expect(still).toHaveLength(1);

    // Sửa / xoá tag của B → 404; danh sách của A không có tag của B; hồ sơ khách của B → 404.
    expect((await call('put', tokenA, `/api/customers/tags/${tagB}`, { name: 'Hack' })).status).toBe(404);
    expect((await call('delete', tokenA, `/api/customers/tags/${tagB}`)).status).toBe(404);
    expect((await call('get', tokenA, '/api/customers/tags')).body.data.map((t) => t.name)).toEqual(['Của A']);
    expect((await call('get', tokenA, `/api/customers/${cB}/tags`)).status).toBe(404);
    expect((await call('get', tokenB, '/api/customers/tags')).body.data[0]).toMatchObject({ name: 'Của B', customerCount: 1 });
  });

  it('lọc danh sách theo tagIds của workspace khác → không ra khách nào (kể cả khách của chính mình)', async () => {
    const { a, b, tokenA, tokenB } = await setup();
    await createCustomerRow({ userId: a.id, email: 'a@x.vn' });
    const cB = await createCustomerRow({ userId: b.id, email: 'b@x.vn' });
    const tagB = (await call('post', tokenB, '/api/customers/tags', { name: 'Của B' })).body.data.id;
    await call('post', tokenB, '/api/customers/tags/assign', { customerIds: [cB], tagIds: [tagB] });
    const res = await call('get', tokenA, `/api/customers?tagIds=${tagB}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});

describe('lọc danh sách + cột tags', () => {
  async function seed() {
    const { a, tokenA } = await setup();
    const x = await createCustomerRow({ userId: a.id, email: 'x@x.vn' });
    const y = await createCustomerRow({ userId: a.id, email: 'y@x.vn' });
    const z = await createCustomerRow({ userId: a.id, email: 'z@x.vn' });
    const both = await createCustomerRow({ userId: a.id, email: 'both@x.vn' });
    const t1 = (await call('post', tokenA, '/api/customers/tags', { name: 'T1', color: '#111111' })).body.data.id;
    const t2 = (await call('post', tokenA, '/api/customers/tags', { name: 'T2' })).body.data.id;
    await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [x, both], tagIds: [t1] });
    await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [y, both], tagIds: [t2] });
    return { tokenA, x, y, z, both, t1, t2 };
  }

  it('tagIds lọc theo BẤT KỲ tag (ANY): ra khách có T1 hoặc T2, mỗi khách một dòng, tổng đúng', async () => {
    const { tokenA, x, y, both, t1, t2 } = await seed();
    const res = await call('get', tokenA, `/api/customers?tagIds=${t1},${t2}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => Number(i.id)).sort((p, q) => p - q)).toEqual([x, y, both].sort((p, q) => p - q));
    expect(res.body.data.pagination.total).toBe(3);
  });

  it('một tag: chỉ khách mang tag đó; items có tags[{id,name,color}]', async () => {
    const { tokenA, x, both, t1, t2 } = await seed();
    const res = await call('get', tokenA, `/api/customers?tagIds=${t1}`);
    expect(res.body.data.items.map((i) => Number(i.id)).sort((p, q) => p - q)).toEqual([x, both].sort((p, q) => p - q));
    const bothRow = res.body.data.items.find((i) => Number(i.id) === both);
    expect(bothRow.tags).toEqual([
      { id: t1, name: 'T1', color: '#111111' },
      { id: t2, name: 'T2', color: null },
    ]);
  });

  it('không lọc: khách không tag có tags [] ; tagIds sai kiểu → 400; export CSV lọc theo tagIds', async () => {
    const { tokenA, z, t2 } = await seed();
    const all = await call('get', tokenA, '/api/customers');
    expect(all.body.data.items.find((i) => Number(i.id) === z).tags).toEqual([]);
    expect((await call('get', tokenA, '/api/customers?tagIds=abc')).status).toBe(400);
    const csv = await call('get', tokenA, `/api/customers/export.csv?tagIds=${t2}`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('y@x.vn');
    expect(csv.text).toContain('both@x.vn');
    expect(csv.text).not.toContain('x@x.vn,');
    expect(csv.text).not.toContain('z@x.vn');
  });
});

describe('xoá', () => {
  it('xoá tag xoá luôn các lần gán; xoá khách xoá lần gán (cascade)', async () => {
    const { a, tokenA } = await setup();
    const c1 = await createCustomerRow({ userId: a.id, email: 'c1@x.vn' });
    const c2 = await createCustomerRow({ userId: a.id, email: 'c2@x.vn' });
    const t = (await call('post', tokenA, '/api/customers/tags', { name: 'T' })).body.data.id;
    await call('post', tokenA, '/api/customers/tags/assign', { customerIds: [c1, c2], tagIds: [t] });
    await db.query('DELETE FROM customers WHERE id = $1', [c2]);
    expect((await db.query('SELECT 1 FROM customer_tag_assignments WHERE tag_id = $1', [t])).rows).toHaveLength(1);
    await call('delete', tokenA, `/api/customers/tags/${t}`);
    expect((await db.query('SELECT 1 FROM customer_tag_assignments')).rows).toHaveLength(0);
    const customers = await db.query('SELECT id FROM customers WHERE id = $1', [c1]);
    expect(customers.rows).toHaveLength(1);
  });
});
