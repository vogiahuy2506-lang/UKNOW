import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return response.body.data.accessToken;
}

describe('Admin menu layout API', () => {
  it('chỉ cho super admin đọc cấu hình', async () => {
    const unauthenticated = await request(app).get('/api/admin/menu-layout');
    expect(unauthenticated.status).toBe(401);

    const user = await createUser({ role: 'user', username: 'menu_user' });
    const token = await loginAs(user);
    const forbidden = await request(app)
      .get('/api/admin/menu-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
  });

  it('trả danh sách rỗng khi chưa có cấu hình để frontend dùng mặc định', async () => {
    const admin = await createUser({ role: 'admin', username: 'menu_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .get('/api/admin/menu-layout')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { categories: [], updatedBy: null, updatedAt: null },
    });
  });

  it('lưu nguyên tử thứ tự chuyên mục/tab và người cập nhật', async () => {
    const admin = await createUser({ role: 'admin', username: 'menu_admin' });
    const token = await loginAs(admin);
    const categories = [
      {
        id: 'priority',
        nameVi: 'Ưu tiên',
        nameEn: 'Priority',
        itemKeys: ['orders', 'dashboard'],
      },
      {
        id: 'operations',
        nameVi: 'Vận hành',
        nameEn: 'Operations',
        itemKeys: ['server_monitoring'],
      },
    ];

    const saved = await request(app)
      .put('/api/admin/menu-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({ categories });

    expect(saved.status).toBe(200);
    expect(saved.body.data.categories).toEqual(categories);
    expect(Number(saved.body.data.updatedBy)).toBe(Number(admin.id));

    const fetched = await request(app)
      .get('/api/admin/menu-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.body.data.categories).toEqual(categories);

    const persisted = await db.query(
      `SELECT scope, categories, updated_by FROM admin_menu_layouts WHERE scope = 'super_admin'`
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].categories).toEqual(categories);
    expect(Number(persisted.rows[0].updated_by)).toBe(Number(admin.id));
  });

  it('từ chối layout gán cùng một tab vào nhiều chuyên mục', async () => {
    const admin = await createUser({ role: 'admin', username: 'menu_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .put('/api/admin/menu-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categories: [
          { id: 'one', nameVi: 'Một', itemKeys: ['orders'] },
          { id: 'two', nameVi: 'Hai', itemKeys: ['orders'] },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('gán nhiều lần');
  });
});
