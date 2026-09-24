import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { invalidateCatalogCache } from '../../src/services/ai/aiModelCatalog.service.js';

let app;
let adminUser;
let adminToken;

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM ai_models');
  invalidateCatalogCache();

  adminUser = await createUser({ role: 'admin', username: `admin_${Date.now()}` });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: adminUser.username, password: adminUser.plainPassword || 'Passw0rd!' });
  adminToken = loginRes.body?.data?.accessToken;

  // Dựng 3 model mẫu
  await db.query(`
    INSERT INTO ai_models (model_id, display_name, is_enabled, is_fallback, supports_generate_content, source)
    VALUES
      ('gemini-test-sys', 'System Model', TRUE, FALSE, TRUE, 'google'),
      ('gemini-test-fb1', 'Fallback 1', FALSE, FALSE, TRUE, 'google'),
      ('gemini-test-fb2', 'Fallback 2', FALSE, FALSE, TRUE, 'google')
  `);
});

describe('Admin AI Models — Fallback Model Integration (PR-1 Mục 4.2)', () => {
  it('PUT /api/admin/ai-models/fallback-model bật đúng một model dự phòng', async () => {
    const res = await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ fallbackModel: 'gemini-test-fb1' });

    const dbRes = await db.query('SELECT model_id, is_fallback FROM ai_models WHERE is_fallback = TRUE');
    expect(dbRes.rows).toHaveLength(1);
    expect(dbRes.rows[0].model_id).toBe('gemini-test-fb1');
  });

  it('chọn model dự phòng khác thì model cũ tự về FALSE', async () => {
    await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb1' });

    const res = await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb2' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fallbackModel: 'gemini-test-fb2' });

    const dbRes = await db.query('SELECT model_id FROM ai_models WHERE is_fallback = TRUE');
    expect(dbRes.rows).toHaveLength(1);
    expect(dbRes.rows[0].model_id).toBe('gemini-test-fb2');
  });

  it('gửi modelId null thì không còn hàng nào là fallback', async () => {
    await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb1' });

    const res = await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fallbackModel: null });

    const dbRes = await db.query('SELECT model_id FROM ai_models WHERE is_fallback = TRUE');
    expect(dbRes.rows).toHaveLength(0);
  });

  it('từ chối 400 nếu chọn model hệ thống làm model dự phòng', async () => {
    const res = await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-sys' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('chọn model dự phòng làm model hệ thống thì model đó tự mất cờ is_fallback', async () => {
    // 1. Đặt fb1 làm fallback
    await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb1' });

    // 2. Chuyển fb1 thành model hệ thống
    const res = await request(app)
      .put('/api/admin/ai-models/system-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb1' });

    expect(res.status).toBe(200);

    const dbRes = await db.query('SELECT model_id, is_enabled, is_fallback FROM ai_models WHERE model_id = $1', ['gemini-test-fb1']);
    expect(dbRes.rows[0].is_enabled).toBe(true);
    expect(dbRes.rows[0].is_fallback).toBe(false);

    // Không còn hàng nào là fallback
    const fbRows = await db.query('SELECT model_id FROM ai_models WHERE is_fallback = TRUE');
    expect(fbRows.rows).toHaveLength(0);
  });

  it('GET /api/admin/ai-models trả về danh sách kèm thuộc tính isFallback', async () => {
    await request(app)
      .put('/api/admin/ai-models/fallback-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ modelId: 'gemini-test-fb2' });

    const res = await request(app)
      .get('/api/admin/ai-models')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const fb2 = res.body.data.models.find((m) => m.modelId === 'gemini-test-fb2');
    expect(fb2).toBeDefined();
    expect(fb2.isFallback).toBe(true);

    const sys = res.body.data.models.find((m) => m.modelId === 'gemini-test-sys');
    expect(sys).toBeDefined();
    expect(sys.isFallback).toBe(false);
  });
});
