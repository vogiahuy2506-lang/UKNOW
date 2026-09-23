/**
 * Lệnh giao 21/09/2026 (lịch chạy không được chết im lặng), PR-1 — Postgres THẬT.
 *
 * Kịch bản nguyên xi ngày 21/09: chiến dịch 395 còn `draft`, người dùng đặt lịch bật, tới giờ lịch nổ.
 *   - Đặt lịch bật cho chiến dịch draft → 409 CAMPAIGN_NOT_ACTIVE (chặn từ đầu).
 *   - Lịch đã lỡ nằm sẵn trong DB (tạo trước bản này) nổ qua triggerCampaignSchedule THẬT → để lại một
 *     lượt chạy `failed` có id_schedule + error_message, run_count vẫn 0, lịch `once` bị tắt.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { _triggerCampaignScheduleForTests as triggerSchedule } from '../../src/utils/scheduler.js';
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

async function insertCampaign({ ownerId, status, campaignName = 'Nhắc lịch hội thảo 23/9' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [ownerId, campaignName, status],
  );
  return rows[0];
}

async function insertSchedule({ campaignId, ownerId, scheduleType = 'once', cron = '30 07 21 9 *', enabled = true }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, created_by, schedule_name, schedule_type, cron_expression, enabled)
     VALUES ($1, $2, $2, 'Nhắc lịch', $3, $4, $5) RETURNING *`,
    [campaignId, ownerId, scheduleType, cron, enabled],
  );
  return rows[0];
}

const schedulePayload = (campaignId, extra = {}) => ({
  campaignId,
  scheduleName: 'Nhắc lịch',
  scheduleType: 'daily',
  cronExpression: '0 9 * * *',
  ...extra,
});

describe('POST/PATCH /api/campaign-schedules — chiến dịch chưa active', () => {
  it('draft + lịch bật → 409 CAMPAIGN_NOT_ACTIVE, không có dòng nào được tạo', async () => {
    const user = await createUser({ email: 'sch-draft@test.com', username: 'sch_draft' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(schedulePayload(campaign.id));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_NOT_ACTIVE');
    expect(res.body.message).toContain('Chiến dịch đang ở trạng thái Nháp nên lịch sẽ không chạy');
    expect(res.body.message).toContain('Kích hoạt chiến dịch khi tạo lịch');
    expect(res.body.message).not.toContain('Chạy ngay');
    const { rows } = await db.query('SELECT 1 FROM campaign_schedules WHERE id_campaign = $1', [campaign.id]);
    expect(rows).toHaveLength(0);
  });

  it('paused → câu nói "Tạm dừng"; draft + lịch TẮT → tạo được; active + lịch bật → tạo được', async () => {
    const user = await createUser({ email: 'sch-mix@test.com', username: 'sch_mix' });
    const token = await loginAs(user);
    const paused = await insertCampaign({ ownerId: user.id, status: 'paused', campaignName: 'P' });
    const draft = await insertCampaign({ ownerId: user.id, status: 'draft', campaignName: 'D' });
    const active = await insertCampaign({ ownerId: user.id, status: 'active', campaignName: 'A' });
    const post = (body) => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(body);

    const pausedRes = await post(schedulePayload(paused.id));
    expect(pausedRes.status).toBe(409);
    expect(pausedRes.body.message).toContain('trạng thái Tạm dừng');

    expect((await post(schedulePayload(draft.id, { enabled: false }))).status).toBe(201);
    expect((await post(schedulePayload(active.id))).status).toBe(201);
  });

  it('bật lại lịch đang tắt của chiến dịch draft → 409; sau khi chiến dịch active thì bật được', async () => {
    const user = await createUser({ email: 'sch-toggle@test.com', username: 'sch_toggle' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: user.id, scheduleType: 'daily', cron: '0 9 * * *', enabled: false });
    const patch = (body) => request(app).patch(`/api/campaign-schedules/${schedule.id}`).set('Authorization', `Bearer ${token}`).send(body);

    const blocked = await patch({ enabled: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CAMPAIGN_NOT_ACTIVE');
    expect((await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id])).rows[0].enabled).toBe(false);

    await db.query(`UPDATE campaigns SET status = 'active' WHERE id = $1`, [campaign.id]);
    expect((await patch({ enabled: true })).status).toBe(200);
  });
});

describe('triggerCampaignSchedule THẬT — lịch nổ khi chiến dịch còn draft (kịch bản 21/09)', () => {
  it('để lại 1 lượt chạy failed đúng id_schedule + error_message; run_count vẫn 0; lịch once bị tắt', async () => {
    const user = await createUser({ email: 'sch-fire@test.com', username: 'sch_fire' });
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: user.id, scheduleType: 'once' });

    await triggerSchedule(schedule);

    const { rows: runs } = await db.query('SELECT * FROM campaign_runs WHERE id_campaign = $1', [campaign.id]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id_schedule: String(schedule.id),
      run_type: 'scheduled',
      status: 'failed',
      workspace_owner_id: String(user.id),
    });
    expect(runs[0].error_message).toContain('Chỉ có thể chạy chiến dịch đang hoạt động');
    expect(runs[0].run_name).toMatch(/^Nhắc lịch - /);
    expect(runs[0].started_at).not.toBeNull();
    expect(runs[0].completed_at).not.toBeNull();
    expect(runs[0].total_recipients).toBe(0);

    const after = (await db.query('SELECT enabled, run_count, last_run_at FROM campaign_schedules WHERE id = $1', [schedule.id])).rows[0];
    expect(after.run_count).toBe(0); // bẫy 1: tăng lên là người dùng mất quyền bật/tắt một lịch chưa từng gửi được gì
    expect(after.last_run_at).toBeNull();
    expect(after.enabled).toBe(false); // once hỏng → không bắn lại năm sau
  });

  it('lịch weekly hỏng: vẫn bật để tuần sau thử lại, run_count 0; GET lịch trả lastRunStatus=failed', async () => {
    const user = await createUser({ email: 'sch-fire2@test.com', username: 'sch_fire2' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: user.id, scheduleType: 'weekly', cron: '30 07 * * 1' });

    await triggerSchedule(schedule);

    const after = (await db.query('SELECT enabled, run_count FROM campaign_schedules WHERE id = $1', [schedule.id])).rows[0];
    expect(after).toMatchObject({ enabled: true, run_count: 0 });

    const res = await request(app).get(`/api/campaign-schedules/${schedule.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lastRunStatus).toBe('failed');
    expect(res.body.data.runCount).toBe(0);
    expect(res.body.data.campaignStatus).toBe('draft');
  });

  it('chiến dịch active nhưng preflight hỏng (không có node gửi) cũng để lại dấu vết thay vì im lặng', async () => {
    const user = await createUser({ email: 'sch-fire3@test.com', username: 'sch_fire3' });
    const campaign = await insertCampaign({ ownerId: user.id, status: 'active' });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: user.id, scheduleType: 'daily', cron: '0 9 * * *' });

    await triggerSchedule(schedule);

    const { rows: runs } = await db.query('SELECT status, error_message, id_schedule FROM campaign_runs WHERE id_campaign = $1', [campaign.id]);
    // Chiến dịch trống không thể chạy: hoặc preflight ném lỗi (→ 1 dòng failed) — miễn KHÔNG im lặng.
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.some((r) => r.status === 'failed' && r.error_message && String(r.id_schedule) === String(schedule.id))).toBe(true);
  });
});
