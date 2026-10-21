/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-A — chạy chiến dịch tin id do client gửi.
 *
 *  - A2: nhân viên của A (A đặt ngưỡng duyệt) gọi `POST /campaigns/<chiến dịch của B>/run` -> 404, chiến dịch B không bị
 *    chuyển sang `pending_owner_approval`, không có audit, câu trả lời không nêu số người nhận của B.
 *  - A3: `scheduleId` trong body chỉ được gắn vào lượt chạy khi đúng là lịch của CHÍNH chiến dịch đó, cùng workspace.
 *
 * (A1 — mẫu email của tenant khác — chưa làm: xem báo cáo, nhánh `template == null` hiện gửi email chung chứ không báo lỗi.)
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import campaignRunService from '../../src/services/campaign/campaignRun.service.js';
import { markPendingOwnerApproval } from '../../src/services/campaign/campaignApproval.service.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
let executeCampaignSpy;

beforeAll(() => {
  app = createApp();
  // executeCampaign là việc nền (gửi thật) — ngoài phạm vi: chỉ cần biết lượt chạy có được tạo hay không.
  executeCampaignSpy = jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();
});

beforeEach(async () => {
  await truncateAll();
  executeCampaignSpy.mockClear();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

async function addEmployee(ownerId, employeeId) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify({ campaigns_view: true, campaigns_create: true, campaigns_run: true })]
  );
}

/** Chiến dịch active + node gửi email cấu hình sẵn `recipientCount` người nhận (đếm qua node-config). */
async function insertCampaign({ ownerId, recipientCount = 0, name = 'Chien dich' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'active') RETURNING *`,
    [ownerId, name]
  );
  const campaign = rows[0];
  const recipients = Array.from({ length: recipientCount }, (_, i) => `nguoinhan${i}@test.local`);
  await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gửi email', $2::jsonb, 1)`,
    [campaign.id, JSON.stringify({ recipients })]
  );
  return campaign;
}

async function insertSchedule(campaignId, cronExpression = '0 9 * * *') {
  const { rows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled)
     VALUES ($1, 'Lich', 'daily', $2, true) RETURNING *`,
    [campaignId, cronExpression]
  );
  return rows[0];
}

const statusOf = async (campaignId) =>
  (await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId])).rows[0].status;
const approvalAuditCount = async (campaignId) =>
  (await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'CAMPAIGN_APPROVAL_REQUESTED' AND entity_id = $1`, [campaignId]))
    .rows[0].n;

describe('A2 — nhân viên không đẩy chiến dịch tenant khác sang "chờ duyệt"', () => {
  async function setup() {
    const ownerA = await createUser({ role: 'user', username: 'co_chu_a' });
    await db.query('UPDATE users SET employee_campaign_approval_threshold = 1 WHERE id = $1', [ownerA.id]);
    const employeeA = await createUser({ role: 'user', username: 'co_nv_a' });
    await addEmployee(ownerA.id, employeeA.id);
    const ownerB = await createUser({ role: 'user', username: 'co_chu_b' });
    const employeeToken = await loginAs(employeeA);
    return { ownerA, employeeA, ownerB, employeeToken };
  }
  const runAs = (employeeToken, ownerA, campaignId) =>
    request(app)
      .post(`/api/campaigns/${campaignId}/run`)
      .set({ ...auth(employeeToken), 'X-Owner-Context': String(ownerA.id) })
      .send({ source: 'campaign_run' });

  it('nhân viên của A chạy chiến dịch của B -> 404; status B không đổi; không audit; không lộ số người nhận; không tạo run', async () => {
    const { ownerA, ownerB, employeeToken } = await setup();
    const campaignB = await insertCampaign({ ownerId: ownerB.id, recipientCount: 7 });

    const res = await runAs(employeeToken, ownerA, campaignB.id);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/người nhận|ngưỡng/);
    expect(await statusOf(campaignB.id)).toBe('active');
    expect(await approvalAuditCount(campaignB.id)).toBe(0);
    const { rows: runs } = await db.query('SELECT id FROM campaign_runs WHERE id_campaign = $1', [campaignB.id]);
    expect(runs).toHaveLength(0);
    expect(executeCampaignSpy).not.toHaveBeenCalled();
  });

  it('nhân viên của A chạy chiến dịch của A vượt ngưỡng -> vẫn pending_owner_approval + audit (như cũ)', async () => {
    const { ownerA, employeeA, employeeToken } = await setup();
    const campaignA = await insertCampaign({ ownerId: ownerA.id, recipientCount: 3 });

    const res = await runAs(employeeToken, ownerA, campaignA.id);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'pending_owner_approval', requiresApproval: true });
    expect(await statusOf(campaignA.id)).toBe('pending_owner_approval');
    const { rows: audits } = await db.query(
      `SELECT id_user, details FROM audit_logs WHERE action = 'CAMPAIGN_APPROVAL_REQUESTED' AND entity_id = $1`,
      [campaignA.id]
    );
    expect(audits).toHaveLength(1);
    expect(Number(audits[0].id_user)).toBe(Number(employeeA.id));
    expect(audits[0].details).toMatchObject({ threshold: 1, totalCustomers: 3 });
    expect(executeCampaignSpy).not.toHaveBeenCalled();
  });

  it('markPendingOwnerApproval với ownerId KHÁC chủ chiến dịch -> false, status không đổi, không audit', async () => {
    const ownerA = await createUser({ role: 'user', username: 'co_chu_a2' });
    const ownerB = await createUser({ role: 'user', username: 'co_chu_b2' });
    const campaignB = await insertCampaign({ ownerId: ownerB.id, recipientCount: 2 });

    const marked = await markPendingOwnerApproval({
      ownerId: ownerA.id,
      campaignId: campaignB.id,
      auditContext: { userId: ownerA.id, ownerId: ownerA.id },
      threshold: 1,
      totalCustomers: 2,
      actorUserId: ownerA.id,
    });

    expect(marked).toBe(false);
    expect(await statusOf(campaignB.id)).toBe('active');
    expect(await approvalAuditCount(campaignB.id)).toBe(0);
  });

  it('markPendingOwnerApproval với đúng chủ -> true, đổi status và ghi audit', async () => {
    const ownerB = await createUser({ role: 'user', username: 'co_chu_b3' });
    const campaignB = await insertCampaign({ ownerId: ownerB.id, recipientCount: 2 });

    const marked = await markPendingOwnerApproval({
      ownerId: ownerB.id,
      campaignId: campaignB.id,
      auditContext: { userId: ownerB.id, ownerId: ownerB.id },
      threshold: 1,
      totalCustomers: 2,
      actorUserId: ownerB.id,
    });

    expect(marked).toBe(true);
    expect(await statusOf(campaignB.id)).toBe('pending_owner_approval');
    expect(await approvalAuditCount(campaignB.id)).toBe(1);
  });
});

describe('A3 — scheduleId trong body chỉ nhận lịch của chính chiến dịch, cùng workspace', () => {
  const runWithSchedule = (token, campaignId, scheduleId) =>
    request(app).post(`/api/campaigns/${campaignId}/run`).set(auth(token)).send({ source: 'campaign_run', scheduleId });
  const idScheduleOfRun = async (runId) =>
    (await db.query('SELECT id_schedule FROM campaign_runs WHERE id = $1', [runId])).rows[0].id_schedule;

  it('scheduleId = lịch của chiến dịch B -> lượt chạy của A có id_schedule NULL', async () => {
    const a = await createUser({ role: 'user', username: 'co_sa' });
    const b = await createUser({ role: 'user', username: 'co_sb' });
    const campaignA = await insertCampaign({ ownerId: a.id });
    const campaignB = await insertCampaign({ ownerId: b.id });
    const scheduleB = await insertSchedule(campaignB.id);

    const res = await runWithSchedule(await loginAs(a), campaignA.id, scheduleB.id);

    expect(res.status).toBe(200);
    expect(await idScheduleOfRun(res.body.data.runId)).toBeNull();
    // Lịch của B không bị chạm: không có lượt chạy nào gắn vào nó.
    const { rows } = await db.query('SELECT id FROM campaign_runs WHERE id_schedule = $1', [scheduleB.id]);
    expect(rows).toHaveLength(0);
  });

  it('scheduleId = lịch của chiến dịch KHÁC nhưng cùng chủ A -> NULL (lịch phải thuộc đúng chiến dịch này)', async () => {
    const a = await createUser({ role: 'user', username: 'co_sa2' });
    const campaignA1 = await insertCampaign({ ownerId: a.id, name: 'A1' });
    const campaignA2 = await insertCampaign({ ownerId: a.id, name: 'A2' });
    const scheduleA2 = await insertSchedule(campaignA2.id);

    const res = await runWithSchedule(await loginAs(a), campaignA1.id, scheduleA2.id);

    expect(res.status).toBe(200);
    expect(await idScheduleOfRun(res.body.data.runId)).toBeNull();
  });

  it('scheduleId = lịch của chính chiến dịch đó -> giữ nguyên', async () => {
    const a = await createUser({ role: 'user', username: 'co_sa3' });
    const campaignA = await insertCampaign({ ownerId: a.id });
    const scheduleA = await insertSchedule(campaignA.id);

    const res = await runWithSchedule(await loginAs(a), campaignA.id, scheduleA.id);

    expect(res.status).toBe(200);
    expect(Number(await idScheduleOfRun(res.body.data.runId))).toBe(Number(scheduleA.id));
  });

  it('scheduleId không tồn tại -> NULL, vẫn chạy được', async () => {
    const a = await createUser({ role: 'user', username: 'co_sa4' });
    const campaignA = await insertCampaign({ ownerId: a.id });

    const res = await runWithSchedule(await loginAs(a), campaignA.id, 987654321);

    expect(res.status).toBe(200);
    expect(await idScheduleOfRun(res.body.data.runId)).toBeNull();
  });
});
