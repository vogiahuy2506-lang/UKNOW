/**
 * PLAN_WHATSAPP_DOT3, W7b — các màn báo cáo/giám sát đếm `campaign_channel_messages`
 * (kênh adapter Telegram/WhatsApp), trước đây chỉ đọc email_messages/zalo_messages/customer_journey.
 *
 * Bộ dữ liệu: 3 `sent` telegram + 2 `sent` whatsapp + 1 `failed` telegram + 1 `is_preview` (sent) telegram
 * của user A; 4 `sent` telegram của user B (kiểm cô lập).
 *
 * Covered:
 *   - Giám sát gửi (user): tổng gửi +5, theo kênh telegram 3 / whatsapp 2, failed +1, preview KHÔNG tính,
 *     không thấy dữ liệu của user khác; biểu đồ giờ có dòng telegram/whatsapp
 *   - Giám sát gửi (admin): toàn hệ thống (5 + 4), preview không tính
 *   - Dashboard: sent.byChannel telegram/whatsapp + dailySent, bộ lọc campaignType=telegram/whatsapp/email
 *   - Hồ sơ: telegramSentCycle/whatsappSentCycle theo KỲ gói (P10: hạn mức riêng; messagingSent* chỉ còn Zalo, không cộng tin adapter)
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

async function createCampaign({ userId, type }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [userId, `C-${type}`, type]
  );
  return rows[0].id;
}

async function createRun(campaignId) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at, total_recipients, successful_sends, failed_sends)
     VALUES ($1, 'completed', NOW(), 10, 5, 1) RETURNING id`,
    [campaignId]
  );
  return rows[0].id;
}

// sent_at luôn = now() kể cả dòng failed: ghim rằng các phép đếm 'sent' phải lọc theo status chứ không
// chỉ dựa vào sent_at khác NULL (dòng failed có thể mang sent_at nếu ghi đè sau này).
async function insertCcm({ ownerId, campaignId, runId, channel, status = 'sent', isPreview = false, n = 1 }) {
  for (let i = 0; i < n; i += 1) {
    await db.query(
      `INSERT INTO campaign_channel_messages
         (id_campaign, id_run, channel, recipient_key, status, is_preview, workspace_owner_id, actor_user_id,
          sent_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::text, $6, $7, $7,
               now(), now(), now())`,
      [campaignId, runId, channel, `r-${channel}-${status}-${isPreview}-${i}-${Math.random()}`, status, isPreview, ownerId]
    );
  }
}

async function seed() {
  const a = await createUser({ username: 'w7b_a', withPlan: false });
  const b = await createUser({ username: 'w7b_b', withPlan: false });
  const tgA = await createCampaign({ userId: a.id, type: 'telegram' });
  const waA = await createCampaign({ userId: a.id, type: 'whatsapp' });
  const tgB = await createCampaign({ userId: b.id, type: 'telegram' });
  const runTgA = await createRun(tgA);
  const runWaA = await createRun(waA);
  const runTgB = await createRun(tgB);

  await insertCcm({ ownerId: a.id, campaignId: tgA, runId: runTgA, channel: 'telegram', n: 3 });
  await insertCcm({ ownerId: a.id, campaignId: waA, runId: runWaA, channel: 'whatsapp', n: 2 });
  await insertCcm({ ownerId: a.id, campaignId: tgA, runId: runTgA, channel: 'telegram', status: 'failed', n: 1 });
  await insertCcm({ ownerId: a.id, campaignId: tgA, runId: runTgA, channel: 'telegram', isPreview: true, n: 1 });
  await insertCcm({ ownerId: b.id, campaignId: tgB, runId: runTgB, channel: 'telegram', n: 4 });
  return { a, b };
}

const byChannel = (channels, key) => channels.find((c) => c.channel === key);

describe('W7b — giám sát gửi của user', () => {
  it('tổng gửi +5, theo kênh telegram 3 / whatsapp 2, failed +1, preview KHÔNG tính, cô lập user', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // PR-4b: trang chỉ còn "hôm nay" (today) + biểu đồ 24 giờ (hourly) — hết `channels` / `summary` / `timeline`.
    const { today, hourly } = res.body.data;

    expect(byChannel(today.byChannel, 'telegram')).toMatchObject({ sent: 3, failed: 1 });
    expect(byChannel(today.byChannel, 'whatsapp')).toMatchObject({ sent: 2, failed: 0 });
    expect(today.sent).toBe(5);
    expect(today.failed).toBe(1);

    const hourlySent = (channel) => hourly.filter((r) => r.channel === channel).reduce((s, r) => s + r.sent, 0);
    expect(hourlySent('telegram')).toBe(3);
    expect(hourlySent('whatsapp')).toBe(2);
  });
});

describe('W7b — giám sát gửi của admin', () => {
  it('đếm toàn hệ thống (telegram 3 + 4, whatsapp 2), preview không tính', async () => {
    await seed();
    const admin = await createUser({ role: 'admin', username: 'w7b_admin' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { summary, channels, timeline } = res.body.data;

    expect(byChannel(channels, 'telegram')).toMatchObject({ sent: 7, failed: 1 });
    expect(byChannel(channels, 'whatsapp')).toMatchObject({ sent: 2, failed: 0 });
    expect(summary.sent).toBe(9);
    expect(timeline.reduce((s, r) => s + r.telegram, 0)).toBe(7);
  });
});

describe('W7b — dashboard', () => {
  it('sent.byChannel telegram/whatsapp + bộ lọc kênh (PR-5: đọc campaign_channel_messages qua sendStats)', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const get = (qs) =>
      request(app).get(`/api/dashboard/overview${qs}`).set('Authorization', `Bearer ${token}`);
    const sentOf = (res, channel) => res.body.data.sent.byChannel.find((row) => row.channel === channel)?.sent;

    const all = await get('');
    expect(all.status).toBe(200);
    expect(sentOf(all, 'telegram')).toBe(3);
    expect(sentOf(all, 'whatsapp')).toBe(2);
    expect(all.body.data.sent.total).toBe(5);
    expect(all.body.data.failed.total).toBe(1);

    const tg = await get('?campaignType=telegram');
    expect(tg.body.data.filters.campaignType).toBe('telegram');
    expect(tg.body.data.sent.byChannel).toEqual([{ channel: 'telegram', sent: 3 }]);

    const wa = await get('?campaignType=whatsapp');
    expect(wa.body.data.sent.byChannel).toEqual([{ channel: 'whatsapp', sent: 2 }]);

    const email = await get('?campaignType=email');
    expect(email.body.data.sent.total).toBe(0);
  });

  it('analytics: dailySent có cột telegram/whatsapp theo ngày', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const res = await request(app)
      .get('/api/dashboard/analytics?period=7d')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const days = res.body.data.dailySent;
    expect(days.reduce((s, r) => s + r.telegram, 0)).toBe(3);
    expect(days.reduce((s, r) => s + r.whatsapp, 0)).toBe(2);
  });
});

describe('W7b/P10 — hồ sơ: đã gửi trong kỳ / hôm nay', () => {
  // PLAN_SO_LIEU_DUNG_GON_KHOP PR-3: hồ sơ đếm theo KỲ của gói bằng chính hàm của cổng chặn — nên user phải có gói.
  // P10: Telegram/WhatsApp có hạn mức riêng nên messagingSent*/zaloSent* chỉ còn Zalo; tin adapter hiện ở telegramSentCycle/whatsappSentCycle.
  it('P10: tin adapter KHÔNG còn cộng vào messagingSent*/zaloSent*; telegramSentCycle/whatsappSentCycle đếm theo kỳ gói (không tính preview, failed, user khác)', async () => {
    const { a } = await seed();
    // Chu kỳ gói chỉ dựng được khi user CÓ gói (seed() cố ý không gán) — gán gói mở, kích hoạt hôm qua.
    const { rows: planRows } = await db.query(
      `INSERT INTO plans (name, price, monthly_telegram_limit, monthly_whatsapp_limit, is_active)
       VALUES ('P10 profile', 1000, 300, 0, true) RETURNING id`
    );
    await db.query(
      `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '30 days',
              plan_activated_at = NOW() - INTERVAL '1 day' WHERE id = $2`,
      [planRows[0].id, a.id]
    );
    const token = await loginAs(a);
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.messagingSentCycle).toBe(0);
    expect(res.body.data.zaloSentMonth).toBe(0);
    expect(res.body.data.telegramSentCycle).toBe(3);
    expect(res.body.data.whatsappSentCycle).toBe(2);
    // Trần riêng của gói đi cùng hồ sơ (0 = gói không có kênh, KHÔNG bị đổi thành null).
    expect(res.body.data.monthlyTelegramLimit).toBe(300);
    expect(res.body.data.monthlyWhatsappLimit).toBe(0);
  });
});
