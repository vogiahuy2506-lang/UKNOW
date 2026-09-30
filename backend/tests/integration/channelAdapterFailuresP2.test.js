/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 4 — danh sách lỗi TỪNG người nhận của kênh adapter
 * (GET /api/delivery-monitor/runs/:runId/failures) đọc từ campaign_channel_messages.
 *
 * Covered:
 *   - lỗi hard (WhatsApp) hiện, có nhãn kênh `channel`
 *   - người bị lỗi tạm 3 lần: 2 dòng `transient_retry` KHÔNG tính, chỉ dòng cuối `transient` → 1 mục, count 1
 *   - người lỗi tạm 1 lần rồi gửi được (dòng sent) → KHÔNG hiện
 *   - lỗi rate_limit từng dừng node rồi resume gửi thành công (id_node NULL) → KHÔNG hiện
 *   - dòng is_preview không hiện
 *   - run của user khác → 404
 *   - "chưa gửi được" ở overview (PR-4b) đếm theo NGƯỜI: không cộng dòng transient_retry, không cộng người đã gửi
 *     được sau lỗi rate_limit từng dừng node
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

async function seedRun(userId, type = 'whatsapp') {
  const camp = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [userId, `C-${type}`, type]
  );
  const run = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at, total_recipients, successful_sends, failed_sends)
     VALUES ($1, 'completed', NOW(), 10, 5, 1) RETURNING id`,
    [camp.rows[0].id]
  );
  return { campaignId: camp.rows[0].id, runId: run.rows[0].id };
}

async function ccm({ ownerId, campaignId, runId, channel = 'whatsapp', recipient, status, category = null, message = null, isPreview = false }) {
  await db.query(
    `INSERT INTO campaign_channel_messages
       (id_campaign, id_run, channel, recipient_key, step_index, status, error_category, error_message,
        is_preview, workspace_owner_id, actor_user_id, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, $5::text, $6, $7, $8, $9, $9, now(), now(), now())`,
    [campaignId, runId, channel, recipient, status, category, message, isPreview, ownerId]
  );
}

describe('P2 — lỗi từng người nhận kênh adapter', () => {
  it('chỉ lỗi cuối cùng; nhãn kênh; bỏ retry/đã gửi/preview; cô lập user; overview không cộng transient_retry', async () => {
    const owner = await createUser({ username: 'p2_owner', withPlan: false });
    const other = await createUser({ username: 'p2_other', withPlan: false });
    const { campaignId, runId } = await seedRun(owner.id);
    const base = { ownerId: owner.id, campaignId, runId };

    await ccm({ ...base, recipient: '84900000001', status: 'failed', category: 'hard', message: 'Số không dùng WhatsApp' });
    // 84900000002: 2 lần thử được thử lại + lần cuối bỏ cuộc
    await ccm({ ...base, recipient: '84900000002', status: 'failed', category: 'transient_retry', message: '[lần 1/3] Timed Out' });
    await ccm({ ...base, recipient: '84900000002', status: 'failed', category: 'transient_retry', message: '[lần 2/3] Timed Out' });
    await ccm({ ...base, recipient: '84900000002', status: 'failed', category: 'transient', message: '[lần 3/3] Timed Out' });
    // 84900000003: lỗi tạm 1 lần rồi gửi được
    await ccm({ ...base, recipient: '84900000003', status: 'failed', category: 'transient_retry', message: '[lần 1/3] Timed Out' });
    await ccm({ ...base, recipient: '84900000003', status: 'sent' });
    // 84900000004: rate_limit dừng node, resume gửi được
    await ccm({ ...base, recipient: '84900000004', status: 'failed', category: 'rate_limit', message: 'rate-overlimit' });
    await ccm({ ...base, recipient: '84900000004', status: 'sent' });
    // preview không hiện
    await ccm({ ...base, recipient: '84900000005', status: 'failed', category: 'hard', message: 'x', isPreview: true });

    const token = await loginAs(owner);
    const res = await request(app)
      .get(`/api/delivery-monitor/runs/${runId}/failures`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const failures = res.body.data.failures.filter((f) => f.channel === 'whatsapp');
    const byRecipient = Object.fromEntries(failures.map((f) => [f.recipient, f]));

    expect(Object.keys(byRecipient).sort()).toEqual(['84900000001', '84900000002']);
    // Lý do = "loại lỗi: nội dung" của lần thử lỗi cuối; attempts đếm dòng lỗi CUỐI (transient_retry không tính).
    expect(byRecipient['84900000001']).toMatchObject({
      channel: 'whatsapp', reason: 'hard: Số không dùng WhatsApp', attempts: 1,
    });
    expect(byRecipient['84900000002']).toMatchObject({ channel: 'whatsapp', attempts: 1 });
    expect(byRecipient['84900000002'].reason).toMatch(/^transient: \[lần 3\/3\]/);

    // Overview: "chưa gửi được" của kênh đếm theo NGƯỜI = 84900000001 (hard) + 84900000002 (transient cuối) = 2.
    // 84900000004 từng lỗi rate_limit rồi resume gửi được → không còn là lỗi (đếm theo dòng sẽ ra 3, không lọc
    // transient_retry sẽ ra 6). Đã gửi: 84900000003 (sau 1 lần thử lại) + 84900000004 = 2.
    const overview = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(overview.status).toBe(200);
    const wa = overview.body.data.today.byChannel.find((c) => c.channel === 'whatsapp');
    expect(wa).toEqual({ channel: 'whatsapp', sent: 2, failed: 2 });
    expect(overview.body.data.runs[0]).toMatchObject({ runId: Number(runId), sent: 2, failed: 2 });

    // User khác không xem được run này.
    const otherToken = await loginAs(other);
    const forbidden = await request(app)
      .get(`/api/delivery-monitor/runs/${runId}/failures`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(404);
  });
});
