/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04 PR-2 (mục 4.1) — chặn lịch chồng nhau của CÙNG một chiến dịch,
 * Postgres THẬT (estimateForCampaign thật đọc node + tài khoản + hạn mức từ CSDL).
 *
 * Chiến dịch seed: 1 node Email, 200 địa chỉ nhập tay, tài khoản email có trần 50 thư/ngày. Ngày 1 đi 50, ngày 2 đi 50,
 * ngày 3 đi 50, ngày 4 đi 50 (sau nửa đêm) → từ lúc bắt đầu 06:00 mất ≈ 3 ngày 18 giờ. Hai lịch `once` cách nhau 1 ngày
 * phải bị chặn; cách nhau 6 ngày thì không.
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

const vnParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric', year: 'numeric',
  }).formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});
  return parts;
};

/** Cron `once` 06:00 giờ VN, `offsetDays` ngày kể từ hôm nay. */
const onceCron = (offsetDays) => {
  const target = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  const { day, month } = vnParts(target);
  return `0 6 ${day} ${month} *`;
};
// `once` qua năm bị validator từ chối ("đã qua trong năm") → cuối năm bỏ qua cả bộ để không đỏ giả.
const crossesYear = vnParts(new Date(Date.now() + 9 * 24 * 3600 * 1000)).year !== vnParts(new Date()).year;
const suite = crossesYear ? describe.skip : describe;

async function seedCampaign(owner, config = null) {
  const { rows: emailRows } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode, user_daily_send_limit)
     VALUES ($1, 'Sender', 'sender@brand.test', 'sender@brand.test', 'active', 'smtp', 50) RETURNING id`,
    [owner.id]
  );
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Chiến dịch 4 ngày', 'active') RETURNING id`,
    [owner.id]
  );
  const campaignId = rows[0].id;
  const emails = Array.from({ length: 200 }, (_, i) => `khach${i}@x.vn`).join('\n');
  await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gửi email', $2::jsonb, 1)`,
    [campaignId, JSON.stringify(config || {
      recipientSource: 'manual', recipientEmails: emails, fromEmailId: String(emailRows[0].id),
    })]
  );
  return campaignId;
}

const payload = (campaignId, extra = {}) => ({
  campaignId, scheduleName: 'Lịch', scheduleType: 'once', cronExpression: onceCron(2), ...extra,
});
const countSchedules = async (campaignId) => (await db.query(
  'SELECT count(*)::int AS n FROM campaign_schedules WHERE id_campaign = $1', [campaignId]
)).rows[0].n;

suite('chặn lịch chồng nhau (PLAN_UOC_TINH 4.1)', () => {
  it('hai lịch once cách nhau 1 ngày cho chiến dịch ~3,75 ngày → lịch thứ hai 409 SCHEDULE_OVERLAP, không tạo dòng', async () => {
    const owner = await createUser({ email: 'ov-a@test.com', username: 'ov_a' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner);
    const post = (body) => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(body);

    const first = await post(payload(campaignId));
    expect(first.status).toBe(201);
    const second = await post(payload(campaignId, { cronExpression: onceCron(3) }));

    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      success: false,
      code: 'SCHEDULE_OVERLAP',
      message: expect.stringContaining('sẽ bị bỏ qua'),
      overlap: {
        previousFireAt: expect.any(String),
        estimatedFinishAt: expect.any(String),
        nextFireAt: expect.any(String),
        scheduleIds: [Number(first.body.data.id)], // cột bigint: `data.id` ra chuỗi, scheduleIds ra số
      },
      suggestions: ['use_steps', 'add_accounts', 'spread_schedule'],
    });
    const { previousFireAt, estimatedFinishAt, nextFireAt } = second.body.overlap;
    expect(new Date(nextFireAt).getTime() - new Date(previousFireAt).getTime()).toBe(24 * 3600 * 1000);
    expect(new Date(estimatedFinishAt).getTime()).toBeGreaterThan(new Date(nextFireAt).getTime());
    expect(await countSchedules(campaignId)).toBe(1);
  });

  it('lịch thứ hai cách 6 ngày (> thời lượng chạy) → 201', async () => {
    const owner = await createUser({ email: 'ov-b@test.com', username: 'ov_b' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner);
    const post = (body) => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(body);

    expect((await post(payload(campaignId))).status).toBe(201);
    expect((await post(payload(campaignId, { cronExpression: onceCron(8) }))).status).toBe(201);
    expect(await countSchedules(campaignId)).toBe(2);
  });

  it('lịch daily cho chiến dịch dài hơn 1 ngày → chồng chính nó → 409', async () => {
    const owner = await createUser({ email: 'ov-c@test.com', username: 'ov_c' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner);
    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`)
      .send(payload(campaignId, { scheduleType: 'daily', cronExpression: '0 6 * * *' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SCHEDULE_OVERLAP');
  });

  it('bật lại một lịch tắt làm chồng lịch đang bật → PATCH 409, lịch vẫn tắt; lịch TẮT thì tạo được', async () => {
    const owner = await createUser({ email: 'ov-d@test.com', username: 'ov_d' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner);
    const post = (body) => request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`).send(body);

    expect((await post(payload(campaignId))).status).toBe(201);
    const draft = await post(payload(campaignId, { cronExpression: onceCron(3), enabled: false }));
    expect(draft.status).toBe(201);

    const patch = await request(app).patch(`/api/campaign-schedules/${draft.body.data.id}`)
      .set('Authorization', `Bearer ${token}`).send({ enabled: true });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('SCHEDULE_OVERLAP');
    expect((await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [draft.body.data.id])).rows[0].enabled).toBe(false);
  });

  it('hai lịch CŨ đã chồng nhau từ trước (chèn thẳng DB) KHÔNG chặn lịch mới xa hơn', async () => {
    const owner = await createUser({ email: 'ov-e@test.com', username: 'ov_e' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner);
    for (const offset of [2, 3]) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, schedule_name, schedule_type, cron_expression, enabled)
         VALUES ($1, $2, 'cũ', 'once', $3, true)`,
        [campaignId, owner.id, onceCron(offset)]
      );
    }
    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`)
      .send(payload(campaignId, { cronExpression: onceCron(8) }));
    expect(res.status).toBe(201);
  });

  it('không đếm được người nhận (nguồn node không có) → KHÔNG chặn, 201 kèm warnings recipient_count_unknown', async () => {
    const owner = await createUser({ email: 'ov-f@test.com', username: 'ov_f' });
    const token = await loginAs(owner);
    const campaignId = await seedCampaign(owner, { recipientSource: 'node', recipientNodeId: '' });
    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${token}`)
      .send(payload(campaignId, { scheduleType: 'daily', cronExpression: '0 6 * * *' }));
    expect(res.status).toBe(201);
    expect(res.body.warnings.map((w) => w.code)).toContain('recipient_count_unknown');
  });
});
