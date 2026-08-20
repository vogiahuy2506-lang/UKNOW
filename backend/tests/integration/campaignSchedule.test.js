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

async function addCampaignMembership(ownerId, employeeId) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [
      ownerId,
      employeeId,
      JSON.stringify({
        campaigns_view: true,
        campaigns_create: true,
        campaigns_run: true,
      }),
    ]
  );
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

describe('Campaign schedule employee workspace ownership', () => {
  it('list/create scope theo owner, persist owner + actor và chặn schedule tenant khác', async () => {
    const ownerA = await createUser({ role: 'user', username: 'schedule_owner_a' });
    const ownerB = await createUser({ role: 'user', username: 'schedule_owner_b' });
    const employee = await createUser({ role: 'user', username: 'schedule_employee' });
    await addCampaignMembership(ownerA.id, employee.id);

    const campaignA = await insertCampaign({ ownerId: ownerA.id, campaignName: 'Campaign A' });
    const campaignB = await insertCampaign({ ownerId: ownerB.id, campaignName: 'Campaign B' });
    await insertSchedule({ campaignId: campaignA.id, scheduleName: 'Schedule A' });
    const scheduleB = await insertSchedule({ campaignId: campaignB.id, scheduleName: 'Schedule B' });

    const token = await loginAs(employee);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Owner-Context': String(ownerA.id),
    };
    const listRes = await request(app).get('/api/campaign-schedules').set(headers);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.map((item) => item.scheduleName)).toEqual(['Schedule A']);

    const createRes = await request(app)
      .post('/api/campaign-schedules')
      .set(headers)
      .send({
        campaignId: campaignA.id,
        scheduleName: 'Created by employee',
        scheduleType: 'daily',
        cronExpression: '0 10 * * *',
        enabled: true,
      });
    expect(createRes.status).toBe(201);

    const { rows } = await db.query(
      `SELECT workspace_owner_id, created_by
       FROM campaign_schedules
       WHERE id = $1`,
      [createRes.body.data.id]
    );
    expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerA.id));
    expect(Number(rows[0].created_by)).toBe(Number(employee.id));

    const crossTenantRead = await request(app)
      .get(`/api/campaign-schedules/${scheduleB.id}`)
      .set(headers);
    expect(crossTenantRead.status).toBe(404);

    const crossTenantUpdate = await request(app)
      .patch(`/api/campaign-schedules/${scheduleB.id}`)
      .set(headers)
      .send({ scheduleName: 'Hijack' });
    expect(crossTenantUpdate.status).toBe(404);
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

describe('once schedule past / year-rollover guard', () => {
  function hanoiParts(instant = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23', // KHÔNG dùng hour12:false — nó render nửa đêm thành "24" (h24), cron hỏng
    }).formatToParts(instant);
    return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  }

  /** Cron for midnight on a Hanoi calendar day that already passed (forces ~1y rollover). */
  function pastOnceCron() {
    const n = hanoiParts();
    let pastDay = Number(n.day);
    let pastMonth = Number(n.month);
    if (Number(n.hour) === 0 && Number(n.minute) < 1) {
      const prev = new Date(Date.UTC(Number(n.year), pastMonth - 1, pastDay - 1));
      pastDay = prev.getUTCDate();
      pastMonth = prev.getUTCMonth() + 1;
    }
    return `0 0 ${pastDay} ${pastMonth} *`;
  }

  it('POST once cron for day/month already past this year → 400', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'Past once',
        scheduleType: 'once',
        cronExpression: pastOnceCron(),
      });
    expect(res.status).toBe(400);
    expect(String(res.body.message || '')).toMatch(/tương lai|năm/i);
  });

  it('POST once cron for tomorrow → 201', async () => {
    const o = await createUser({ role: 'user', username: 'u2' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);

    const v = hanoiParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const cron = `30 10 ${Number(v.day)} ${Number(v.month)} *`;

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'Tomorrow once',
        scheduleType: 'once',
        cronExpression: cron,
      });
    expect(res.status).toBe(201);
  });

  it('POST once cron ~1 minute ahead → 201 (after_delay path)', async () => {
    const o = await createUser({ role: 'user', username: 'u3' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);

    // +5 phút, KHÔNG phải +60 giây.
    //
    // Backend so mốc ở độ chính xác PHÚT. Với +60 giây, nếu bài chạy vào quanh
    // giây thứ 59 thì request vượt qua ranh giới phút, mốc đích thành quá khứ —
    // và vì cron `once` mã hoá ngày+tháng, cron-parser nhảy thẳng sang năm sau,
    // vượt cửa sổ 180 ngày → 400. Cửa sổ hỏng chỉ ~1 giây mỗi phút nhưng đủ để
    // làm CI đỏ ngẫu nhiên.
    //
    // +5 phút vẫn chứng minh đúng điều cần chứng minh: cửa sổ tương lai ngắn
    // (luồng "chạy sau N phút", gửi lên dưới dạng `once`) KHÔNG bị chặn.
    const v = hanoiParts(new Date(Date.now() + 5 * 60 * 1000));
    const cron = `${Number(v.minute)} ${Number(v.hour)} ${Number(v.day)} ${Number(v.month)} *`;

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignId: c.id,
        scheduleName: 'Soon once',
        scheduleType: 'once',
        cronExpression: cron,
      });
    expect(res.status).toBe(201);
  });

  it('PATCH once cron to past day/month → 400', async () => {
    const o = await createUser({ role: 'user', username: 'u4' });
    const c = await insertCampaign({ ownerId: o.id });
    const v = hanoiParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const s = await insertSchedule({
      campaignId: c.id,
      scheduleType: 'once',
      cronExpression: `0 10 ${Number(v.day)} ${Number(v.month)} *`,
    });
    const t = await loginAs(o);

    const res = await request(app)
      .patch(`/api/campaign-schedules/${s.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({
        cronExpression: pastOnceCron(),
      });
    expect(res.status).toBe(400);
  });
});
