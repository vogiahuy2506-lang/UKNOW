/**
 * Lệnh giao 21/09/2026 (lịch chạy không được chết im lặng), PR-2 — Postgres THẬT.
 *
 *  - Việc 2.1: lịch BẬT trùng hệt bị chặn ở CẢ hai lớp (controller 409 + unique index bán phần migration 231);
 *    hai request cùng lúc không thể cùng thành công; lịch TẮT trùng vẫn được.
 *  - Việc 2.2: tạo/bật-tắt/sửa/xoá lịch để lại dòng audit_logs, entity_id = id_campaign.
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
  return res.body.data.accessToken;
}

// PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — bật lịch giờ đi qua preflight, đòi
// campaign phải có ít nhất 1 node gửi (mọi test ở đây đều bật lịch, không có ca nào cần campaign trống).
async function insertCampaign(ownerId, status = 'active') {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Nhắc lịch hội thảo 23/9', $2) RETURNING *`,
    [ownerId, status],
  );
  const campaign = rows[0];
  await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gửi email', '{}'::jsonb, 1)`,
    [campaign.id],
  );
  return campaign;
}

const payload = (campaignId, extra = {}) => ({
  campaignId,
  scheduleName: 'Nhắc lịch',
  scheduleType: 'daily',
  cronExpression: '0 9 * * *',
  ...extra,
});

const auditRows = async (action, campaignId) => (await db.query(
  `SELECT * FROM audit_logs WHERE action = $1 AND entity_id = $2 ORDER BY id`,
  [action, campaignId],
)).rows;

describe('lịch trùng hệt (Việc 2.1)', () => {
  it('lịch bật thứ hai y hệt (kịch bản #177/#178) → 409 SCHEDULE_DUPLICATE, chỉ còn 1 dòng trong DB', async () => {
    const user = await createUser({ email: 'dup-a@test.com', username: 'dup_a' });
    const token = await loginAs(user);
    const campaign = await insertCampaign(user.id);
    const post = () => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(payload(campaign.id));

    expect((await post()).status).toBe(201);
    const second = await post();
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SCHEDULE_DUPLICATE');
    expect(second.body.message).toContain('Chiến dịch đã có lịch chạy y hệt');
    expect((await db.query('SELECT count(*)::int AS n FROM campaign_schedules WHERE id_campaign = $1', [campaign.id])).rows[0].n).toBe(1);
  });

  it('khác kiểu / khác giờ / khác chiến dịch → không coi là trùng', async () => {
    const user = await createUser({ email: 'dup-b@test.com', username: 'dup_b' });
    const token = await loginAs(user);
    const c1 = await insertCampaign(user.id);
    const c2 = await insertCampaign(user.id);
    const post = (body) => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(body);

    expect((await post(payload(c1.id))).status).toBe(201);
    expect((await post(payload(c1.id, { cronExpression: '30 9 * * *' }))).status).toBe(201);
    expect((await post(payload(c1.id, { scheduleType: 'weekly', cronExpression: '0 9 * * 1' }))).status).toBe(201);
    expect((await post(payload(c2.id))).status).toBe(201);
  });

  it('hai request CÙNG LÚC: đúng một thành công, một bị 409 (không bao giờ 2 lịch bật y hệt, không 500)', async () => {
    const user = await createUser({ email: 'dup-c@test.com', username: 'dup_c' });
    const token = await loginAs(user);
    const campaign = await insertCampaign(user.id);
    const post = () => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(payload(campaign.id));

    const results = await Promise.all([post(), post()]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.code).toBe('SCHEDULE_DUPLICATE');
    expect((await db.query('SELECT count(*)::int AS n FROM campaign_schedules WHERE id_campaign = $1 AND enabled', [campaign.id])).rows[0].n).toBe(1);
  });

  it('unique index bán phần (migration 231): DB tự chặn 2 lịch BẬT y hệt, vẫn cho lịch TẮT trùng', async () => {
    const user = await createUser({ email: 'dup-d@test.com', username: 'dup_d' });
    const campaign = await insertCampaign(user.id);
    const insert = (enabled) => db.query(
      `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, schedule_name, schedule_type, cron_expression, enabled)
       VALUES ($1, $2, 'x', 'once', '30 07 21 9 *', $3)`,
      [campaign.id, user.id, enabled],
    );

    await insert(true);
    await expect(insert(true)).rejects.toMatchObject({ code: '23505', constraint: 'uq_campaign_schedules_enabled_dup' });
    await insert(false);
    await insert(false);
  });

  it('bật lại lịch tắt đã trùng lịch bật khác → 409; tắt lịch kia đi thì bật được', async () => {
    const user = await createUser({ email: 'dup-e@test.com', username: 'dup_e' });
    const token = await loginAs(user);
    const campaign = await insertCampaign(user.id);
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    const first = await auth(request(app).post('/api/campaign-schedules')).send(payload(campaign.id));
    const twin = await auth(request(app).post('/api/campaign-schedules')).send(payload(campaign.id, { enabled: false }));
    expect([first.status, twin.status]).toEqual([201, 201]);

    const blocked = await auth(request(app).patch(`/api/campaign-schedules/${twin.body.data.id}`)).send({ enabled: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SCHEDULE_DUPLICATE');

    await auth(request(app).patch(`/api/campaign-schedules/${first.body.data.id}`)).send({ enabled: false });
    expect((await auth(request(app).patch(`/api/campaign-schedules/${twin.body.data.id}`)).send({ enabled: true })).status).toBe(200);
  });
});

describe('nhật ký thao tác lịch (Việc 2.2)', () => {
  it('tạo → bật/tắt → sửa → xoá: mỗi bước một dòng audit_logs, entity_id = id chiến dịch, details có scheduleId', async () => {
    const user = await createUser({ email: 'aud-a@test.com', username: 'aud_a' });
    const token = await loginAs(user);
    const campaign = await insertCampaign(user.id);
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    const created = await auth(request(app).post('/api/campaign-schedules')).send(payload(campaign.id));
    const scheduleId = created.body.data.id;
    await auth(request(app).patch(`/api/campaign-schedules/${scheduleId}`)).send({ enabled: false });
    await auth(request(app).patch(`/api/campaign-schedules/${scheduleId}`)).send({ scheduleName: 'Tên mới' });
    await auth(request(app).delete(`/api/campaign-schedules/${scheduleId}`));

    const [createdLog] = await auditRows('CAMPAIGN_SCHEDULE_CREATED', campaign.id);
    expect(createdLog).toMatchObject({ category: 'workspace', entity_type: 'campaign', id_user: String(user.id), owner_id: String(user.id) });
    expect(createdLog.details).toMatchObject({ scheduleId, scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true });

    const [toggledLog] = await auditRows('CAMPAIGN_SCHEDULE_TOGGLED', campaign.id);
    expect(toggledLog.details).toEqual({ scheduleId, enabled: false, previousEnabled: true });

    const [updatedLog] = await auditRows('CAMPAIGN_SCHEDULE_UPDATED', campaign.id);
    expect(updatedLog.details).toMatchObject({ scheduleId, changedFields: ['scheduleName'] });

    const [deletedLog] = await auditRows('CAMPAIGN_SCHEDULE_DELETED', campaign.id);
    expect(deletedLog.details).toMatchObject({ scheduleId, scheduleType: 'daily', enabled: false });
  });

  it('thao tác bị chặn (409 chiến dịch nháp) không để lại dòng nhật ký', async () => {
    const user = await createUser({ email: 'aud-b@test.com', username: 'aud_b' });
    const token = await loginAs(user);
    const campaign = await insertCampaign(user.id, 'draft');

    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(payload(campaign.id));
    expect(res.status).toBe(409);
    expect(await auditRows('CAMPAIGN_SCHEDULE_CREATED', campaign.id)).toHaveLength(0);
  });
});
