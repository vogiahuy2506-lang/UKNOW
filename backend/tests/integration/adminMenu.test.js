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

  it('khách (role user) đọc GET /api/users/app-menu-layout thành công và chỉ nhận categories', async () => {
    const user = await createUser({ role: 'user', username: 'guest_menu_user' });
    const token = await loginAs(user);

    const response = await request(app)
      .get('/api/users/app-menu-layout')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.categories)).toBe(true);
    expect(response.body.data.updatedBy).toBeUndefined();
    expect(response.body.data.updatedAt).toBeUndefined();
  });

  it('khách (role user) gọi PUT /api/admin/menu-layout/app bị chặn 403', async () => {
    const user = await createUser({ role: 'user', username: 'guest_hacker' });
    const token = await loginAs(user);

    const response = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categories: [
          { id: 'custom', nameVi: 'Tự sắp', itemKeys: ['quick_send'] },
        ],
      });

    expect(response.status).toBe(403);
  });

  it('nhân viên (activeContext employee) gọi PUT /api/admin/menu-layout/app bị chặn 403', async () => {
    const owner = await createUser({ role: 'user', username: 'owner_emp_test' });
    const employee = await createUser({ role: 'user', username: 'employee_test' });

    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({ campaigns_view: true })]
    );

    const token = await loginAs(employee);

    const response = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id))
      .send({
        categories: [
          { id: 'custom', nameVi: 'Nhân viên sắp', itemKeys: ['quick_send'] },
        ],
      });

    expect(response.status).toBe(403);
  });

  it('DB chưa có cấu hình scope app_user vẫn trả categories rỗng để frontend dùng mặc định', async () => {
    const user = await createUser({ role: 'user', username: 'empty_app_scope_user' });
    const token = await loginAs(user);

    const response = await request(app)
      .get('/api/users/app-menu-layout')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { categories: [] },
    });
  });

  it('super admin lưu layout app với chuyên mục rỗng itemKeys: [] thành công và khách đọc ra đúng categories', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin_empty_cat' });
    const adminToken = await loginAs(admin);

    const user = await createUser({ role: 'user', username: 'user_read_empty_cat' });
    const userToken = await loginAs(user);

    const categories = [
      { id: 'marketing', nameVi: 'Marketing', nameEn: 'Marketing', itemKeys: ['quick_send'] },
      { id: 'empty_box', nameVi: 'Chuyên mục rỗng', nameEn: 'Empty Category', itemKeys: [] },
    ];

    const saveRes = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.categories).toEqual(categories);

    const fetchRes = await request(app)
      .get('/api/users/app-menu-layout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data.categories).toEqual(categories);
  });

  it('super admin PUT /api/admin/menu-layout/app với chuyên mục main nameVi "Mục chính (không tiêu đề)" → 200', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin_main_title_test' });
    const adminToken = await loginAs(admin);

    const categories = [
      {
        id: 'main',
        nameVi: 'Mục chính (không tiêu đề)',
        nameEn: 'Main (untitled)',
        itemKeys: ['ai_assistant', 'dashboard', 'affiliate_program'],
      },
      {
        id: 'campaigns',
        nameVi: 'Chiến dịch',
        nameEn: 'Campaigns',
        itemKeys: ['quick_send'],
      },
    ];

    const res = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories });

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual(categories);

    const dbRow = await db.query(
      `SELECT scope, categories FROM admin_menu_layouts WHERE scope = 'app_user'`
    );
    expect(dbRow.rows).toHaveLength(1);
    expect(dbRow.rows[0].categories).toEqual(categories);
  });
});
