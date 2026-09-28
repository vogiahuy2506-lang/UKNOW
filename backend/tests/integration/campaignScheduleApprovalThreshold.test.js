/**
 * PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28 PR-3 — ngưỡng duyệt chiến dịch
 * (`users.employee_campaign_approval_threshold`) trước đây chỉ kiểm ở đường chạy ngay
 * (campaign.controller.js#run). Nhân viên có `campaigns_run` né được ngưỡng bằng cách hẹn lịch
 * thay vì bấm "Chạy ngay" — scheduler (`utils/scheduler.js`) gọi thẳng createCampaignRunRecord,
 * không qua đoạn kiểm ngưỡng (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 4).
 *
 * Test gọi thẳng `_triggerCampaignScheduleForTests` (hàm xử lý lịch thật của scheduler), không qua
 * cron thật.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { _triggerCampaignScheduleForTests as triggerSchedule } from '../../src/utils/scheduler.js';
import { truncateAll, createUser } from './helpers/db.js';

beforeEach(async () => {
  await truncateAll();
});

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

/** Chiến dịch active + 1 node gửi email cấu hình sẵn `recipientCount` người nhận (đếm qua fallback
 * node-config của evaluateApprovalThreshold — không cần dựng campaign_customers/customers thật). */
async function insertCampaignWithRecipients({ ownerId, recipientCount }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'active') RETURNING *`,
    [ownerId, 'Chien dich hen lich nguong duyet']
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

async function insertSchedule({ campaignId, ownerId, createdBy }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, created_by, schedule_name, schedule_type, cron_expression, enabled)
     VALUES ($1, $2, $3, 'Lich hen nguong duyet', 'daily', '0 9 * * *', true) RETURNING *`,
    [campaignId, ownerId, createdBy]
  );
  return rows[0];
}

describe('Scheduler áp ngưỡng duyệt chiến dịch cho lịch hẹn (PR-3)', () => {
  it('nhân viên hẹn lịch vượt ngưỡng → pending_owner_approval, KHÔNG tạo campaign_runs, lịch tắt, có audit', async () => {
    const owner = await createUser({ username: 'chuduyet', role: 'user' });
    await db.query(`UPDATE users SET employee_campaign_approval_threshold = 1 WHERE id = $1`, [owner.id]);
    const employee = await createUser({ username: 'nvhenlich', role: 'user' });
    await addCampaignMembership(owner.id, employee.id);

    const campaign = await insertCampaignWithRecipients({ ownerId: owner.id, recipientCount: 2 });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: owner.id, createdBy: employee.id });

    await triggerSchedule(schedule);

    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).toBe('pending_owner_approval');

    const { rows: runRows } = await db.query('SELECT * FROM campaign_runs WHERE id_campaign = $1', [campaign.id]);
    expect(runRows).toHaveLength(0);

    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(false);

    const { rows: auditRows } = await db.query(
      `SELECT id_user, owner_id, details FROM audit_logs WHERE action = 'CAMPAIGN_APPROVAL_REQUESTED' AND entity_id = $1`,
      [campaign.id]
    );
    expect(auditRows).toHaveLength(1);
    expect(Number(auditRows[0].id_user)).toBe(Number(employee.id));
    expect(Number(auditRows[0].owner_id)).toBe(Number(owner.id));
    expect(auditRows[0].details).toMatchObject({ threshold: 1, totalCustomers: 2, actorUserId: Number(employee.id) });
  });

  it('cùng dữ liệu nhưng lịch do CHÍNH CHỦ tạo → không qua kiểm ngưỡng, chạy bình thường (có campaign_runs)', async () => {
    const owner = await createUser({ username: 'chuduyet2', role: 'user' });
    await db.query(`UPDATE users SET employee_campaign_approval_threshold = 1 WHERE id = $1`, [owner.id]);

    const campaign = await insertCampaignWithRecipients({ ownerId: owner.id, recipientCount: 2 });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: owner.id, createdBy: owner.id });

    await triggerSchedule(schedule);

    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).not.toBe('pending_owner_approval');

    const { rows: runRows } = await db.query('SELECT * FROM campaign_runs WHERE id_campaign = $1', [campaign.id]);
    expect(runRows.length).toBeGreaterThanOrEqual(1);

    const { rows: auditRows } = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'CAMPAIGN_APPROVAL_REQUESTED' AND entity_id = $1`,
      [campaign.id]
    );
    expect(auditRows).toHaveLength(0);
  });

  it('nhân viên hẹn lịch KHÔNG vượt ngưỡng (chủ chưa đặt ngưỡng) → chạy bình thường, không chặn', async () => {
    const owner = await createUser({ username: 'chukhongnguong', role: 'user' });
    const employee = await createUser({ username: 'nvhenlich2', role: 'user' });
    await addCampaignMembership(owner.id, employee.id);

    const campaign = await insertCampaignWithRecipients({ ownerId: owner.id, recipientCount: 2 });
    const schedule = await insertSchedule({ campaignId: campaign.id, ownerId: owner.id, createdBy: employee.id });

    await triggerSchedule(schedule);

    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).not.toBe('pending_owner_approval');

    const { rows: runRows } = await db.query('SELECT * FROM campaign_runs WHERE id_campaign = $1', [campaign.id]);
    expect(runRows.length).toBeGreaterThanOrEqual(1);
  });
});
