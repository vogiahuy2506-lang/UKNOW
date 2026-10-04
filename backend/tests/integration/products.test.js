import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const reembedChunks = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../../src/services/ai/businessProfile.service.js', () => ({
  default: { reembedChunks },
  serializeProductList: jest.fn(() => ''),
}));

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
  reembedChunks.mockClear();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertProduct(ownerId, name) {
  const { rows } = await db.query(
    `INSERT INTO products (id_user, product_name, status)
     VALUES ($1, $2, 'active')
     RETURNING *`,
    [ownerId, name]
  );
  return rows[0];
}

describe('Products employee workspace ownership', () => {
  it('list/create dùng owner scope, lưu owner và actor riêng', async () => {
    const ownerA = await createUser({ username: 'product_workspace_a' });
    const ownerB = await createUser({ username: 'product_workspace_b' });
    const employee = await createUser({ username: 'product_workspace_employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')`,
      [ownerA.id, employee.id, JSON.stringify({ courses: true })]
    );
    await insertProduct(ownerA.id, 'Owner A Product');
    const productB = await insertProduct(ownerB.id, 'Owner B Product');

    const token = await loginAs(employee);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Owner-Context': String(ownerA.id),
    };

    const listRes = await request(app).get('/api/products').set(headers);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.products.map((item) => item.productName)).toEqual(['Owner A Product']);

    const createRes = await request(app)
      .post('/api/products')
      .set(headers)
      .send({ productName: 'Employee Product', category: 'AI' });
    expect(createRes.status).toBe(201);

    const { rows } = await db.query(
      `SELECT id_user, workspace_owner_id, created_by
       FROM products WHERE id = $1`,
      [createRes.body.data.id]
    );
    expect(Number(rows[0].id_user)).toBe(Number(ownerA.id));
    expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerA.id));
    expect(Number(rows[0].created_by)).toBe(Number(employee.id));
    expect(reembedChunks).toHaveBeenCalledWith(Number(ownerA.id));
    // Không gửi kind -> DEFAULT 'sale'; kind=event ghi/đọc được; kind lạ bị validator chặn
    expect(createRes.body.data.kind).toBe('sale');
    const evRes = await request(app).post('/api/products').set(headers).send({ productName: 'Hội thảo', kind: 'event' });
    expect(evRes.status).toBe(201);
    expect(evRes.body.data.kind).toBe('event');
    const badRes = await request(app).post('/api/products').set(headers).send({ productName: 'X', kind: 'zzz' });
    expect(badRes.status).toBe(400);
    const putRes = await request(app).put(`/api/products/${evRes.body.data.id}`).set(headers).send({ productName: 'Hội thảo 2' });
    expect(putRes.body.data.kind).toBe('event');

    const crossTenantRes = await request(app).get(`/api/products/${productB.id}`).set(headers);
    expect(crossTenantRes.status).toBe(404);
  });

  it('employee update/delete product trong owner workspace', async () => {
    const owner = await createUser({ username: 'product_mutation_owner' });
    const employee = await createUser({ username: 'product_mutation_employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ courses: true })]
    );
    const product = await insertProduct(owner.id, 'Before');
    const token = await loginAs(employee);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Owner-Context': String(owner.id),
    };

    const updateRes = await request(app)
      .put(`/api/products/${product.id}`)
      .set(headers)
      .send({ productName: 'After' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.productName).toBe('After');

    const deleteRes = await request(app).delete(`/api/products/${product.id}`).set(headers);
    expect(deleteRes.status).toBe(200);
    const { rows } = await db.query('SELECT id FROM products WHERE id = $1', [product.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('Products — price_amount (giá dạng số)', () => {
  it('tạo/sửa: tự điền từ giá chữ đọc được, nhận số gửi lên, 400 khi sai, giá mơ hồ để null; lưu đúng cột price_amount', async () => {
    const owner = await createUser({ username: 'product_price_amount_owner' });
    const token = await loginAs(owner);
    const headers = { Authorization: `Bearer ${token}` };

    const auto = await request(app).post('/api/products').set(headers).send({ productName: 'Khoá A', price: '1,5tr' });
    expect(auto.status).toBe(201);
    expect(auto.body.data.priceAmount).toBe(1500000);
    const { rows } = await db.query('SELECT price_amount FROM products WHERE id = $1', [auto.body.data.id]);
    expect(String(rows[0].price_amount)).toBe('1500000');

    const explicit = await request(app).post('/api/products').set(headers).send({ productName: 'Khoá B', price: '1,5tr', priceAmount: 1400000 });
    expect(explicit.body.data.priceAmount).toBe(1400000);

    const vague = await request(app).post('/api/products').set(headers).send({ productName: 'Khoá C', price: 'Liên hệ' });
    expect(vague.status).toBe(201);
    expect(vague.body.data.priceAmount).toBeNull();

    const bad = await request(app).post('/api/products').set(headers).send({ productName: 'Khoá D', priceAmount: -5 });
    expect(bad.status).toBe(400);

    // sửa: không đụng giá → giữ số; đổi chữ giá → đọc lại
    const keep = await request(app).put(`/api/products/${auto.body.data.id}`).set(headers).send({ productName: 'Khoá A2' });
    expect(keep.body.data.priceAmount).toBe(1500000);
    const reprice = await request(app).put(`/api/products/${auto.body.data.id}`).set(headers).send({ price: '2tr' });
    expect(reprice.body.data.priceAmount).toBe(2000000);

    // danh sách trả priceAmount
    const list = await request(app).get('/api/products').set(headers);
    const byName = Object.fromEntries(list.body.data.products.map((p) => [p.productName, p.priceAmount]));
    expect(byName['Khoá A2']).toBe(2000000);
    expect(byName['Khoá B']).toBe(1400000);
    expect(byName['Khoá C']).toBeNull();
  });
});

