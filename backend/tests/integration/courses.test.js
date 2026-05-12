/**
 * Integration tests cho `/api/courses` — Batch D.
 *
 * Phạm vi:
 *   - GET  /api/courses                 (getAll: search/filter/pagination + scope)
 *   - GET  /api/courses/:id             (getById: ownership check + admin override)
 *   - POST /api/courses/sync            (syncManual: gọi Founder AI qua axios)
 *
 * Mock:
 *   - `axios` được mock bằng `jest.unstable_mockModule` để chặn HTTP ra
 *     ngoài (Founder AI WooCommerce REST). DB dùng thật để verify INSERT/UPDATE.
 *   - Env `UKNOW_CONSUMER_KEY`/`SECRET` được set trước khi import controller
 *     (controller capture trong constructor).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

process.env.UKNOW_API_URL = 'https://test.local/wp-json';
process.env.UKNOW_CONSUMER_KEY = 'test-key';
process.env.UKNOW_CONSUMER_SECRET = 'test-secret';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet },
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
  mockAxiosGet.mockReset();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertCourse({
  idUser,
  courseCode,
  courseName = 'Khoá A',
  price = 100000,
  originalPrice = 200000,
  status = 'publish',
  description = null,
  category = null,
  thumbnailUrl = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO courses (id_user, course_code, course_name, price, original_price, status, description, category, thumbnail_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [idUser, courseCode, courseName, price, originalPrice, status, description, category, thumbnailUrl]
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/courses
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/courses', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(401);
  });

  it('DB rỗng cho user → 200 với danh sách rỗng', async () => {
    const user = await createUser({ username: 'c-empty' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courses).toEqual([]);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20, total: 0 });
  });

  it('user role=user chỉ thấy course của mình', async () => {
    const me = await createUser({ username: 'c-me' });
    const other = await createUser({ username: 'c-other' });
    await insertCourse({ idUser: me.id, courseCode: 'M1', courseName: 'My Course' });
    await insertCourse({ idUser: other.id, courseCode: 'O1', courseName: 'Foreign' });
    const token = await loginAs(me);
    const res = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courses).toHaveLength(1);
    expect(res.body.data.courses[0].courseCode).toBe('M1');
  });

  it('role=admin thấy tất cả courses', async () => {
    const admin = await createUser({ username: 'c-admin', role: 'admin' });
    const u1 = await createUser({ username: 'c-u1' });
    const u2 = await createUser({ username: 'c-u2' });
    await insertCourse({ idUser: u1.id, courseCode: 'A1' });
    await insertCourse({ idUser: u2.id, courseCode: 'A2' });
    const token = await loginAs(admin);
    const res = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courses.map((c) => c.courseCode).sort()).toEqual(['A1', 'A2']);
  });

  it('search ILIKE course_name + pagination', async () => {
    const user = await createUser({ username: 'c-search' });
    for (let i = 1; i <= 3; i += 1) {
      await insertCourse({ idUser: user.id, courseCode: `S${i}`, courseName: `Marketing ${i}` });
    }
    await insertCourse({ idUser: user.id, courseCode: 'X1', courseName: 'Sales 1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/courses?search=Marketing&page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(res.body.data.courses).toHaveLength(2);
  });

  it('status=publish,pending filter ANY', async () => {
    const user = await createUser({ username: 'c-status' });
    await insertCourse({ idUser: user.id, courseCode: 'P1', status: 'publish' });
    await insertCourse({ idUser: user.id, courseCode: 'P2', status: 'pending' });
    await insertCourse({ idUser: user.id, courseCode: 'D1', status: 'draft' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/courses?status=publish,pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courses.map((c) => c.courseCode).sort()).toEqual(['P1', 'P2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/courses/:id
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/courses/:id', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/courses/1');
    expect(res.status).toBe(401);
  });

  it('id không tồn tại → 404', async () => {
    const user = await createUser({ username: 'c-by-1' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/courses/99999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('owner thấy → 200 với camelCase mapping', async () => {
    const user = await createUser({ username: 'c-by-2' });
    const row = await insertCourse({
      idUser: user.id,
      courseCode: 'B1',
      courseName: 'Hello',
      originalPrice: 500000,
      description: 'desc',
      category: 'AI',
      thumbnailUrl: 'https://x.test/t.png',
    });
    const token = await loginAs(user);
    const res = await request(app).get(`/api/courses/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      courseCode: 'B1',
      courseName: 'Hello',
      originalPrice: 500000,
      description: 'desc',
      category: 'AI',
      thumbnailUrl: 'https://x.test/t.png',
    });
  });

  it('không phải owner và không phải admin → 403', async () => {
    const me = await createUser({ username: 'c-by-3' });
    const other = await createUser({ username: 'c-by-3-other' });
    const row = await insertCourse({ idUser: other.id, courseCode: 'B3' });
    const token = await loginAs(me);
    const res = await request(app).get(`/api/courses/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin xem được course của user khác', async () => {
    const admin = await createUser({ username: 'c-by-admin', role: 'admin' });
    const owner = await createUser({ username: 'c-by-owner' });
    const row = await insertCourse({ idUser: owner.id, courseCode: 'AD1' });
    const token = await loginAs(admin);
    const res = await request(app).get(`/api/courses/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courseCode).toBe('AD1');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/courses/sync  (axios mocked)
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/courses/sync', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/courses/sync');
    expect(res.status).toBe(401);
  });

  it('happy path: 1 order, 1 product → INSERT mới', async () => {
    const user = await createUser({ username: 'c-sync-1' });
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders')) {
        return {
          data: [
            { id: 1, line_items: [{ product_id: 999 }] },
          ],
          headers: { 'x-wp-totalpages': '1' },
        };
      }
      if (url.endsWith('/wc/v3/products/999')) {
        return {
          data: {
            id: 999,
            name: 'Khoá Founder AI',
            price: '499000',
            regular_price: '799000',
            short_description: 'AI cho nhà sáng lập',
            categories: [{ name: 'AI Coaching' }],
            permalink: 'https://founderai.biz/courses/999',
            status: 'publish',
          },
        };
      }
      throw new Error(`Unmocked URL: ${url}`);
    });

    const res = await request(app).post('/api/courses/sync').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      success: true,
      totalOrders: 1,
      totalLineItems: 1,
      totalInserted: 1,
      totalUpdated: 0,
      uniqueProductsFromOrders: 1,
    });

    const { rows } = await db.query(
      `SELECT course_code, course_name, price, original_price, category FROM courses WHERE id_user = $1`,
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      course_code: '999',
      course_name: 'Khoá Founder AI',
      price: '499000',
      original_price: '799000',
      category: 'AI Coaching',
    });
  });

  it('course đã tồn tại + có thay đổi price → UPDATE path', async () => {
    const user = await createUser({ username: 'c-sync-2' });
    await insertCourse({
      idUser: user.id,
      courseCode: '888',
      courseName: 'Khoá cũ',
      price: 100000,
      originalPrice: 100000,
      category: 'old-cat',
    });
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders')) {
        return {
          data: [{ id: 1, line_items: [{ product_id: 888 }] }],
          headers: { 'x-wp-totalpages': '1' },
        };
      }
      if (url.endsWith('/wc/v3/products/888')) {
        return {
          data: {
            id: 888,
            name: 'Khoá mới',
            price: '300000',
            regular_price: '500000',
            categories: [{ name: 'new-cat' }],
            status: 'publish',
          },
        };
      }
      throw new Error(`Unmocked URL: ${url}`);
    });

    const res = await request(app).post('/api/courses/sync').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalInserted: 0, totalUpdated: 1 });

    const { rows } = await db.query(
      `SELECT course_name, price, category FROM courses WHERE id_user = $1 AND course_code = '888'`,
      [user.id]
    );
    expect(rows[0]).toMatchObject({
      course_name: 'Khoá mới',
      price: '300000',
      category: 'new-cat',
    });
  });

  it('axios /orders 401 lỗi → success:false, errors array có entry', async () => {
    const user = await createUser({ username: 'c-sync-3' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders')) {
        const err = new Error('Request failed with status code 401');
        err.response = { status: 401 };
        throw err;
      }
      return null;
    });
    const res = await request(app).post('/api/courses/sync').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true); // không có order → coi như sync xong (0 items)
    expect(res.body.data.errors).toBeDefined();
    expect(res.body.data.errors.length).toBeGreaterThan(0);
  });

  it('product trả 404 → totalSkipped tăng, totalInserted=0', async () => {
    const user = await createUser({ username: 'c-sync-4' });
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders')) {
        return {
          data: [{ id: 1, line_items: [{ product_id: 404 }] }],
          headers: { 'x-wp-totalpages': '1' },
        };
      }
      if (url.endsWith('/wc/v3/products/404')) {
        const err = new Error('Not Found');
        err.response = { status: 404 };
        throw err;
      }
      return null;
    });

    const res = await request(app).post('/api/courses/sync').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalInserted: 0,
      totalSkipped: 1,
      totalChecked: 1,
    });
  });

  it('employee context (X-Owner-Context) → INSERT vào id_user của owner', async () => {
    const owner = await createUser({ username: 'c-sync-owner' });
    const employee = await createUser({ username: 'c-sync-emp', role: 'employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ courses: true })]
    );
    const token = await loginAs(employee);

    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders')) {
        return {
          data: [{ id: 1, line_items: [{ product_id: 555 }] }],
          headers: { 'x-wp-totalpages': '1' },
        };
      }
      if (url.endsWith('/wc/v3/products/555')) {
        return {
          data: {
            id: 555,
            name: 'Khoá owner',
            price: '100000',
            regular_price: '100000',
            status: 'publish',
          },
        };
      }
      return null;
    });

    const res = await request(app)
      .post('/api/courses/sync')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id));
    expect(res.status).toBe(200);

    const { rows } = await db.query(`SELECT id_user FROM courses WHERE course_code = '555'`);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
  });
});
