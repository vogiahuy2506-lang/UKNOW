/**
 * Integration tests cho `/api/zalo-templates`.
 *
 * Phạm vi:
 *   - GET / (list + filter category/search + pagination + isolation)
 *   - GET /:id (tenant isolation, activeUsage payload)
 *   - POST / (validator, lưu row đầy đủ)
 *   - PUT /:id (partial update, body_text rule, isolation)
 *   - DELETE /:id (isolation)
 *   - Resource limit `max_zalo_templates` từ plan
 *
 * KHÔNG cover:
 *   - tempAttachments/file upload (đi qua uploadController → cần mock S3 + multer).
 *   - active campaign usage chi tiết (chỉ assert shape `activeUsage` cơ bản).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import {
  truncateAll,
  createUser,
  createPlan,
  assignPlanToUser,
} from './helpers/db.js';

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
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/**
 * Insert template trực tiếp để arrange nhanh.
 * @param {object} input
 */
async function insertTemplate({
  ownerId,
  templateName = `Tpl ${Date.now()}`,
  templateCode = null,
  subject = 'Subject',
  bodyText = 'Body text mặc định',
  category = null,
  isActive = true,
  createdAt = null,
}) {
  const params = [ownerId, templateName, templateCode, subject, bodyText, category, isActive];
  if (createdAt) {
    params.push(createdAt);
    const { rows } = await db.query(
      `INSERT INTO zalo_templates
         (id_user, template_name, template_code, subject, body_text, category, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      params
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO zalo_templates
       (id_user, template_name, template_code, subject, body_text, category, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    params
  );
  return rows[0];
}

describe('Authorization — /api/zalo-templates', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/zalo-templates');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/zalo-templates', () => {
  it('user thường chỉ thấy template của mình', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    await insertTemplate({ ownerId: a.id, templateName: 'A1' });
    await insertTemplate({ ownerId: a.id, templateName: 'A2' });
    await insertTemplate({ ownerId: b.id, templateName: 'B1' });

    const t = await loginAs(a);
    const res = await request(app).get('/api/zalo-templates').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('filter category=marketing chỉ trả template có category đó', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    await insertTemplate({ ownerId: owner.id, templateName: 'm1', category: 'marketing' });
    await insertTemplate({ ownerId: owner.id, templateName: 'm2', category: 'marketing' });
    await insertTemplate({ ownerId: owner.id, templateName: 's1', category: 'support' });

    const t = await loginAs(owner);
    const res = await request(app)
      .get('/api/zalo-templates?category=marketing')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.templateName).sort()).toEqual(['m1', 'm2']);
  });

  it('search ILIKE template_name HOẶC subject', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    await insertTemplate({ ownerId: owner.id, templateName: 'Welcome Email', subject: 'Welcome!' });
    await insertTemplate({ ownerId: owner.id, templateName: 'Receipt', subject: 'Your welcome reward' });
    await insertTemplate({ ownerId: owner.id, templateName: 'Newsletter', subject: 'Update' });

    const t = await loginAs(owner);
    const res = await request(app)
      .get('/api/zalo-templates?search=welcome')
      .set('Authorization', `Bearer ${t}`);

    const names = res.body.data.items.map((x) => x.templateName).sort();
    expect(names).toEqual(['Receipt', 'Welcome Email']);
  });

  it('pagination — limit=2 + page=2 trả về đúng số item', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    for (let i = 0; i < 5; i += 1) {
      await insertTemplate({ ownerId: owner.id, templateName: `T${i}` });
    }

    const t = await loginAs(owner);
    const p2 = await request(app)
      .get('/api/zalo-templates?limit=2&page=2')
      .set('Authorization', `Bearer ${t}`);

    expect(p2.body.data.items).toHaveLength(2);
    expect(p2.body.data.pagination.total).toBe(5);
    expect(p2.body.data.pagination.totalPages).toBe(3);
  });

  it('sort created_at DESC (mới nhất lên đầu)', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    await insertTemplate({
      ownerId: owner.id,
      templateName: 'old',
      createdAt: new Date('2024-01-01'),
    });
    await insertTemplate({
      ownerId: owner.id,
      templateName: 'new',
      createdAt: new Date('2025-01-01'),
    });

    const t = await loginAs(owner);
    const res = await request(app).get('/api/zalo-templates').set('Authorization', `Bearer ${t}`);
    expect(res.body.data.items[0].templateName).toBe('new');
    expect(res.body.data.items[1].templateName).toBe('old');
  });

  it('admin (role=admin) thấy template của tất cả owner', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    await insertTemplate({ ownerId: a.id, templateName: 'tplA' });
    await insertTemplate({ ownerId: b.id, templateName: 'tplB' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/zalo-templates').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.templateName).sort()).toEqual(['tplA', 'tplB']);
  });
});

describe('GET /api/zalo-templates/:id', () => {
  it('lấy detail đúng template + có activeUsage shape', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({
      ownerId: owner.id,
      templateName: 'Greet',
      bodyText: 'Hello',
    });

    const t = await loginAs(owner);
    const res = await request(app)
      .get(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.templateName).toBe('Greet');
    expect(res.body.data.bodyText).toBe('Hello');
    expect(res.body.data.activeUsage).toMatchObject({
      isUsedInActiveCampaign: false,
      activeCampaignCount: 0,
      activeCampaigns: [],
    });
  });

  it('user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const tpl = await insertTemplate({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .get(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(404);
  });

  it('id không tồn tại → 404', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .get('/api/zalo-templates/999999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/zalo-templates', () => {
  it('tạo mới thành công + row trong DB đầy đủ', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);

    const res = await request(app)
      .post('/api/zalo-templates')
      .set('Authorization', `Bearer ${t}`)
      .send({
        templateName: 'Birthday',
        templateCode: 'BIRTH',
        subject: 'Happy birthday',
        bodyText: 'Chúc bạn sinh nhật vui vẻ',
        category: 'lifecycle',
        variables: [{ key: 'name', label: 'Tên' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      templateName: 'Birthday',
      subject: 'Happy birthday',
      bodyText: 'Chúc bạn sinh nhật vui vẻ',
      category: 'lifecycle',
    });
    expect(res.body.data.variables).toEqual([{ key: 'name', label: 'Tên' }]);

    const { rows } = await db.query('SELECT * FROM zalo_templates WHERE id = $1', [res.body.data.id]);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
  });

  it('thiếu templateName → 400 (validator)', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .post('/api/zalo-templates')
      .set('Authorization', `Bearer ${t}`)
      .send({ subject: 'x', bodyText: 'y' });
    expect(res.status).toBe(400);
  });

  it('thiếu subject → 201 (vì subject là optional)', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .post('/api/zalo-templates')
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: 'x', bodyText: 'y' });
    expect(res.status).toBe(201);
  });

  it('bodyText rỗng → 400 (custom validator)', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .post('/api/zalo-templates')
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: 'x', subject: 'y', bodyText: '   ' });
    expect(res.status).toBe(400);
  });

  it('vượt max_zalo_templates trong plan → 400 với message giới hạn', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const plan = await createPlan({ code: 'p' });
    await assignPlanToUser(owner.id, plan.id);
    // Set max_zalo_templates trên user (override plan)
    await db.query(`UPDATE users SET max_zalo_templates = 1 WHERE id = $1`, [owner.id]);
    // Đã có 1 template → tạo thêm phải bị chặn
    await insertTemplate({ ownerId: owner.id });

    const t = await loginAs(owner);
    const res = await request(app)
      .post('/api/zalo-templates')
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: 'x', subject: 'y', bodyText: 'z' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/giới hạn|tối đa|đã đạt/i);
  });
});

describe('PUT /api/zalo-templates/:id', () => {
  it('partial update — chỉ field nào gửi mới đổi', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({
      ownerId: owner.id,
      templateName: 'Original',
      subject: 'Old subject',
      bodyText: 'Old body',
    });

    const t = await loginAs(owner);
    const res = await request(app)
      .put(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.templateName).toBe('Updated');
    // subject + bodyText giữ nguyên
    expect(res.body.data.subject).toBe('Old subject');
    expect(res.body.data.bodyText).toBe('Old body');
  });

  it('bodyText rỗng (chỉ space) khi gửi → DB ghi null', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({ ownerId: owner.id, bodyText: 'Old' });

    const t = await loginAs(owner);
    const res = await request(app)
      .put(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ bodyText: '   ' });

    expect(res.status).toBe(200);

    const { rows } = await db.query('SELECT body_text FROM zalo_templates WHERE id = $1', [tpl.id]);
    expect(rows[0].body_text).toBeNull();
  });

  it('user khác không update được → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const tpl = await insertTemplate({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .put(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: 'Hijack' });

    expect(res.status).toBe(404);
  });

  it('templateName rỗng → 400 (validator optional + notEmpty)', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({ ownerId: owner.id });
    const t = await loginAs(owner);

    const res = await request(app)
      .put(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ templateName: '   ' });

    expect(res.status).toBe(400);
  });

  it('toggle isActive', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({ ownerId: owner.id, isActive: true });
    const t = await loginAs(owner);

    const res = await request(app)
      .put(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

describe('DELETE /api/zalo-templates/:id', () => {
  it('owner xóa được → 200, biến khỏi DB', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const tpl = await insertTemplate({ ownerId: owner.id });
    const t = await loginAs(owner);

    const res = await request(app)
      .delete(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT id FROM zalo_templates WHERE id = $1', [tpl.id]);
    expect(rows).toHaveLength(0);
  });

  it('user khác → 404, template vẫn còn', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const tpl = await insertTemplate({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .delete(`/api/zalo-templates/${tpl.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT id FROM zalo_templates WHERE id = $1', [tpl.id]);
    expect(rows).toHaveLength(1);
  });

  it('id không tồn tại → 404', async () => {
    const owner = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .delete('/api/zalo-templates/999999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});
