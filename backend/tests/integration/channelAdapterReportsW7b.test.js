/**
 * PLAN_WHATSAPP_DOT3, W7b — các màn báo cáo/giám sát đếm `campaign_channel_messages`
 * (kênh adapter Telegram/WhatsApp), trước đây chỉ đọc email_messages/zalo_messages/customer_journey.
 *
 * Bộ dữ liệu: 3 `sent` telegram + 2 `sent` whatsapp + 1 `failed` telegram + 1 `is_preview` (sent) telegram
 * của user A; 4 `sent` telegram của user B (kiểm cô lập).
 *
 * Covered:
 *   - Giám sát gửi (user): tổng gửi +5, theo kênh telegram 3 / whatsapp 2, failed +1, preview KHÔNG tính,
 *     không thấy dữ liệu của user khác; timeline có cột telegram/whatsapp
 *   - Giám sát gửi (admin): toàn hệ thống (5 + 4), preview không tính
 *   - Dashboard: journeyEvents.telegramSent/whatsappSent, bộ lọc campaignType=telegram/whatsapp/email
 *   - Hồ sơ: "đã gửi hôm nay/tháng" (zaloSent*) cộng tin adapter (cùng nguồn với hạn mức)
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
    const { summary, channels, timeline } = res.body.data;

    expect(byChannel(channels, 'telegram')).toMatchObject({ sent: 3, failed: 1, label: 'Telegram' });
    expect(byChannel(channels, 'whatsapp')).toMatchObject({ sent: 2, failed: 0, label: 'WhatsApp' });
    expect(summary.sent).toBe(5);
    expect(summary.failed).toBe(1);

    const tgTotal = timeline.reduce((s, r) => s + r.telegram, 0);
    const waTotal = timeline.reduce((s, r) => s + r.whatsapp, 0);
    expect(tgTotal).toBe(3);
    expect(waTotal).toBe(2);
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
  it('journeyEvents.telegramSent/whatsappSent + bộ lọc kênh', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const get = (qs) =>
      request(app).get(`/api/dashboard/overview${qs}`).set('Authorization', `Bearer ${token}`);

    const all = await get('');
    expect(all.status).toBe(200);
    expect(all.body.data.journeyEvents).toMatchObject({ telegramSent: 3, whatsappSent: 2 });

    const tg = await get('?campaignType=telegram');
    expect(tg.body.data.filters.campaignType).toBe('telegram');
    expect(tg.body.data.journeyEvents).toMatchObject({ telegramSent: 3, whatsappSent: 0 });

    const wa = await get('?campaignType=whatsapp');
    expect(wa.body.data.journeyEvents).toMatchObject({ telegramSent: 0, whatsappSent: 2 });

    const email = await get('?campaignType=email');
    expect(email.body.data.journeyEvents).toMatchObject({ telegramSent: 0, whatsappSent: 0 });
  });

  it('analytics: timeline có telegramSent/whatsappSent theo ngày', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const res = await request(app)
      .get('/api/dashboard/analytics?period=7d')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const tl = res.body.data.timeline;
    expect(tl.reduce((s, r) => s + r.telegramSent, 0)).toBe(3);
    expect(tl.reduce((s, r) => s + r.whatsappSent, 0)).toBe(2);
  });
});

describe('W7b — hồ sơ: đã gửi hôm nay/tháng', () => {
  it('zaloSentToday/zaloSentMonth cộng 5 tin adapter (không tính preview, failed, user khác)', async () => {
    const { a } = await seed();
    const token = await loginAs(a);
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.zaloSentToday).toBe(5);
    expect(res.body.data.zaloSentMonth).toBe(5);
  });
});
