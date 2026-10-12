/**
 * Plan 12/10/2026 — thẻ sản phẩm trên biểu mẫu công khai. Unit test mock trọn repository nên KHÔNG bắt được
 * SQL thiếu cột: `findFormByPublicKey` phải chọn `product_id`, và `productRepository.findById` phải lọc đúng
 * workspace. Test này đi qua DB thật.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let seq = 0;

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

async function insertProduct(ownerId, overrides = {}) {
  const row = {
    name: 'Khoá học AI',
    price: '2tr',
    originalPrice: '3tr',
    status: 'active',
    thumbnailUrl: 'https://cdn.example.com/a.png',
    productUrl: 'https://example.com/noi-bo',
    productCode: 'SP-NOI-BO',
    description: 'Học AI từ con số 0',
    usp: 'Cầm tay chỉ việc',
    priceAmount: 2000000,
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO products
       (id_user, workspace_owner_id, product_name, price, original_price, status, thumbnail_url, product_url,
        product_code, description, usp, price_amount, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'sale') RETURNING id`,
    [ownerId, ownerId, row.name, row.price, row.originalPrice, row.status, row.thumbnailUrl, row.productUrl,
      row.productCode, row.description, row.usp, row.priceAmount]
  );
  return Number(rows[0].id);
}

async function insertPublishedForm(ownerId, { productId = null, settings = {} } = {}) {
  const publicKey = `pk${Date.now()}${seq++}`;
  const { rows } = await db.query(
    `INSERT INTO forms (workspace_owner_id, public_key, title, product_id, is_published, settings)
     VALUES ($1, $2, 'Form đặt mua', $3, true, $4::jsonb) RETURNING id`,
    [ownerId, publicKey, productId, JSON.stringify(settings)]
  );
  return { id: Number(rows[0].id), publicKey };
}

const PUBLIC_PRODUCT_KEYS = ['description', 'imageUrl', 'name', 'originalPrice', 'priceAmount', 'priceText', 'usp'];

describe('GET /api/public/forms/:publicKey — product (plan 12/10)', () => {
  it('form gắn sản phẩm đang bán -> product đủ 7 khoá, không lộ product_url / product_code / id', async () => {
    const owner = await createUser({ username: 'pf_owner_1' });
    const productId = await insertProduct(owner.id);
    const form = await insertPublishedForm(owner.id, { productId });

    const res = await request(app).get(`/api/public/forms/${form.publicKey}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data.product).sort()).toEqual(PUBLIC_PRODUCT_KEYS);
    expect(res.body.data.product).toEqual({
      name: 'Khoá học AI',
      imageUrl: 'https://cdn.example.com/a.png',
      priceText: '2tr',
      priceAmount: 2000000,
      originalPrice: '3tr',
      description: 'Học AI từ con số 0',
      usp: 'Cầm tay chỉ việc',
    });
    expect(JSON.stringify(res.body.data)).not.toContain('noi-bo');
    expect(JSON.stringify(res.body.data)).not.toContain('SP-NOI-BO');
  });

  it('không gắn sản phẩm / sản phẩm ngừng bán / thumbnail javascript: -> product null hoặc imageUrl null', async () => {
    const owner = await createUser({ username: 'pf_owner_2' });
    const inactive = await insertProduct(owner.id, { status: 'inactive', productCode: 'SP-2' });
    const badImage = await insertProduct(owner.id, { thumbnailUrl: 'javascript:alert(1)', productCode: 'SP-3' });

    const none = await insertPublishedForm(owner.id);
    const stopped = await insertPublishedForm(owner.id, { productId: inactive });
    const bad = await insertPublishedForm(owner.id, { productId: badImage });

    expect((await request(app).get(`/api/public/forms/${none.publicKey}`)).body.data.product).toBeNull();
    expect((await request(app).get(`/api/public/forms/${stopped.publicKey}`)).body.data.product).toBeNull();
    const badRes = await request(app).get(`/api/public/forms/${bad.publicKey}`);
    expect(badRes.body.data.product.imageUrl).toBeNull();
    expect(badRes.body.data.product.name).toBe('Khoá học AI');
  });

  it('sản phẩm của workspace KHÁC (dữ liệu lệch) -> product null, không lộ', async () => {
    const owner = await createUser({ username: 'pf_owner_3' });
    const other = await createUser({ username: 'pf_other_3' });
    const foreignProduct = await insertProduct(other.id, { name: 'Bí mật của người khác', productCode: 'SP-X' });
    const form = await insertPublishedForm(owner.id, { productId: foreignProduct });

    const res = await request(app).get(`/api/public/forms/${form.publicKey}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toBeNull();
    expect(JSON.stringify(res.body.data)).not.toContain('Bí mật');
  });

  it('chủ tắt công tắc qua PUT /api/forms/:id (settings.showProductCard=false) -> product null; bật lại -> có', async () => {
    const owner = await createUser({ username: 'pf_owner_4' });
    const token = await loginAs(owner);
    const productId = await insertProduct(owner.id);
    const form = await insertPublishedForm(owner.id, { productId });

    const off = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { showProductCard: false } });
    expect(off.status).toBe(200);
    expect(off.body.data.settings.showProductCard).toBe(false);
    expect((await request(app).get(`/api/public/forms/${form.publicKey}`)).body.data.product).toBeNull();

    const on = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { showProductCard: true } });
    expect(on.status).toBe(200);
    expect((await request(app).get(`/api/public/forms/${form.publicKey}`)).body.data.product).not.toBeNull();

    const bad = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { showProductCard: 'false' } });
    expect(bad.status).toBe(400);
  });

  it('trang trạng thái bài nộp trả product { name, imageUrl }', async () => {
    const owner = await createUser({ username: 'pf_owner_5' });
    const productId = await insertProduct(owner.id);
    const form = await insertPublishedForm(owner.id, { productId });
    const accessToken = `tok${Date.now()}${seq++}`;
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status)
       VALUES ($1, $2, $3, 'submitted')`,
      [form.id, owner.id, accessToken]
    );

    const res = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toEqual({ name: 'Khoá học AI', imageUrl: 'https://cdn.example.com/a.png' });
  });
});
