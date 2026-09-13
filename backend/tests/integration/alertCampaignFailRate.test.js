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

async function insertZaloMessage({
  campaignId, status = 'sent', isPreview = false, createdAt = new Date(),
}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_messages (
       id_campaign, status, is_preview, created_at
     ) VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [campaignId, status, isPreview, createdAt]
  );
  return rows[0].id;
}

async function insertEmailMessage({
  campaignId, status = 'sent', isPreview = false, createdAt = new Date(),
}) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (
       id_campaign, status, is_preview, created_at
     ) VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [campaignId, status, isPreview, createdAt]
  );
  return rows[0].id;
}

const FAIL_RATE_RULE = { code: 'campaign_fail_rate_high', thresholdValue: 0.30, windowMinutes: 60, config: { minRecipients: 20 } };

describe('metricCampaignFailRate — đếm theo cửa sổ từ bảng tin (PLAN 13/09)', () => {
  it('Bẫy 13/09: run running có 12.000 failed_sends cũ nhưng KHÔNG có tin trong 60 phút → skipped (dưới minRecipients), không nổ', async () => {
    const user = await createUser({ username: 'fr-old-failed', withPlan: false });
    const campaignId = await createCampaign(user.id, 'Run 374 cũ');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    // Giả lập run 374: running nhiều ngày, failed_sends = 12299 từ sự cố tuần trước
    await insertRun({
      campaignId, userId: user.id, status: 'running', startedAt: threeDaysAgo, completedAt: null,
      totalRecipients: 71700, successfulSends: 14, failedSends: 12299,
    });

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(true);
    expect(m.total).toBe(0);
    expect(m.failed).toBe(0);

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).toBeNull(); // Không làm nổ hộp thư admin!
  });

  it('Sự cố thật trong cửa sổ: 100 email (20 sent, 80 failed) trong 10 phút qua → nổ cảnh báo, message ghi rõ "Email 80/100 hỏng"', async () => {
    const user = await createUser({ username: 'fr-email-incident', withPlan: false });
    const campaignId = await createCampaign(user.id);

    // 20 email thành công
    for (let i = 0; i < 20; i++) {
      await insertEmailMessage({ campaignId, status: 'sent', createdAt: new Date(Date.now() - 5 * 60 * 1000) });
    }
    // 80 email thất bại
    for (let i = 0; i < 80; i++) {
      await insertEmailMessage({ campaignId, status: 'failed', createdAt: new Date(Date.now() - 5 * 60 * 1000) });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(false);
    expect(m.total).toBe(100);
    expect(m.failed).toBe(80);
    expect(m.rate).toBeCloseTo(0.80, 2);
    expect(m.email).toEqual({ sent: 20, failed: 80, total: 100 });
    expect(m.zalo).toEqual({ sent: 0, failed: 0, total: 0 });

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).not.toBeNull();
    expect(result.measuredValue).toBeCloseTo(0.80, 2);
    expect(result.message).toContain('Tỉ lệ gửi thất bại 80.0% (80/100 đã thử — Email 80/100 hỏng)');
  });

  // Review Claude 13/09: giữ ý của bản sửa 10/09 — chiến dịch continuous bắt đầu nhiều ngày trước
  // mà ĐANG hỏng ngay bây giờ vẫn phải kêu. Luật mới không nhìn campaign_runs nên tự thoả, nhưng
  // phải ghim lại kẻo lần sửa sau quay về lọc theo started_at (bug trước 10/09).
  it('run continuous bắt đầu 3 ngày trước, vẫn running, 30 Zalo hỏng / 5 thành công trong 15 phút qua → VẪN nổ, message "Zalo 30/35 hỏng"', async () => {
    const user = await createUser({ username: 'fr-continuous-now', withPlan: false });
    const campaignId = await createCampaign(user.id);
    await insertRun({
      campaignId,
      userId: user.id,
      status: 'running',
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      totalRecipients: 5000,
      successfulSends: 900,
      failedSends: 100,
    });

    for (let i = 0; i < 5; i++) {
      await insertZaloMessage({ campaignId, status: 'sent', createdAt: new Date(Date.now() - 15 * 60 * 1000) });
    }
    for (let i = 0; i < 30; i++) {
      await insertZaloMessage({ campaignId, status: 'failed', createdAt: new Date(Date.now() - 15 * 60 * 1000) });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(false);
    expect(m.zalo).toEqual({ sent: 5, failed: 30, total: 35 });
    expect(m.rate).toBeCloseTo(30 / 35, 2);

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).not.toBeNull();
    expect(result.message).toContain('Zalo 30/35 hỏng');
  });

  it('Bẫy Zalo: aborted/skipped/queued KHÔNG tính vào mẫu số (chỉ sent + failed)', async () => {
    const user = await createUser({ username: 'fr-zalo-aborted', withPlan: false });
    const campaignId = await createCampaign(user.id);

    // 10 sent, 10 failed
    for (let i = 0; i < 10; i++) {
      await insertZaloMessage({ campaignId, status: 'sent', createdAt: new Date(Date.now() - 10 * 60 * 1000) });
      await insertZaloMessage({ campaignId, status: 'failed', createdAt: new Date(Date.now() - 10 * 60 * 1000) });
    }
    // 50 aborted, 20 queued
    for (let i = 0; i < 50; i++) {
      await insertZaloMessage({ campaignId, status: 'aborted', createdAt: new Date(Date.now() - 10 * 60 * 1000) });
    }
    for (let i = 0; i < 20; i++) {
      await insertZaloMessage({ campaignId, status: 'queued', createdAt: new Date(Date.now() - 10 * 60 * 1000) });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(false);
    expect(m.total).toBe(20); // Chỉ tính 10 + 10, không cộng 70 aborted/queued
    expect(m.failed).toBe(10);
    expect(m.rate).toBeCloseTo(0.50, 2);
    expect(m.zalo).toEqual({ sent: 10, failed: 10, total: 20 });
  });

  it('Bẫy preview: is_preview = true bị loại bỏ ở cả Zalo và Email', async () => {
    const user = await createUser({ username: 'fr-preview-skip', withPlan: false });
    const campaignId = await createCampaign(user.id);

    // 30 tin failed nhưng là preview
    for (let i = 0; i < 15; i++) {
      await insertZaloMessage({ campaignId, status: 'failed', isPreview: true, createdAt: new Date(Date.now() - 5 * 60 * 1000) });
      await insertEmailMessage({ campaignId, status: 'failed', isPreview: true, createdAt: new Date(Date.now() - 5 * 60 * 1000) });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.total).toBe(0);
    expect(m.skipped).toBe(true);
  });

  it('Tin ngoài cửa sổ windowMinutes không được tính', async () => {
    const user = await createUser({ username: 'fr-outside-window', withPlan: false });
    const campaignId = await createCampaign(user.id);
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);

    // 50 email failed từ 2 giờ trước
    for (let i = 0; i < 50; i++) {
      await insertEmailMessage({ campaignId, status: 'failed', createdAt: twoHoursAgo });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.total).toBe(0);
    expect(m.skipped).toBe(true);
  });

  it('Cả hai kênh cùng hoạt động → tách rõ số liệu từng kênh trong message', async () => {
    const user = await createUser({ username: 'fr-both-channels', withPlan: false });
    const campaignId = await createCampaign(user.id);
    const recent = new Date(Date.now() - 15 * 60 * 1000);

    // Zalo: 10 sent, 10 failed (tổng 20)
    for (let i = 0; i < 10; i++) {
      await insertZaloMessage({ campaignId, status: 'sent', createdAt: recent });
      await insertZaloMessage({ campaignId, status: 'failed', createdAt: recent });
    }
    // Email: 20 sent, 10 failed (tổng 30)
    for (let i = 0; i < 20; i++) {
      await insertEmailMessage({ campaignId, status: 'sent', createdAt: recent });
    }
    for (let i = 0; i < 10; i++) {
      await insertEmailMessage({ campaignId, status: 'failed', createdAt: recent });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(false);
    expect(m.total).toBe(50);
    expect(m.failed).toBe(20);
    expect(m.rate).toBeCloseTo(20 / 50, 2);
    expect(m.zalo).toEqual({ sent: 10, failed: 10, total: 20 });
    expect(m.email).toEqual({ sent: 20, failed: 10, total: 30 });

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).not.toBeNull();
    expect(result.message).toContain('Zalo 10/20 hỏng');
    expect(result.message).toContain('Email 10/30 hỏng');
  });

  it('Mẫu số dưới minRecipients → skipped: true, evaluateRuleForTests trả null', async () => {
    const user = await createUser({ username: 'fr-too-few', withPlan: false });
    const campaignId = await createCampaign(user.id);

    // Chỉ có 5 email failed
    for (let i = 0; i < 5; i++) {
      await insertEmailMessage({ campaignId, status: 'failed', createdAt: new Date(Date.now() - 5 * 60 * 1000) });
    }

    const m = await metricCampaignFailRate(60, 20);
    expect(m.skipped).toBe(true);
    expect(m.total).toBe(5);

    const result = await evaluateRuleForTests(FAIL_RATE_RULE);
    expect(result).toBeNull();
  });
});
