/**
 * Integration tests cho `/api/campaign-schedules`.
 *
 * Phạm vi cover:
 *   - Authorization (token).
 *   - GET /: list của owner (filter theo id_campaign chủ sở hữu) + admin global view.
 *   - GET /:id: detail kèm `last_run_status` từ LATERAL join campaign_runs.
 *   - POST /: validators (campaignId, scheduleName, scheduleType enum, cronExpression),
 *             404 khi campaign không tồn tại / không thuộc owner,
 *             409 khi campaign đang có run = 'running'.
 *   - PATCH /:id: partial COALESCE, chặn (409) khi enabled=TRUE và campaign đang running,
 *                 chặn (409) khi enable lại lịch `once` đã hoàn thành.
 *   - DELETE /:id: owner xoá được, không phải owner → 404, admin xoá chéo.
 *
 * KHÔNG cover:
 *   - Side effect cron registry (`requestCampaignScheduleRefresh` chạy
 *     trong `finally` và lỗi đã được nuốt → không ảnh hưởng response).
 *   - Logic chạy đến hạn (`triggerCampaignSchedule`) — phụ thuộc executor.
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

async function insertCampaign({ ownerId, status = 'active', campaignName = 'C' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [ownerId, campaignName, status]
  );
  return rows[0];
}

async function insertSchedule({
  campaignId,
  scheduleName = 'Sched',
  scheduleType = 'daily',
  cronExpression = '0 9 * * *',
  enabled = true,
  runCount = 0,
  lastRunAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled, run_count, last_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [campaignId, scheduleName, scheduleType, cronExpression, enabled, runCount, lastRunAt]
  );
  return rows[0];
}

async function insertRun({ campaignId, scheduleId = null, status = 'running' }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, id_schedule, status) VALUES ($1, $2, $3) RETURNING *`,
    [campaignId, scheduleId, status]
  );
  return rows[0];
}

// ===========================================================================
// AUTHORIZATION
// ===========================================================================

describe('Authorization — /api/campaign-schedules', () => {
  it('không token → 401', async () => {
    const responses = await Promise.all([
      request(app).get('/api/campaign-schedules'),
      request(app).get('/api/campaign-schedules/1'),
      request(app).post('/api/campaign-schedules').send({}),
      request(app).patch('/api/campaign-schedules/1').send({}),
      request(app).delete('/api/campaign-schedules/1'),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });
});

// ===========================================================================
// GET /
// ===========================================================================

describe('GET /api/campaign-schedules', () => {
  it('owner chỉ thấy schedule của campaign mình', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const ca = await insertCampaign({ ownerId: a.id, campaignName: 'CA' });
    const cb = await insertCampaign({ ownerId: b.id, campaignName: 'CB' });
    await insertSchedule({ campaignId: ca.id, scheduleName: 'A1' });
    await insertSchedule({ campaignId: cb.id, scheduleName: 'B1' });

    const t = await loginAs(a);
    const res = await request(app).get('/api/campaign-schedules').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((x) => x.scheduleName)).toEqual(['A1']);
  });

  it('admin thấy hết', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    await insertSchedule({ campaignId: c.id, scheduleName: 'X' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/campaign-schedules').set('Authorization', `Bearer ${t}`);
    expect(res.body.data).toHaveLength(1);
  });

  it('mỗi schedule kèm campaignName + lastRunStatus từ campaign_runs', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'Welcome flow' });
    const s = await insertSchedule({ campaignId: c.id });
    await insertRun({ campaignId: c.id, scheduleId: s.id, status: 'completed' });
    await insertRun({ campaignId: c.id, scheduleId: s.id, status: 'failed' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/campaign-schedules').set('Authorization', `Bearer ${t}`);
    const item = res.body.data[0];
    expect(item.campaignName).toBe('Welcome flow');
    // LATERAL ORDER BY started_at DESC, id DESC → run gần nhất là 'failed'
    expect(item.lastRunStatus).toBe('failed');
  });

  it('lastRunStatus = null khi chưa có run nào', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    await insertSchedule({ campaignId: c.id });

    const t = await loginAs(o);
    const res = await request(app).get('/api/campaign-schedules').set('Authorization', `Bearer ${t}`);
    expect(res.body.data[0].lastRunStatus).toBeNull();
  });
});

// ===========================================================================
// GET /:id
// ===========================================================================

describe('GET /api/campaign-schedules/:id', () => {
  it('trả về schedule kèm campaignName + lastRunStatus', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'X' });
    const s = await insertSchedule({ campaignId: c.id, scheduleName: 'S1' });
    await insertRun({ campaignId: c.id, scheduleId: s.id, status: 'completed' });

    const t = await loginAs(o);
    const res = await request(app)
      .get(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scheduleName: 'S1', campaignName: 'X' });
    expect(res.body.data.lastRunStatus).toBe('completed');
  });

  it('schedule của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(b);
    const res = await request(app)
      .get(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('id không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaign-schedules/9999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('admin xem được schedule của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id, scheduleName: 'other' });

    const t = await loginAs(admin);
    const res = await request(app)
      .get(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scheduleName).toBe('other');
  });
});

// ===========================================================================
// POST /
// ===========================================================================

describe('POST /api/campaign-schedules', () => {
  it('thiếu campaignId/scheduleName/scheduleType/cronExpression → 400', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('scheduleType ngoài enum → 400', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'X',
        scheduleType: 'yearly',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(400);
  });

  it('campaign không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: 9999,
        scheduleName: 'X',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(404);
  });

  it('campaign không thuộc user → 404 (không leak)', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const t = await loginAs(b);

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'X',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(404);
  });

  it('campaign đang có run = running → 409', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'X',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(409);
  });

  it('tạo thành công → 201 + row trong DB + enabled default TRUE', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'Daily morning',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      scheduleName: 'Daily morning',
      scheduleType: 'daily',
      enabled: true,
    });

    const { rows } = await db.query(
      'SELECT id_campaign, schedule_name, enabled FROM campaign_schedules WHERE id = $1',
      [res.body.data.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    expect(String(rows[0].id_campaign)).toBe(String(c.id));
  });

  it('enabled=false được tôn trọng', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'Off',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
        enabled: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.enabled).toBe(false);
  });
});

// ===========================================================================
// PATCH /:id
// ===========================================================================

describe('PATCH /api/campaign-schedules/:id', () => {
  it('partial update — chỉ field gửi mới đổi', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({
      campaignId: c.id,
      scheduleName: 'orig',
      cronExpression: '0 9 * * *',
    });

    const t = await loginAs(o);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ scheduleName: 'renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.scheduleName).toBe('renamed');

    const { rows } = await db.query('SELECT cron_expression FROM campaign_schedules WHERE id = $1', [s.id]);
    expect(rows[0].cron_expression).toBe('0 9 * * *');
  });

  it('schedule của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(b);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ scheduleName: 'hijack' });
    expect(res.status).toBe(404);
  });

  it('chặn enable lại lịch `once` đã hoàn thành (runCount > 0) → 409', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({
      campaignId: c.id,
      scheduleType: 'once',
      cronExpression: '0 9 1 1 *',
      enabled: false,
      runCount: 1,
    });

    const t = await loginAs(o);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ enabled: true });
    expect(res.status).toBe(409);
  });

  it('chặn enable lại lịch `once` đã có last_run_at → 409', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({
      campaignId: c.id,
      scheduleType: 'once',
      cronExpression: '0 9 1 1 *',
      enabled: false,
      lastRunAt: new Date('2025-01-01'),
    });
    const t = await loginAs(o);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ enabled: true });
    expect(res.status).toBe(409);
  });

  it('chặn enable khi campaign đang có run running → 409', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id, enabled: false });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ enabled: true });
    expect(res.status).toBe(409);
  });

  it('disable (enabled=false) KHÔNG bị chặn dù campaign đang running', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id, enabled: true });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });

  it('admin patch được schedule của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ scheduleName: 'by-admin' });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// DELETE /:id
// ===========================================================================

describe('DELETE /api/campaign-schedules/:id', () => {
  it('owner xóa được', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(o);
    const res = await request(app)
      .delete(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);

    const { rows } = await db.query('SELECT id FROM campaign_schedules WHERE id = $1', [s.id]);
    expect(rows).toHaveLength(0);
  });

  it('schedule của user khác → 404 + DB không đổi', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(b);
    const res = await request(app)
      .delete(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);

    const { rows } = await db.query('SELECT id FROM campaign_schedules WHERE id = $1', [s.id]);
    expect(rows).toHaveLength(1);
  });

  it('admin xóa được schedule của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s = await insertSchedule({ campaignId: c.id });

    const t = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
