/**
 * PLAN_MOT_NUT_GUI_2026-10-23 PR-1 — suất chiến dịch "chạy xong thì trả" (Postgres thật).
 *
 * Chiến dịch CHIẾM suất khi: chưa có lượt chạy nào, HOẶC có lượt `running`, HOẶC có lịch `enabled = TRUE`.
 * Chiến dịch đã chạy xong (completed/failed/stopped, không lịch bật) trả suất. Cổng kích hoạt lại chỉ đặt ở thao tác
 * NGƯỜI DÙNG (Chạy ngay / chạy tiếp continuous / tạo-bật lịch); scheduler KHÔNG bị chặn.
 *
 * Trần dùng trong file: `max_email_campaigns` = 2 (khoá theo loại) hoặc `max_campaigns` = 2 (khoá chung).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import campaignRunService from '../../src/services/campaign/campaignRun.service.js';
import { _triggerCampaignScheduleForTests as triggerSchedule } from '../../src/utils/scheduler.js';
import {
  enforceCampaignSlotOnActivationTx,
  getResourceUsageSnapshot,
} from '../../src/utils/userResourceLimit.util.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
let executeCampaignSpy;

beforeAll(() => {
  app = createApp();
  // Chỉ kiểm cổng + bản ghi run; engine gửi thật (BullMQ/email/Zalo) nằm ngoài phạm vi.
  executeCampaignSpy = jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();
});

beforeEach(async () => {
  await truncateAll();
  executeCampaignSpy.mockClear();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

/** Chủ tài khoản với trần chiến dịch: `emailCap` (khoá loại email) và/hoặc `generalCap` (khoá chung `campaigns`). */
async function seedOwner({ emailCap = null, generalCap = null, zaloCap = null } = {}) {
  const owner = await createUser({ role: 'user', username: `slot${Date.now()}${Math.floor(Math.random() * 10000)}` });
  await db.query(
    `UPDATE users SET max_email_campaigns = $2, max_campaigns = $3, max_zalo_campaigns = $4 WHERE id = $1`,
    [owner.id, emailCap, generalCap, zaloCap]
  );
  return owner;
}

/**
 * Dựng một chiến dịch ở đúng trạng thái chiếm/không chiếm suất.
 * `runs`: danh sách status của các lượt chạy (rỗng = chưa chạy lần nào). `schedules`: danh sách `enabled`.
 */
async function makeCampaign(owner, { type = 'email', runs = [], schedules = [], name = 'C', status = 'active' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, $3, $4) RETURNING *`,
    [owner.id, name, type, status]
  );
  const campaign = rows[0];
  await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gửi email', '{}'::jsonb, 1)`,
    [campaign.id]
  );
  for (const runStatus of runs) {
    await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, completed_at)
       VALUES ($1, $2, 'manual', $3::varchar, CASE WHEN $4::boolean THEN NULL ELSE NOW() END)`,
      [campaign.id, owner.id, runStatus, runStatus === 'running']
    );
  }
  let cronMinute = 0;
  for (const enabled of schedules) {
    cronMinute += 1;
    await db.query(
      `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, created_by, schedule_name, schedule_type, cron_expression, enabled)
       VALUES ($1, $2, $2, 'Lịch', 'daily', $3, $4)`,
      [campaign.id, owner.id, `${cronMinute} 9 * * *`, enabled]
    );
  }
  return campaign;
}

const runCount = async (campaignId) =>
  (await db.query('SELECT COUNT(*)::int AS c FROM campaign_runs WHERE id_campaign = $1', [campaignId])).rows[0].c;

const usedOf = async (owner, key) => (await getResourceUsageSnapshot(owner.id, [key]))[key];

const postRun = (token, campaignId, body = { source: 'campaign_run' }) =>
  request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${token}`).send(body);

describe('Định nghĩa chiếm suất (đếm)', () => {
  it('2 chiến dịch đã chạy xong (completed, không lịch) → đếm 0; tạo chiến dịch mới được', async () => {
    const owner = await seedOwner({ emailCap: 2, generalCap: 2 });
    await makeCampaign(owner, { runs: ['completed'] });
    await makeCampaign(owner, { runs: ['completed'] });

    expect(await usedOf(owner, 'emailCampaigns')).toEqual({ used: 0, limit: 2 });
    expect(await usedOf(owner, 'campaigns')).toEqual({ used: 0, limit: 2 });

    const token = await loginAs(owner);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignName: 'mới', campaignType: 'email' });
    expect(res.status).toBe(201);
  });

  it('1 chưa chạy + 1 đang running → đếm 2; tạo mới → 400 RESOURCE_LIMIT_EXCEEDED, câu báo nêu cách giải phóng', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: ['completed', 'running'] });

    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(2);

    const token = await loginAs(owner);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignName: 'mới', campaignType: 'email' });
    expect(res.status).toBe(400);
    // Cổng tạo (POST /campaigns) từ trước chỉ trả `limitReached` (không `code`) — hợp đồng cũ, giữ nguyên.
    expect(res.body).toMatchObject({ success: false, limitReached: true });
    expect(res.body.message).toContain('Chiến dịch đã chạy xong không tính');
    expect(res.body.message).toContain('tắt lịch hẹn');
  });

  it('1 đã xong nhưng có lịch enabled → đếm 1 (cộng 1 chiến dịch đã xong không lịch → vẫn 1)', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: ['completed'], schedules: [true] });
    await makeCampaign(owner, { runs: ['completed'] });
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(1);
  });

  it('lịch disabled + run failed/stopped → không đếm', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: ['failed'], schedules: [false] });
    await makeCampaign(owner, { runs: ['stopped'], schedules: [false] });
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(0);
  });

  it('khoá theo loại tách biệt: chiến dịch Zalo chưa chạy không làm đầy khoá email', async () => {
    const owner = await seedOwner({ emailCap: 1, zaloCap: 5 });
    await makeCampaign(owner, { type: 'zalo', runs: [] });
    await makeCampaign(owner, { type: 'email', runs: ['completed'] });
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(0);
    expect((await usedOf(owner, 'zaloCampaigns')).used).toBe(1);
  });
});

describe('Cổng "Chạy ngay" (POST /campaigns/:id/run)', () => {
  it('đang 2 chiếm suất, bấm Chạy ngay chiến dịch đã xong thứ 3 → 400 RESOURCE_LIMIT_EXCEEDED, KHÔNG tạo run', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await postRun(await loginAs(owner), done.id);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'RESOURCE_LIMIT_EXCEEDED', limitReached: true });
    expect(await runCount(done.id)).toBe(1); // vẫn chỉ lượt đã xong cũ
    expect(executeCampaignSpy).not.toHaveBeenCalled();
  });

  it('cổng đọc cả source="schedule" trong body: né bằng cách ghi source khác KHÔNG lọt', async () => {
    const owner = await seedOwner({ emailCap: 1 });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await postRun(await loginAs(owner), done.id, { source: 'schedule' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(await runCount(done.id)).toBe(1);
  });

  it('đang 2 chiếm suất, Chạy ngay một chiến dịch CHƯA chạy (đang được tính) → chạy được', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    const fresh = await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });

    const res = await postRun(await loginAs(owner), fresh.id);

    expect(res.status).toBe(200);
    expect(await runCount(fresh.id)).toBe(1);
  });

  it('đang 1 chiếm suất, Chạy ngay chiến dịch đã xong → chạy được (đủ chỗ), rồi đầy suất', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await postRun(await loginAs(owner), done.id);

    expect(res.status).toBe(200);
    expect(await runCount(done.id)).toBe(2);
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(2); // lượt vừa chạy đang running
  });

  it('khoá chung `campaigns` (max_campaigns) cùng quy tắc: đang 2 chiếm suất → Chạy ngay chiến dịch đã xong bị chặn', async () => {
    const owner = await seedOwner({ generalCap: 2 });
    await makeCampaign(owner, { type: 'zalo', runs: [] });
    await makeCampaign(owner, { type: 'email', runs: ['running'] });
    const done = await makeCampaign(owner, { type: 'email', runs: ['failed'] });

    const res = await postRun(await loginAs(owner), done.id);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'campaigns' });
    expect(await runCount(done.id)).toBe(1);
  });

  it('chạy tiếp lượt continuous đã xong (continueRunId) cũng đi qua cổng', async () => {
    const owner = await seedOwner({ emailCap: 1 });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: [] });
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, completed_at, run_metadata)
       VALUES ($1, $2, 'manual', 'completed', NOW(), '{"continuousMode": true}'::jsonb) RETURNING id`,
      [done.id, owner.id]
    );

    const res = await postRun(await loginAs(owner), done.id, {
      source: 'campaign_run',
      continuousMode: true,
      continueRunId: Number(rows[0].id),
    });

    // `done` không chiếm suất nữa? Nó có lượt đã xong → không chiếm; còn 1 chiến dịch chưa chạy chiếm 1/1 → hết chỗ.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    const { rows: after } = await db.query('SELECT status FROM campaign_runs WHERE id = $1', [rows[0].id]);
    expect(after[0].status).toBe('completed');
  });

  it('race: hai Chạy ngay song song trên hai chiến dịch đã xong khi chỉ còn 1 chỗ → đúng 1 chạy được', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    const a = await makeCampaign(owner, { runs: ['completed'] });
    const b = await makeCampaign(owner, { runs: ['completed'] });
    const token = await loginAs(owner);

    const [ra, rb] = await Promise.all([postRun(token, a.id), postRun(token, b.id)]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 400]);
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(2);
  });
});

describe('Cổng tạo / bật lịch (campaign-schedules)', () => {
  const scheduleBody = (campaignId) => ({
    campaignId,
    scheduleName: 'Lịch mới',
    scheduleType: 'daily',
    cronExpression: '0 9 * * *',
    enabled: true,
  });

  it('đang 2 chiếm suất, tạo lịch BẬT cho chiến dịch đã xong → 400 RESOURCE_LIMIT_EXCEEDED, không tạo lịch', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${await loginAs(owner)}`)
      .send(scheduleBody(done.id));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'RESOURCE_LIMIT_EXCEEDED', limitReached: true });
    const { rows } = await db.query('SELECT id FROM campaign_schedules WHERE id_campaign = $1', [done.id]);
    expect(rows).toHaveLength(0);
  });

  it('đang 2 chiếm suất, BẬT LẠI lịch đang tắt của chiến dịch đã xong → bị chặn, lịch vẫn tắt', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'], schedules: [false] });
    const { rows: sched } = await db.query('SELECT id FROM campaign_schedules WHERE id_campaign = $1', [done.id]);

    const res = await request(app)
      .patch(`/api/campaign-schedules/${sched[0].id}`)
      .set('Authorization', `Bearer ${await loginAs(owner)}`)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    const { rows: after } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [sched[0].id]);
    expect(after[0].enabled).toBe(false);
  });

  it('đang 1 chiếm suất (trần 2) → tạo lịch bật cho chiến dịch đã xong được', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${await loginAs(owner)}`)
      .send(scheduleBody(done.id));

    expect(res.status).toBe(201);
    expect((await usedOf(owner, 'emailCampaigns')).used).toBe(2);
  });

  it('chiến dịch ĐÃ chiếm suất (chưa chạy lần nào) tạo lịch bật khi đang đầy trần → không bị chặn', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    const fresh = await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${await loginAs(owner)}`)
      .send(scheduleBody(fresh.id));

    expect(res.status).toBe(201);
  });

  it('tạo lịch TẮT cho chiến dịch đã xong khi đang đầy trần → được (lịch tắt không chiếm suất)', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });
    const done = await makeCampaign(owner, { runs: ['completed'] });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${await loginAs(owner)}`)
      .send({ ...scheduleBody(done.id), enabled: false });

    expect(res.status).toBe(201);
  });
});

describe('Scheduler KHÔNG bị cổng chặn', () => {
  it('scheduler bắn lịch của chủ đang ở trần (chiến dịch đã xong, lịch không còn bật trong DB) → vẫn tạo lượt chạy theo lịch', async () => {
    const owner = await seedOwner({ emailCap: 2 });
    await makeCampaign(owner, { runs: [] });
    await makeCampaign(owner, { runs: [] });
    // Chiến dịch đã xong + lịch `once` đã tắt (cron trong bộ nhớ có thể còn nổ trước khi refresh): lúc bắn nó KHÔNG chiếm suất.
    const done = await makeCampaign(owner, { runs: ['completed'], schedules: [false] });
    const { rows } = await db.query('SELECT * FROM campaign_schedules WHERE id_campaign = $1', [done.id]);

    await triggerSchedule(rows[0]);

    const { rows: runs } = await db.query(
      `SELECT run_type, status FROM campaign_runs WHERE id_campaign = $1 ORDER BY id`,
      [done.id]
    );
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ run_type: 'scheduled', status: 'running' });
    expect(executeCampaignSpy).toHaveBeenCalledTimes(1);
  });
});

describe('enforceCampaignSlotOnActivationTx (trực tiếp)', () => {
  const inTx = async (fn) => {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  };

  it('khoá theo loại Zalo: hết chỗ Zalo thì chặn chiến dịch Zalo đã xong, nhưng chiến dịch email đã xong vẫn qua', async () => {
    const owner = await seedOwner({ zaloCap: 1 });
    await makeCampaign(owner, { type: 'zalo', runs: [] });
    const zaloDone = await makeCampaign(owner, { type: 'zalo', runs: ['completed'] });
    const emailDone = await makeCampaign(owner, { type: 'email', runs: ['completed'] });

    await expect(
      inTx((client) => enforceCampaignSlotOnActivationTx(client, { userId: owner.id, roleCode: 'user', campaignId: zaloDone.id }))
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'zaloCampaigns', statusCode: 400 });

    await expect(
      inTx((client) => enforceCampaignSlotOnActivationTx(client, { userId: owner.id, roleCode: 'user', campaignId: emailDone.id }))
    ).resolves.toBeUndefined();
  });

  it('trần 0 (gói không hỗ trợ) → chặn chiến dịch đã xong; admin bỏ qua; chiến dịch đang chiếm suất không bị chặn', async () => {
    const owner = await seedOwner({ emailCap: 0 });
    const done = await makeCampaign(owner, { runs: ['completed'] });
    const fresh = await makeCampaign(owner, { runs: [] });

    await expect(
      inTx((client) => enforceCampaignSlotOnActivationTx(client, { userId: owner.id, roleCode: 'user', campaignId: done.id }))
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(
      inTx((client) => enforceCampaignSlotOnActivationTx(client, { userId: owner.id, roleCode: 'admin', campaignId: done.id }))
    ).resolves.toBeUndefined();
    await expect(
      inTx((client) => enforceCampaignSlotOnActivationTx(client, { userId: owner.id, roleCode: 'user', campaignId: fresh.id }))
    ).resolves.toBeUndefined();
  });
});
