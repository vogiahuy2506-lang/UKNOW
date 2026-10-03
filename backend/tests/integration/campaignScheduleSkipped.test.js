/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04 PR-1, mục 3.4 — lịch nổ khi lượt chạy trước của chính chiến dịch
 * còn `running` không còn chết im lặng. Gọi thẳng `_triggerCampaignScheduleForTests` (hàm xử lý lịch thật của
 * scheduler) trên Postgres thật.
 *
 * Bối cảnh production 03/10: lịch #180/#139/#127 nổ khi lượt trước (#425/#337/#269) còn chạy — chỉ console.log.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { _triggerCampaignScheduleForTests as triggerSchedule } from '../../src/utils/scheduler.js';
import { truncateAll, createUser } from './helpers/db.js';

beforeEach(async () => {
  await truncateAll();
});

async function seed({ scheduleType = 'daily', cron = '0 9 * * *', campaignStatus = 'active' } = {}) {
  const owner = await createUser({ username: `chuskip${Date.now()}${Math.floor(Math.random() * 1000)}`, role: 'user' });
  const { rows: campaignRows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Chiến dịch 3 ngày', $2) RETURNING *`,
    [owner.id, campaignStatus]
  );
  const campaign = campaignRows[0];
  await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gửi email', '{"recipients":["a@test.local"]}'::jsonb, 1)`,
    [campaign.id]
  );
  const { rows: runRows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, started_at)
     VALUES ($1, $2, 'manual', 'running', '2026-10-03T22:00:00Z') RETURNING id`,
    [campaign.id, owner.id]
  );
  const { rows: scheduleRows } = await db.query(
    `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, created_by, schedule_name, schedule_type, cron_expression, enabled)
     VALUES ($1, $2, $2, 'Gửi sáng', $3, $4, true) RETURNING *`,
    [campaign.id, owner.id, scheduleType, cron]
  );
  return { owner, campaign, runningRunId: runRows[0].id, schedule: scheduleRows[0] };
}

const skipRows = async (campaignId) => (await db.query(
  `SELECT * FROM campaign_runs WHERE id_campaign = $1 AND run_metadata->>'skippedBecauseRunning' = 'true' ORDER BY id`,
  [campaignId]
)).rows;

describe('Scheduler — lịch nổ khi lượt trước còn chạy (3.4)', () => {
  it('lịch lặp: để lại ĐÚNG MỘT dòng "bỏ qua" (failed, scheduled, có blockingRunId, đã giành cờ email), lịch vẫn BẬT, không chạy chồng', async () => {
    const { campaign, runningRunId, schedule } = await seed();

    await triggerSchedule(schedule);
    // Email chủ là fire-and-forget: đợi một nhịp để claim cờ ghi xong.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const rows = await skipRows(campaign.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'failed',
      run_type: 'scheduled',
      error_message: `Bỏ qua lượt theo lịch vì lượt chạy trước (#${runningRunId}, bắt đầu 05:00 04/10) chưa xong`,
    });
    expect(Number(rows[0].id_schedule)).toBe(Number(schedule.id));
    expect(rows[0].run_metadata).toMatchObject({ skippedBecauseRunning: true, blockingRunId: Number(runningRunId) });
    // Cờ chống gửi trùng của email đã được giành đúng một lần cho dòng này.
    expect(rows[0].run_metadata.failureNotifiedAt).toBeTruthy();

    const { rows: scheduleRows } = await db.query('SELECT enabled, run_count FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0]).toMatchObject({ enabled: true, run_count: 0 });
    const { rows: allRuns } = await db.query('SELECT status FROM campaign_runs WHERE id_campaign = $1 ORDER BY id', [campaign.id]);
    expect(allRuns.map((r) => r.status)).toEqual(['running', 'failed']); // không có lượt chạy chồng mới
  });

  it('lịch once: vẫn bị TẮT như trước VÀ có dòng "bỏ qua"', async () => {
    const { campaign, schedule } = await seed({ scheduleType: 'once', cron: '0 9 5 10 *' });

    await triggerSchedule(schedule);

    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(false);
    expect(await skipRows(campaign.id)).toHaveLength(1);
  });

  it('BẪY: 3 lần bị bỏ qua liên tiếp KHÔNG làm lịch lặp tự tắt khi lượt trước đã xong (dòng "bỏ qua" không tính vào bộ đếm lỗi)', async () => {
    const { campaign, runningRunId, schedule } = await seed();

    await triggerSchedule(schedule);
    await triggerSchedule(schedule);
    await triggerSchedule(schedule);
    expect(await skipRows(campaign.id)).toHaveLength(3);

    // Lượt trước xong; chiến dịch tạm dừng để lần nổ kế tiếp không khởi chạy engine thật (vẫn qua nhánh kiểm
    // bộ đếm — kiểm bộ đếm nằm TRƯỚC khi tạo lượt chạy).
    await db.query(`UPDATE campaign_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`, [runningRunId]);
    await db.query(`UPDATE campaigns SET status = 'paused' WHERE id = $1`, [campaign.id]);

    await triggerSchedule(schedule);

    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(true); // nếu dòng "bỏ qua" bị đếm, lịch đã tự tắt ở đây
    const { rows: autoDisabled } = await db.query(
      `SELECT id FROM campaign_runs WHERE id_campaign = $1 AND run_metadata->>'scheduleAutoDisabled' = 'true'`,
      [campaign.id]
    );
    expect(autoDisabled).toHaveLength(0);
  });

  it('đối chứng: 3 lần HỎNG THẬT liên tiếp vẫn tự tắt lịch (bộ đếm không bị vô hiệu)', async () => {
    const { campaign, runningRunId, schedule } = await seed();
    await db.query(`UPDATE campaign_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`, [runningRunId]);
    for (let i = 0; i < 3; i += 1) {
      await db.query(
        `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, id_schedule, run_type, status, error_message, started_at, completed_at)
         VALUES ($1, $2, $3, 'scheduled', 'failed', 'loi that', NOW() - ($4 || ' minutes')::interval, NOW())`,
        [campaign.id, campaign.id_user, schedule.id, String(10 - i)]
      );
    }

    await triggerSchedule(schedule);

    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(false);
  });
});
