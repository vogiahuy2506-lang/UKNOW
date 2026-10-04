/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04 PR-1 — `GET /api/campaigns/:id/estimate` trên Postgres thật.
 *
 * Chiến dịch seed: trigger → email (3 thư nhập tay, tài khoản có trần ngày 2) → Zalo cá nhân (2 SĐT nhập tay,
 * tài khoản có trần ngày 100, đã gửi 1 tin hôm nay) → Zalo nhóm (2 nhóm, cùng tài khoản — dùng lại nick đầu).
 * Kiểm: hình dạng JSON, đếm người nhận từ CSDL thật, tài khoản + trần ngày + đã gửi hôm nay đọc từ CSDL, tôn trọng
 * quyền (người ngoài workspace → 404), chiến dịch khác đang chạy dùng chung nick → shared_account.
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

async function insertNode(campaignId, subtype, config, order, type = 'action') {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, $2, $3, $3, $4::jsonb, $5) RETURNING id`,
    [campaignId, type, subtype, JSON.stringify(config), order]
  );
  return rows[0].id;
}

async function connectNodes(campaignId, from, to) {
  await db.query(
    `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id) VALUES ($1, $2, $3)`,
    [campaignId, from, to]
  );
}

async function seedCampaign(owner, { name = 'Chiến dịch ước tính' } = {}) {
  const { rows: emailRows } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode, user_daily_send_limit)
     VALUES ($1, 'Sender', 'sender@brand.test', 'sender@brand.test', 'active', 'smtp', 2) RETURNING id`,
    [owner.id]
  );
  const { rows: zaloRows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default, user_daily_send_limit)
     VALUES ($1, 'Nick bán hàng', 'connected', true, true, 100) RETURNING id`,
    [owner.id]
  );
  const zaloId = zaloRows[0].id;
  const { rows: campaignRows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'active') RETURNING id`,
    [owner.id, name]
  );
  const campaignId = campaignRows[0].id;
  const trigger = await insertNode(campaignId, 'start', {}, 1, 'trigger');
  const mail = await insertNode(campaignId, 'send_email', {
    recipientSource: 'manual', recipientEmails: 'a@x.vn\nb@x.vn\nc@x.vn',
  }, 2);
  const personal = await insertNode(campaignId, 'send_zalo_personal', {
    zaloAccountId: String(zaloId), zaloRecipientType: 'phone', zaloRecipientSource: 'manual',
    zaloRecipientPhones: '0901000001\n0901000002',
  }, 3);
  const group = await insertNode(campaignId, 'send_zalo_group', {
    zaloAccountId: '99999', zaloGroupSource: 'manual', zaloGroupIds: 'g1,g2',
  }, 4);
  await connectNodes(campaignId, trigger, mail);
  await connectNodes(campaignId, mail, personal);
  await connectNodes(campaignId, personal, group);
  return { campaignId, emailId: emailRows[0].id, zaloId, nodes: { trigger, mail, personal, group } };
}

const futureStart = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

describe('GET /api/campaigns/:id/estimate', () => {
  it('trả hình dạng JSON ổn định; đếm người nhận, tài khoản và trần ngày từ CSDL; nick node nhóm dùng lại nick đầu', async () => {
    const owner = await createUser({ username: 'chuuoctinh', role: 'user' });
    const seeded = await seedCampaign(owner);
    // Hôm nay nick đã gửi 1 tin (đếm vào trần ngày 100 — chỉ áp khi bắt đầu hôm nay).
    await db.query(
      `INSERT INTO zalo_messages (account_id, tracking_metadata, is_preview, sent_at, tracking_token)
       VALUES ($1, '{"status":"sent"}'::jsonb, false, (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'est_' || gen_random_uuid())`,
      [seeded.zaloId]
    );
    const token = await loginAs(owner);

    const res = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(Object.keys(data).sort()).toEqual([
      'accounts', 'finishAtEarliest', 'finishAtLatest', 'finishAtTypical', 'perDay', 'perNode', 'startAt', 'totalActions', 'warnings',
    ]);
    expect(data.totalActions).toBe(3 + 2 + 2); // 3 thư + 2 tin cá nhân + 2 tin nhóm
    expect(data.perNode.map((n) => [String(n.nodeId), n.channel, n.recipients, n.actions])).toEqual([
      [String(seeded.nodes.mail), 'email', 3, 3],
      [String(seeded.nodes.personal), 'zalo_personal', 2, 2],
      [String(seeded.nodes.group), 'zalo_group', 2, 2],
    ]);
    // Node nhóm có zaloAccountId riêng (99999, không tồn tại) nhưng engine dùng lại nick của node cá nhân trước nó.
    expect(data.perNode[2].accounts).toEqual([`zalo:${seeded.zaloId}`]);
    const byKey = Object.fromEntries(data.accounts.map((a) => [a.key, a]));
    expect(byKey[`zalo:${seeded.zaloId}`]).toEqual({
      key: `zalo:${seeded.zaloId}`, channel: 'zalo', label: 'Nick bán hàng', dailyLimit: 100, sentToday: 1,
    });
    expect(byKey[`email:${seeded.emailId}`]).toMatchObject({ channel: 'email', label: 'sender@brand.test', dailyLimit: 2 });
    const codes = data.warnings.map((w) => w.code);
    expect(codes).toContain('zalo_phone_lookup_unmodeled');
    // Trần email 2 thư/ngày, có 3 thư → chạm trần, dồn sang ngày sau.
    expect(codes).toContain('account_daily_limit');
    expect(new Date(data.finishAtLatest).getTime()).toBeGreaterThan(new Date(data.startAt).getTime());
    expect(new Date(data.finishAtEarliest).getTime()).toBeLessThanOrEqual(new Date(data.finishAtLatest).getTime());
  });

  it('startAt ở ngày khác → "đã gửi hôm nay" KHÔNG trừ vào ngày đầu; startAt quá khứ → bây giờ', async () => {
    const owner = await createUser({ username: 'chuuoctinh2', role: 'user' });
    const seeded = await seedCampaign(owner);
    const token = await loginAs(owner);
    const future = futureStart();
    const res = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .query({ startAt: future })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.startAt).toBe(future);

    const past = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .query({ startAt: '2020-01-01T00:00:00Z' })
      .set('Authorization', `Bearer ${token}`);
    expect(past.status).toBe(200);
    expect(new Date(past.body.data.startAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('startAt sai định dạng → 400; id không phải số → 400; chiến dịch không tồn tại → 404', async () => {
    const owner = await createUser({ username: 'chuuoctinh3', role: 'user' });
    const seeded = await seedCampaign(owner);
    const token = await loginAs(owner);
    const auth = { Authorization: `Bearer ${token}` };

    const bad = await request(app).get(`/api/campaigns/${seeded.campaignId}/estimate`).query({ startAt: 'khong-phai-ngay' }).set(auth);
    expect(bad.status).toBe(400);
    const badId = await request(app).get('/api/campaigns/abc/estimate').set(auth);
    expect(badId.status).toBe(400);
    const missing = await request(app).get('/api/campaigns/99999999/estimate').set(auth);
    expect(missing.status).toBe(404);
  });

  it('người ngoài workspace → 404; không có token → 401', async () => {
    const owner = await createUser({ username: 'chuuoctinh4', role: 'user' });
    const stranger = await createUser({ username: 'nguoila', role: 'user' });
    const seeded = await seedCampaign(owner);
    const strangerToken = await loginAs(stranger);

    const denied = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(denied.status).toBe(404);

    const anon = await request(app).get(`/api/campaigns/${seeded.campaignId}/estimate`);
    expect(anon.status).toBe(401);
  });

  it('chiến dịch KHÁC của cùng chủ đang chạy trên cùng nick → cảnh báo shared_account (không cộng vào số)', async () => {
    const owner = await createUser({ username: 'chuuoctinh5', role: 'user' });
    const seeded = await seedCampaign(owner);
    const { rows } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Đang chiếm nick', 'active') RETURNING id`,
      [owner.id]
    );
    const otherId = rows[0].id;
    await insertNode(otherId, 'send_zalo_personal', {
      zaloAccountId: String(seeded.zaloId), zaloRecipientSource: 'manual', zaloRecipientPhones: '0902000001',
    }, 1);
    await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, started_at)
       VALUES ($1, $2, 'manual', 'running', NOW())`,
      [otherId, owner.id]
    );
    const token = await loginAs(owner);

    const res = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const shared = res.body.data.warnings.find((w) => w.code === 'shared_account');
    expect(shared.params.accountKey).toBe(`zalo:${seeded.zaloId}`);
    expect(shared.params.campaigns).toEqual([{ id: Number(otherId), name: 'Đang chiếm nick', reason: 'running' }]);
    expect(res.body.data.totalActions).toBe(7);
  });

  it('tài khoản email từng bị máy chủ chặn: đếm lượt chạy 30 ngày (id lưu dạng số HOẶC chuỗi), bỏ lượt quá 30 ngày và tài khoản khác', async () => {
    const owner = await createUser({ username: 'chuuoctinh6', role: 'user' });
    const seeded = await seedCampaign(owner);
    const insertRun = (settingId, startedAtSql, at) => db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, started_at, run_metadata)
       VALUES ($1, $2, 'manual', 'completed', ${startedAtSql}, $3::jsonb)`,
      [seeded.campaignId, owner.id, JSON.stringify({ emailRateLimitSettingId: settingId, emailRateLimitAt: at })]
    );
    await insertRun(seeded.emailId, `NOW() - INTERVAL '2 days'`, '2026-10-03T10:30:00.000+07:00'); // số
    await insertRun(String(seeded.emailId), `NOW() - INTERVAL '10 days'`, '2026-09-25T09:00:00.000+07:00'); // chuỗi
    await insertRun(seeded.emailId, `NOW() - INTERVAL '45 days'`, '2026-08-20T09:00:00.000+07:00'); // quá 30 ngày
    await insertRun(seeded.emailId + 1000, `NOW() - INTERVAL '1 day'`, '2026-10-03T09:00:00.000+07:00'); // tài khoản khác
    const token = await loginAs(owner);

    const res = await request(app)
      .get(`/api/campaigns/${seeded.campaignId}/estimate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const warnings = res.body.data.warnings.filter((w) => w.code === 'email_provider_rate_limited');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toEqual({
      accountKey: `email:${seeded.emailId}`,
      events30d: 2,
      lastAt: '2026-10-03T03:30:00.000Z',
    });
  });
});
