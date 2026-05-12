/**
 * Integration tests cho `/api/zalo/accounts` — CRUD tài khoản Zalo (subset).
 *
 * Phạm vi:
 *   - GET /accounts: list của owner, isolation giữa các owner, admin thấy hết.
 *   - DELETE /accounts/:id: xoá theo owner; nếu xoá default thì account cũ
 *     nhất còn lại tự lên default.
 *   - PATCH /accounts/:id/default: set default + reset cờ default ở các
 *     account cùng owner.
 *
 * KHÔNG cover (cần mock zca-js — để dành cho phiên khác):
 *   - login-qr, restore-session, preview send-personal/send-group, ...
 *
 * Vì controller insert qua zca-js login, test này tạo account trực tiếp
 * vào DB để skip flow đăng nhập.
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
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/**
 * Tạo account zalo trực tiếp trong DB.
 * @param {object} input
 * @returns {Promise<object>}
 */
async function createZaloAccount({
  ownerId,
  displayName = `Zalo ${Date.now()}`,
  zaloUserId = null,
  zaloName = null,
  status = 'disconnected',
  isActive = true,
  isDefault = false,
  cookieText = null,
  createdAt = null,
}) {
  const baseParams = [ownerId, displayName, zaloUserId, zaloName, status, isActive, isDefault, cookieText];
  if (createdAt) {
    baseParams.push(createdAt);
    const { rows } = await db.query(
      `INSERT INTO zalo_settings
         (id_user, display_name, zalo_user_id, zalo_name, status, is_active, is_default, cookie_text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      baseParams
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO zalo_settings
       (id_user, display_name, zalo_user_id, zalo_name, status, is_active, is_default, cookie_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    baseParams
  );
  return rows[0];
}

describe('Authorization — /api/zalo/accounts', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/zalo/accounts');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/zalo/accounts — list', () => {
  it('owner chỉ thấy account của chính mình', async () => {
    const ownerA = await createUser({ role: 'user', username: 'owner_a' });
    const ownerB = await createUser({ role: 'user', username: 'owner_b' });
    await createZaloAccount({ ownerId: ownerA.id, displayName: 'A1' });
    await createZaloAccount({ ownerId: ownerA.id, displayName: 'A2' });
    await createZaloAccount({ ownerId: ownerB.id, displayName: 'B1' });

    const t = await loginAs(ownerA);
    const res = await request(app)
      .get('/api/zalo/accounts')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((x) => x.displayName).sort()).toEqual(['A1', 'A2']);
  });

  it('sort: is_default DESC, sau đó created_at DESC', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const old = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'oldest',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    const newer = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'newer',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    const defaultOne = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'default_one',
      isDefault: true,
      createdAt: new Date('2024-06-01T00:00:00Z'),
    });

    const t = await loginAs(owner);
    const res = await request(app)
      .get('/api/zalo/accounts')
      .set('Authorization', `Bearer ${t}`);

    const names = res.body.data.items.map((x) => x.displayName);
    // default_one ở đầu (vì isDefault), rồi newer rồi old (DESC created)
    expect(names[0]).toBe('default_one');
    expect(names[1]).toBe('newer');
    expect(names[2]).toBe('oldest');
    expect(old).toBeDefined();
    expect(newer).toBeDefined();
    expect(defaultOne).toBeDefined();
  });

  it('mapRow: phơi đủ các field UI cần', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    await createZaloAccount({
      ownerId: owner.id,
      displayName: 'Acc 1',
      zaloUserId: '999',
      zaloName: 'Zalo Real Name',
      isDefault: true,
      status: 'connected',
    });

    const t = await loginAs(owner);
    const res = await request(app)
      .get('/api/zalo/accounts')
      .set('Authorization', `Bearer ${t}`);

    const acc = res.body.data.items[0];
    expect(acc).toMatchObject({
      displayName: 'Acc 1',
      zaloUserId: '999',
      zaloName: 'Zalo Real Name',
      isDefault: true,
      isActive: true,
    });
    expect(acc.createdBy).toEqual({ name: expect.any(String) });
  });

  it('admin (role=admin) thấy account của tất cả owner', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const ownerA = await createUser({ role: 'user', username: 'oa' });
    const ownerB = await createUser({ role: 'user', username: 'ob' });
    await createZaloAccount({ ownerId: ownerA.id, displayName: 'A1' });
    await createZaloAccount({ ownerId: ownerB.id, displayName: 'B1' });

    const t = await loginAs(admin);
    const res = await request(app)
      .get('/api/zalo/accounts')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.displayName).sort()).toEqual(['A1', 'B1']);
  });
});

describe('DELETE /api/zalo/accounts/:id', () => {
  it('xóa account của owner → 200, account biến khỏi DB', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const acc = await createZaloAccount({ ownerId: owner.id, displayName: 'X' });

    const t = await loginAs(owner);
    const res = await request(app)
      .delete(`/api/zalo/accounts/${acc.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT id FROM zalo_settings WHERE id = $1', [acc.id]);
    expect(rows).toHaveLength(0);
  });

  it('owner KHÔNG xóa được account của owner khác → 404', async () => {
    const ownerA = await createUser({ role: 'user', username: 'oa' });
    const ownerB = await createUser({ role: 'user', username: 'ob' });
    const accB = await createZaloAccount({ ownerId: ownerB.id, displayName: 'Bonly' });

    const t = await loginAs(ownerA);
    const res = await request(app)
      .delete(`/api/zalo/accounts/${accB.id}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(404);

    const { rows } = await db.query('SELECT id FROM zalo_settings WHERE id = $1', [accB.id]);
    expect(rows).toHaveLength(1);
  });

  it('id không tồn tại → 404', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .delete('/api/zalo/accounts/999999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('id không phải số → 400 (validator)', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .delete('/api/zalo/accounts/abc')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(400);
  });

  it('xóa account default → account oldest còn lại tự lên default', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const oldOne = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'old',
      isDefault: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    const middle = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'middle',
      isDefault: false,
      createdAt: new Date('2024-06-01T00:00:00Z'),
    });
    const currentDefault = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'cur_default',
      isDefault: true,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });

    const t = await loginAs(owner);
    const res = await request(app)
      .delete(`/api/zalo/accounts/${currentDefault.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      'SELECT id, is_default FROM zalo_settings WHERE id_user = $1 ORDER BY created_at ASC',
      [owner.id]
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].id)).toBe(Number(oldOne.id));
    expect(rows[0].is_default).toBe(true);
    expect(Number(rows[1].id)).toBe(Number(middle.id));
    expect(rows[1].is_default).toBe(false);
  });

  it('xóa account KHÔNG default → các account còn lại giữ nguyên cờ', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const keep = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'keep',
      isDefault: true,
    });
    const drop = await createZaloAccount({
      ownerId: owner.id,
      displayName: 'drop',
      isDefault: false,
    });

    const t = await loginAs(owner);
    await request(app)
      .delete(`/api/zalo/accounts/${drop.id}`)
      .set('Authorization', `Bearer ${t}`);

    const { rows } = await db.query(
      'SELECT id, is_default FROM zalo_settings WHERE id_user = $1',
      [owner.id]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id)).toBe(Number(keep.id));
    expect(rows[0].is_default).toBe(true);
  });
});

describe('PATCH /api/zalo/accounts/:id/default', () => {
  it('set default mới + reset cờ default của account khác', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const a = await createZaloAccount({ ownerId: owner.id, displayName: 'A', isDefault: true });
    const b = await createZaloAccount({ ownerId: owner.id, displayName: 'B', isDefault: false });

    const t = await loginAs(owner);
    const res = await request(app)
      .patch(`/api/zalo/accounts/${b.id}/default`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);

    const { rows } = await db.query(
      'SELECT id, is_default FROM zalo_settings WHERE id_user = $1 ORDER BY id ASC',
      [owner.id]
    );
    const map = Object.fromEntries(rows.map((r) => [Number(r.id), r.is_default]));
    expect(map[Number(a.id)]).toBe(false);
    expect(map[Number(b.id)]).toBe(true);
  });

  it('owner không set được default cho account của owner khác → 404', async () => {
    const ownerA = await createUser({ role: 'user', username: 'oa' });
    const ownerB = await createUser({ role: 'user', username: 'ob' });
    const accB = await createZaloAccount({ ownerId: ownerB.id });

    const t = await loginAs(ownerA);
    const res = await request(app)
      .patch(`/api/zalo/accounts/${accB.id}/default`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(404);
  });

  it('id không tồn tại → 404', async () => {
    const owner = await createUser({ role: 'user', username: 'owner1' });
    const t = await loginAs(owner);
    const res = await request(app)
      .patch('/api/zalo/accounts/999999/default')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('không ảnh hưởng default của owner khác', async () => {
    const ownerA = await createUser({ role: 'user', username: 'oa' });
    const ownerB = await createUser({ role: 'user', username: 'ob' });
    const a1 = await createZaloAccount({ ownerId: ownerA.id, displayName: 'A1', isDefault: true });
    const a2 = await createZaloAccount({ ownerId: ownerA.id, displayName: 'A2' });
    const b1 = await createZaloAccount({ ownerId: ownerB.id, displayName: 'B1', isDefault: true });

    const t = await loginAs(ownerA);
    await request(app)
      .patch(`/api/zalo/accounts/${a2.id}/default`)
      .set('Authorization', `Bearer ${t}`);

    const { rows } = await db.query(
      'SELECT id, is_default FROM zalo_settings ORDER BY id ASC'
    );
    const map = Object.fromEntries(rows.map((r) => [Number(r.id), r.is_default]));
    expect(map[Number(a1.id)]).toBe(false);
    expect(map[Number(a2.id)]).toBe(true);
    // Owner B's default vẫn không đổi
    expect(map[Number(b1.id)]).toBe(true);
  });
});
