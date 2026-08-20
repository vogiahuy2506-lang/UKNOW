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
