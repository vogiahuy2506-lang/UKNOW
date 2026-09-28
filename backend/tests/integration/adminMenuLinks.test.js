import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

/**
 * PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28 — link ngoài (YouTube/link bất kỳ) trong menu khách /app.
 * Khuôn lấy từ adminMenu.test.js (login/employee context) — file riêng để không phình file gốc.
 */

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

const BASE_CATEGORIES = [
  { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant'] },
  { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: [] },
];

describe('Admin menu layout API — link ngoài (app scope)', () => {
  it('PUT có 1 link -> GET /admin/menu-layout/app và GET /users/app-menu-layout (khách thường + nhân viên) cùng trả link đó', async () => {
    const admin = await createUser({ role: 'admin', username: 'link_admin' });
    const adminToken = await loginAs(admin);

    const categories = [
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant'] },
      { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: ['link-huongdan'] },
    ];
    const links = [
      { key: 'link-huongdan', nameVi: 'Link hướng dẫn', nameEn: 'Guide link', url: 'https://youtu.be/abc', categoryId: 'guides' },
    ];

    const putRes = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories, links });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.links).toEqual(links);

    const adminGet = await request(app)
      .get('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminGet.body.data.links).toEqual(links);

    const owner = await createUser({ role: 'user', username: 'link_owner' });
    const ownerToken = await loginAs(owner);
    const ownerGet = await request(app)
      .get('/api/users/app-menu-layout')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.data.links).toEqual(links);

    const employee = await createUser({ role: 'user', username: 'link_employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({})]
    );
    const employeeToken = await loginAs(employee);
    const employeeGet = await request(app)
      .get('/api/users/app-menu-layout')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Owner-Context', String(owner.id));
    expect(employeeGet.status).toBe(200);
    expect(employeeGet.body.data.links).toEqual(links);

    const persisted = await db.query(
      `SELECT links FROM admin_menu_layouts WHERE scope = 'app_user'`
    );
    expect(persisted.rows[0].links).toEqual(links);
  });

  it('PUT không có trường links sau khi đã có 1 link -> link vẫn còn nguyên trong DB', async () => {
    const admin = await createUser({ role: 'admin', username: 'link_admin2' });
    const adminToken = await loginAs(admin);

    const categories = [
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant', 'link-a'] },
    ];
    const links = [
      { key: 'link-a', nameVi: 'A', nameEn: 'A', url: 'https://a.vn', categoryId: 'main' },
    ];
    const firstPut = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories, links });
    expect(firstPut.status).toBe(200);

    // PUT lại KHÔNG kèm trường `links` (client cũ) — chỉ đổi thứ tự itemKeys, giữ nguyên link-a.
    const secondPut = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categories: [
          { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-a', 'ai_assistant'] },
        ],
      });

    expect(secondPut.status).toBe(200);
    expect(secondPut.body.data.links).toEqual(links);

    const persisted = await db.query(
      `SELECT links FROM admin_menu_layouts WHERE scope = 'app_user'`
    );
    expect(persisted.rows[0].links).toEqual(links);
  });

  it('PUT links: [] và bỏ key khỏi itemKeys -> DB links = []', async () => {
    const admin = await createUser({ role: 'admin', username: 'link_admin3' });
    const adminToken = await loginAs(admin);

    const categories = [
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant', 'link-a'] },
    ];
    const links = [
      { key: 'link-a', nameVi: 'A', nameEn: 'A', url: 'https://a.vn', categoryId: 'main' },
    ];
    await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories, links });

    const clearRes = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categories: [
          { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant'] },
        ],
        links: [],
      });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.links).toEqual([]);

    const persisted = await db.query(
      `SELECT links FROM admin_menu_layouts WHERE scope = 'app_user'`
    );
    expect(persisted.rows[0].links).toEqual([]);
  });

  it('PUT link javascript: -> 400, dòng DB không đổi (updated_at giữ nguyên)', async () => {
    const admin = await createUser({ role: 'admin', username: 'link_admin4' });
    const adminToken = await loginAs(admin);

    const firstPut = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categories: BASE_CATEGORIES, links: [] });
    expect(firstPut.status).toBe(200);

    const before = await db.query(
      `SELECT updated_at FROM admin_menu_layouts WHERE scope = 'app_user'`
    );

    const badPut = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categories: [
          { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['ai_assistant', 'link-x'] },
          { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: [] },
        ],
        links: [
          { key: 'link-x', nameVi: 'X', url: 'javascript:alert(1)', categoryId: 'main' },
        ],
      });

    expect(badPut.status).toBe(400);
    expect(badPut.body.message).toContain('http:// hoặc https://');

    const after = await db.query(
      `SELECT updated_at FROM admin_menu_layouts WHERE scope = 'app_user'`
    );
    expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at);
  });

  it('khách (role user) gọi PUT /api/admin/menu-layout/app kèm links bị chặn 403', async () => {
    const user = await createUser({ role: 'user', username: 'link_hacker' });
    const token = await loginAs(user);

    const response = await request(app)
      .put('/api/admin/menu-layout/app')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categories: BASE_CATEGORIES,
        links: [{ key: 'link-a', nameVi: 'A', url: 'https://a.vn', categoryId: 'main' }],
      });

    expect(response.status).toBe(403);
  });
});
