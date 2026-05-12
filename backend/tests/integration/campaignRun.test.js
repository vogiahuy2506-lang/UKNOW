/**
 * Integration tests cho `/api/campaign-runs`.
 *
 * Phạm vi cover:
 *   - Authorization (token).
 *   - GET /: list run với JOIN campaigns + schedule_name, filter
 *     campaignId/scheduleId, ORDER BY started_at DESC, LIMIT, isolation,
 *     admin global view.
 *   - GET /:id: detail kèm campaign_name + schedule_name. Tracking summary
 *     (customer_purchases / customer_journey) bị wrap try-catch nên khi bảng
 *     chưa tồn tại các counter mặc định = 0 (đúng spec controller).
 *   - POST /:id/stop:
 *       * Validate id (NaN → 400).
 *       * Run đang `running` → chuyển status='stopped' + completed_at + error_message.
 *       * Run đã `completed` → 409 (found nhưng không stop được).
 *       * Run không tồn tại → 404.
 *       * Isolation (user khác → 404, admin được phép).
 *
 * KHÔNG cover:
 *   - executionLogs từ `campaign_executions` (bảng nằm trong Batch B).
 *   - trackingSummary chi tiết (cần customer_purchases + customer_journey,
 *     thuộc Batch B). Test chỉ verify endpoint hoạt động và counter default = 0.
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

async function insertSchedule({ campaignId, scheduleName = 'S' }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression)
     VALUES ($1, $2, 'daily', '0 9 * * *') RETURNING *`,
    [campaignId, scheduleName]
  );
  return rows[0];
}

async function insertRun({
  campaignId,
  scheduleId = null,
  status = 'running',
  runType = 'manual',
  runName = null,
  startedAt = null,
  totalRecipients = 0,
  successfulSends = 0,
  failedSends = 0,
}) {
  const params = [campaignId, scheduleId, status, runType, runName, totalRecipients, successfulSends, failedSends];
  if (startedAt) {
    params.push(startedAt);
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, id_schedule, status, run_type, run_name,
        total_recipients, successful_sends, failed_sends, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      params
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, id_schedule, status, run_type, run_name,
      total_recipients, successful_sends, failed_sends)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    params
  );
  return rows[0];
}

// ===========================================================================
// AUTHORIZATION
// ===========================================================================

describe('Authorization — /api/campaign-runs', () => {
  it('không token → 401', async () => {
    const responses = await Promise.all([
      request(app).get('/api/campaign-runs'),
      request(app).get('/api/campaign-runs/1'),
      request(app).post('/api/campaign-runs/1/stop'),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });
});

// ===========================================================================
// GET /
// ===========================================================================

describe('GET /api/campaign-runs', () => {
  it('owner chỉ thấy run của campaign mình', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const ca = await insertCampaign({ ownerId: a.id, campaignName: 'CA' });
    const cb = await insertCampaign({ ownerId: b.id, campaignName: 'CB' });
    await insertRun({ campaignId: ca.id, runName: 'A1' });
    await insertRun({ campaignId: cb.id, runName: 'B1' });

    const t = await loginAs(a);
    const res = await request(app).get('/api/campaign-runs').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((x) => x.runName).sort()).toEqual(['A1']);
  });

  it('admin thấy hết', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    await insertRun({ campaignId: c.id });
    const t = await loginAs(admin);
    const res = await request(app).get('/api/campaign-runs').set('Authorization', `Bearer ${t}`);
    expect(res.body.data).toHaveLength(1);
  });

  it('filter campaignId', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c1 = await insertCampaign({ ownerId: o.id, campaignName: 'C1' });
    const c2 = await insertCampaign({ ownerId: o.id, campaignName: 'C2' });
    await insertRun({ campaignId: c1.id, runName: 'r1' });
    await insertRun({ campaignId: c2.id, runName: 'r2' });

    const t = await loginAs(o);
    const res = await request(app)
      .get(`/api/campaign-runs?campaignId=${c1.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].runName).toBe('r1');
  });

  it('filter scheduleId', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const s1 = await insertSchedule({ campaignId: c.id });
    const s2 = await insertSchedule({ campaignId: c.id });
    await insertRun({ campaignId: c.id, scheduleId: s1.id, runName: 'r1' });
    await insertRun({ campaignId: c.id, scheduleId: s2.id, runName: 'r2' });
    await insertRun({ campaignId: c.id, runName: 'manual' }); // no schedule

    const t = await loginAs(o);
    const res = await request(app)
      .get(`/api/campaign-runs?scheduleId=${s1.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.body.data.map((x) => x.runName)).toEqual(['r1']);
  });

  it('ORDER BY started_at DESC + LIMIT', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    await insertRun({ campaignId: c.id, runName: 'old', startedAt: new Date('2024-01-01') });
    await insertRun({ campaignId: c.id, runName: 'new', startedAt: new Date('2025-01-01') });
    await insertRun({ campaignId: c.id, runName: 'mid', startedAt: new Date('2024-06-01') });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaign-runs?limit=2')
      .set('Authorization', `Bearer ${t}`);
    expect(res.body.data.map((x) => x.runName)).toEqual(['new', 'mid']);
  });

  it('payload có campaignName + scheduleName (JOIN + LEFT JOIN)', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'My Campaign' });
    const s = await insertSchedule({ campaignId: c.id, scheduleName: 'My Sched' });
    await insertRun({ campaignId: c.id, scheduleId: s.id, runName: 'r' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/campaign-runs').set('Authorization', `Bearer ${t}`);
    expect(res.body.data[0]).toMatchObject({
      runName: 'r',
      campaignName: 'My Campaign',
      scheduleName: 'My Sched',
    });
  });

  it('run thủ công (id_schedule=null) → scheduleName=null', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    await insertRun({ campaignId: c.id, runName: 'manual', runType: 'manual' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/campaign-runs').set('Authorization', `Bearer ${t}`);
    expect(res.body.data[0].scheduleName).toBeNull();
  });
});

// ===========================================================================
// GET /:id
// ===========================================================================

describe('GET /api/campaign-runs/:id', () => {
  it('trả về detail + tracking summary mặc định 0', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'X' });
    const r = await insertRun({
      campaignId: c.id,
      runName: 'r1',
      totalRecipients: 100,
      successfulSends: 80,
      failedSends: 5,
    });

    const t = await loginAs(o);
    const res = await request(app)
      .get(`/api/campaign-runs/${r.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      runName: 'r1',
      campaignName: 'X',
      totalRecipients: 100,
      successfulSends: 80,
      failedSends: 5,
      linkClickCount: 0,
      purchaseCount: 0,
      pendingCount: 0,
      customerWithOrderCount: 0,
    });
    expect(res.body.data.executionLogs).toEqual([]);
  });

  it('run của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const r = await insertRun({ campaignId: c.id });

    const t = await loginAs(b);
    const res = await request(app)
      .get(`/api/campaign-runs/${r.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('id không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaign-runs/9999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('admin xem được run của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const r = await insertRun({ campaignId: c.id, runName: 'cross' });

    const t = await loginAs(admin);
    const res = await request(app)
      .get(`/api/campaign-runs/${r.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.runName).toBe('cross');
  });
});

// ===========================================================================
// POST /:id/stop
// ===========================================================================

describe('POST /api/campaign-runs/:id/stop', () => {
  it('id không phải số → 400', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-runs/abc/stop')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(400);
  });

  it('run đang running → set status=stopped + completed_at + error_message', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const r = await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaign-runs/${r.id}/stop`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ runId: Number(r.id), status: 'stopped' });

    const { rows } = await db.query('SELECT status, completed_at, error_message FROM campaign_runs WHERE id = $1', [r.id]);
    expect(rows[0].status).toBe('stopped');
    expect(rows[0].completed_at).toBeTruthy();
    expect(rows[0].error_message).toMatch(/dừng|stop/i);
  });

  it('run đã completed → 409 (found nhưng không stop được)', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const r = await insertRun({ campaignId: c.id, status: 'completed' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaign-runs/${r.id}/stop`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(409);
  });

  it('run không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaign-runs/99999/stop')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('run của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'a' });
    const b = await createUser({ role: 'user', username: 'b' });
    const c = await insertCampaign({ ownerId: a.id });
    const r = await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(b);
    const res = await request(app)
      .post(`/api/campaign-runs/${r.id}/stop`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);

    const { rows } = await db.query('SELECT status FROM campaign_runs WHERE id = $1', [r.id]);
    expect(rows[0].status).toBe('running');
  });

  it('admin stop được run của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'u' });
    const c = await insertCampaign({ ownerId: o.id });
    const r = await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(admin);
    const res = await request(app)
      .post(`/api/campaign-runs/${r.id}/stop`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
