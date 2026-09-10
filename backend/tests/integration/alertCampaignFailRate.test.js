/**
 * Integration tests cho metricCampaignFailRate + rule campaign_fail_rate_high.
 *
 * PR-2 của plan giám sát Zalo mù (_internal/PLAN_GIAM_SAT_ZALO_MU_2026-09-10.md):
 * cảnh báo này đã tồn tại và chạy mỗi lượt cron, nhưng không bao giờ kêu vì HAI lỗi
 * cộng lại — lọc `started_at` làm chiến dịch continuous (bắt đầu 1 lần rồi chạy hàng
 * tuần) rơi khỏi cửa sổ 60 phút và không bao giờ quay lại; mẫu số `total_recipients`
 * là cả danh sách chưa gửi, không phải số đã thử, nên chiến dịch danh sách càng dài
 * càng khó kêu. Test dùng `evaluateRuleForTests` (helper nội bộ, không qua vòng lặp
 * cron/quiet-hours/email) để cô lập đúng logic công thức + cửa sổ.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { metricCampaignFailRate } from '../../src/repositories/admin/alert.repository.js';
import { evaluateRuleForTests } from '../../src/services/admin/alertEvaluator.service.js';

beforeEach(async () => {
  await truncateAll();
});

async function createCampaign(userId, name = 'C') {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, 'zalo', 'running', NOW()) RETURNING id`,
    [userId, name]
  );
  return rows[0].id;
}

async function insertRun({
  campaignId, userId, status = 'completed', startedAt = new Date(), completedAt = null,
  totalRecipients = 0, successfulSends = 0, failedSends = 0,
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (
       id_campaign, workspace_owner_id, status, started_at, completed_at,
       total_recipients, successful_sends, failed_sends
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [campaignId, userId, status, startedAt, completedAt, totalRecipients, successfulSends, failedSends]
  );
  return rows[0].id;
}

const FAIL_RATE_RULE = { code: 'campaign_fail_rate_high', thresholdValue: 0.30, windowMinutes: 60, config: { minRecipients: 20 } };

describe('metricCampaignFailRate — cửa sổ lọc + mẫu số (PR-2)', () => {
  it('continuous run bắt đầu 3 ngày trước, vẫn running → ĐƯỢC đánh giá (bug cũ: lọc started_at làm rơi khỏi cửa sổ vĩnh viễn)', async () => {
    const user = await createUser({ username: 'fr-continuous', withPlan: false });
    const campaignId = await createCampaign(user.id, 'Continuous 3 ngày');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await insertRun({
      campaignId, userId: user.id, status: 'running', startedAt: threeDaysAgo, completedAt: null,
      totalRecipients: 71700, successfulSends: 4, failedSends: 6173,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(false);
    expect(m.failed).toBe(6173);
    // Mẫu số = đã thử (4 + 6173), KHÔNG phải total_recipients (71700).
    expect(m.total).toBe(4 + 6173);
    expect(m.rate).toBeCloseTo(6173 / 6177, 3);
  });

  it('run 71.700 người, 4 thành công, 6.173 hỏng → tỉ lệ 99,9%, vượt ngưỡng 30%, cảnh báo kêu', async () => {
    const user = await createUser({ username: 'fr-9990', withPlan: false });
    const campaignId = await createCampaign(user.id);
    await insertRun({
      campaignId, userId: user.id, status: 'running',
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      totalRecipients: 71700, successfulSends: 4, failedSends: 6173,
    });

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).not.toBeNull();
    expect(result.measuredValue).toBeCloseTo(0.999, 2);
    expect(result.message).toContain('đã thử');
    expect(result.message).toContain('6173/6177');
  });

  it('run 1.000 người, 900 thành công, 100 hỏng → tỉ lệ 10%, KHÔNG kêu (dưới ngưỡng)', async () => {
    const user = await createUser({ username: 'fr-10pct', withPlan: false });
    const campaignId = await createCampaign(user.id);
    await insertRun({
      campaignId, userId: user.id, status: 'completed', completedAt: new Date(),
      totalRecipients: 1000, successfulSends: 900, failedSends: 100,
    });

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).toBeNull();
  });

  it('run mới bắt đầu: 10.000 người, 5 thành công, 0 hỏng → mẫu số 5 < 20, bỏ qua, không kêu ẩu', async () => {
    const user = await createUser({ username: 'fr-toosmall', withPlan: false });
    const campaignId = await createCampaign(user.id);
    await insertRun({
      campaignId, userId: user.id, status: 'running', startedAt: new Date(),
      totalRecipients: 10000, successfulSends: 5, failedSends: 0,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(true);
    expect(m.total).toBe(5);

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).toBeNull();
  });

  it('run cũ: 0 thành công, 0 hỏng → không chia cho 0, không vỡ', async () => {
    const user = await createUser({ username: 'fr-zero', withPlan: false });
    const campaignId = await createCampaign(user.id);
    await insertRun({
      campaignId, userId: user.id, status: 'completed',
      completedAt: new Date(Date.now() - 30 * 60 * 1000),
      totalRecipients: 0, successfulSends: 0, failedSends: 0,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(true);
    expect(m.rate).toBe(0);
    expect(Number.isFinite(m.rate)).toBe(true);
  });

  it('run completed ngoài cửa sổ và không còn running → không được tính (đúng thiết kế, không phải bug)', async () => {
    const user = await createUser({ username: 'fr-outside', withPlan: false });
    const campaignId = await createCampaign(user.id);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await insertRun({
      campaignId, userId: user.id, status: 'completed',
      startedAt: threeDaysAgo, completedAt: threeDaysAgo,
      totalRecipients: 5000, successfulSends: 100, failedSends: 4000,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.total).toBe(0);
    expect(m.skipped).toBe(true);
  });

  it('nhiều run cùng thoả điều kiện → SUM gộp đúng, không phải chỉ lấy 1 run', async () => {
    const user = await createUser({ username: 'fr-multi', withPlan: false });
    const campaignA = await createCampaign(user.id, 'A');
    const campaignB = await createCampaign(user.id, 'B');
    await insertRun({
      campaignId: campaignA, userId: user.id, status: 'running', startedAt: new Date(),
      totalRecipients: 500, successfulSends: 50, failedSends: 450,
    });
    await insertRun({
      campaignId: campaignB, userId: user.id, status: 'completed', completedAt: new Date(),
      totalRecipients: 500, successfulSends: 400, failedSends: 100,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.total).toBe(50 + 450 + 400 + 100);
    expect(m.failed).toBe(450 + 100);
  });
});
