/**
 * PLAN_GOM_MUC_NHE_2026-10-20 PR-4 — dọn lẻ (Postgres + Express thật).
 *
 *  4a. POST /api/uploads/temp không trả `tempPath` (đường dẫn tuyệt đối trên máy chủ).
 *  4c. Nhân viên có quyền chatbot_channels_manage thấy tài khoản TikTok của CHỦ (trước đây controller dùng req.user.id nên luôn rỗng);
 *      thiếu quyền → 403; nhân viên của chủ khác không thấy tài khoản của chủ này.
 *  (4b — get_all_friends `fixed` + rỗng không gọi Zalo — nằm ở unit campaignRunFriendsSelectionMode.spec.js; 4d chỉ xoá mã chết nên không cần ca riêng.)
 */
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

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

async function createEmployee(ownerId, permissions) {
  const employee = await createUser({ username: `gm4_emp_${rnd()}`.slice(0, 40) });
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employee.id, JSON.stringify(permissions)]
  );
  return employee;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-body-for-test')]);

describe('4a — POST /api/uploads/temp không lộ đường dẫn máy chủ', () => {
  it('phản hồi có tempId/originalName/size/contentType, KHÔNG có tempPath và không chứa đường dẫn tuyệt đối', async () => {
    const user = await createUser({ username: `gm4_up_${rnd()}`.slice(0, 40) });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/uploads/temp')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: 'anh.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ originalName: 'anh.png', contentType: 'image/png', size: PNG.length });
    expect(typeof res.body.data.tempId).toBe('string');
    expect(res.body.data).not.toHaveProperty('tempPath');
    expect(JSON.stringify(res.body)).not.toContain('temp_uploads');
  });
});

describe('4c — nhân viên dùng tài khoản TikTok của chủ', () => {
  async function insertTiktokAccount(ownerId, businessId) {
    const { rows } = await db.query(
      `INSERT INTO tiktok_business_accounts
         (id_user, business_id, display_name, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, region, role)
       VALUES ($1, $2, 'Shop TikTok', 'enc:v1:x', 'enc:v1:y', NOW() + INTERVAL '1 day', NOW() + INTERVAL '30 days', 'APAC', 'business_account')
       RETURNING id`,
      [ownerId, businessId]
    );
    return rows[0].id;
  }

  const list = (token, ownerContextId = null) =>
    request(app)
      .get('/api/settings/tiktok-business/accounts')
      .set({ Authorization: `Bearer ${token}`, ...(ownerContextId ? { 'X-Owner-Context': String(ownerContextId) } : {}) });

  it('chủ thấy tài khoản của mình; nhân viên có chatbot_channels_manage thấy CÙNG tài khoản của chủ; không lộ token', async () => {
    const owner = await createUser({ username: `gm4_own_${rnd()}`.slice(0, 40) });
    const accountId = await insertTiktokAccount(owner.id, `biz_${rnd()}`);
    const employee = await createEmployee(owner.id, { chatbot_channels_manage: true });

    const asOwner = await list(await loginAs(owner));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data.map((a) => String(a.id))).toEqual([String(accountId)]);

    const asEmployee = await list(await loginAs(employee), owner.id);
    expect(asEmployee.status).toBe(200);
    expect(asEmployee.body.data.map((a) => String(a.id))).toEqual([String(accountId)]);
    const raw = JSON.stringify(asEmployee.body);
    expect(raw).not.toContain('enc:v1:');
  });

  it('nhân viên thiếu quyền → 403; nhân viên của chủ KHÁC không thấy tài khoản của chủ này', async () => {
    const owner = await createUser({ username: `gm4_own_${rnd()}`.slice(0, 40) });
    const other = await createUser({ username: `gm4_oth_${rnd()}`.slice(0, 40) });
    await insertTiktokAccount(owner.id, `biz_${rnd()}`);
    const noPermission = await createEmployee(owner.id, { campaigns_view: true });
    const ofOther = await createEmployee(other.id, { chatbot_channels_manage: true });

    expect((await list(await loginAs(noPermission), owner.id)).status).toBe(403);

    const asOther = await list(await loginAs(ofOther), other.id);
    expect(asOther.status).toBe(200);
    expect(asOther.body.data).toEqual([]);
  });
});
