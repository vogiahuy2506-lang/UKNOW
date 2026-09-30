/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — trang "Giám sát gửi tin" phía người dùng:
 * `GET /api/delivery-monitor/overview` và `GET /api/delivery-monitor/runs/:runId/failures`.
 *
 * Chạy trên DB thật (5433): test mock DB không bắt được SQL sai cột / sai kiểu (vụ `cj.campaign_id`, `chatbots`).
 * Mọi số kỳ vọng VIẾT TAY từ dữ liệu dựng ở đầu mỗi ca, không tính bằng chính code đang test.
 *
 * Dữ liệu tin dùng mốc "hôm nay 00:10 giờ VN" (`CURRENT_DATE + 00:10`) để ca không phụ thuộc giờ chạy test: luôn nằm
 * trong ngày VN hiện tại và trong cửa sổ 24 giờ của biểu đồ. Cột thời gian của `campaign_runs` trong bootstrap.sql là
 * TIMESTAMPTZ (production là timestamp naive) — ca ép cột về naive để bắt lỗi `::timestamptz` nằm ở
 * userDeliveryMonitorNaiveTime.test.js.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, insertZaloMonitorMessages } from './helpers/db.js';
import { ZALO_SILENT_DROP_SIGNAL_CODE } from '../../src/utils/deliveryMonitorSignals.util.js';
import { ZALO_SILENT_DROP_CATEGORY } from '../../src/utils/zaloDispatchDelivery.util.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.pool.end();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const getOverview = async (user, query = '') => {
  const token = await loginAs(user);
  return request(app).get(`/api/delivery-monitor/overview${query}`).set('Authorization', `Bearer ${token}`);
};

const getFailures = async (user, runId) => {
  const token = await loginAs(user);
  return request(app).get(`/api/delivery-monitor/runs/${runId}/failures`).set('Authorization', `Bearer ${token}`);
};

// ─────────────────────────── Dựng dữ liệu ───────────────────────────

const todayAt = (time) => `(CURRENT_DATE::timestamp + interval '${time}')`;
const yesterdayAt = (time) => `((CURRENT_DATE - 1)::timestamp + interval '${time}')`;

async function vnToday() {
  const { rows } = await db.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`);
  return rows[0].today;
}

async function createCampaign({ userId, name = 'C', type = 'email', workspaceOwnerId = userId, createdBy = userId }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW()) RETURNING id`,
    [userId, workspaceOwnerId, createdBy, name, type]
  );
  return Number(rows[0].id);
}

/** `startedAt` / `createdAt` là BIỂU THỨC SQL (giờ VN). */
async function createRun({
  campaignId,
  ownerId,
  status = 'running',
  startedAt = 'NOW()',
  createdAt = 'NOW()',
  totalRecipients = 0,
  metadata = {},
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs
       (id_campaign, workspace_owner_id, run_type, status, started_at, created_at, total_recipients, run_metadata)
     VALUES ($1, $2, 'manual', $3, ${startedAt}, ${createdAt}, $4, $5::jsonb) RETURNING id`,
    [campaignId, ownerId, status, totalRecipients, JSON.stringify(metadata)]
  );
  return Number(rows[0].id);
}

/** Một chiến dịch + một lượt chạy của `ownerId`. */
async function createContext(ownerId, options = {}) {
  const campaignId = await createCampaign({ userId: ownerId, ...options.campaign });
  const runId = await createRun({ campaignId, ownerId, ...options.run });
  return { ownerId, campaignId, runId };
}

async function addEmail(c, { to, status = 'sent', when = todayAt('00:10:00'), preview = false }) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, recipient_email, email_step, status, is_preview,
        tracking_token, sent_at, created_at)
     VALUES ($1, $1, $2, $3, $4, 1, $5, $6, md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [c.ownerId, c.campaignId, c.runId, to, status, preview]
  );
}

async function addZalo(c, { channel = 'zalo_personal', to, status, when = todayAt('00:10:00'), error = null, preview = false }) {
  await db.query(
    `INSERT INTO zalo_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, channel, recipient_type, recipient_value, status,
        tracking_metadata, is_preview, tracking_token, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, 'phone', $5, $6, $7::jsonb, $8, md5(random()::text || clock_timestamp()::text),
             ${when}, ${when}, ${when})`,
    [c.ownerId, c.campaignId, c.runId, channel, to, status, JSON.stringify({ status, stepIndex: 1, ...(error ? { error } : {}) }), preview]
  );
}

async function addAdapter(c, { channel = 'telegram', to, status, category = null, message = null, when = todayAt('00:10:00') }) {
  const instant = `((${when}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, channel, recipient_key, step_index, status,
        error_category, error_message, is_preview, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, 1, $6, $7, $8, FALSE, ${status === 'sent' ? instant : 'NULL'}, ${instant}, ${instant})`,
    [c.ownerId, c.campaignId, c.runId, channel, to, status, category, message]
  );
}

// ─────────────────────────── Quyền truy cập ───────────────────────────

describe('Authorization — /api/delivery-monitor/*', () => {
  it('không có token → 401 (cả overview lẫn failures)', async () => {
    expect((await request(app).get('/api/delivery-monitor/overview')).status).toBe(401);
    expect((await request(app).get('/api/delivery-monitor/runs/1/failures')).status).toBe(401);
  });

  it('chủ tài khoản (role user) → 200; admin cũng truy cập được', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    expect((await getOverview(user)).status).toBe(200);
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    expect((await getOverview(admin)).status).toBe(200);
  });
});

// ─────────────────────────── Hình dạng phản hồi ───────────────────────────

describe('GET /api/delivery-monitor/overview — hình dạng', () => {
  it('chủ mới chưa có dữ liệu: đủ trường mới, mọi số 0, năm kênh "tin" đúng thứ tự, không có kênh kết bạn', async () => {
    const user = await createUser({ username: 'u1' });
    const res = await getOverview(user);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    expect(Object.keys(data).sort()).toEqual(['generatedAt', 'hourly', 'running', 'runs', 'signals', 'today', 'waiting']);
    expect(data.today).toEqual({
      date: await vnToday(),
      sent: 0,
      failed: 0,
      byChannel: [
        { channel: 'email', sent: 0, failed: 0 },
        { channel: 'zalo_personal', sent: 0, failed: 0 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 0, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 0, failed: 0 },
    });
    expect(data.hourly).toEqual([]);
    expect(data.runs).toEqual([]);
    expect(data.waiting).toEqual({ count: 0, first: null });
    expect(data.running).toBe(0);
    expect(data.signals).toEqual([]);
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
  });

  it('các trường của trang cũ đã bỏ khỏi phản hồi (độ phủ, sức khoẻ, lỗi gần đây, tỉ lệ thành công, topRuns, windowDays)', async () => {
    const user = await createUser({ username: 'u1' });
    const { body } = await getOverview(user);
    for (const removed of ['summary', 'channels', 'channelsRecent', 'health', 'recentErrors', 'topRuns', 'timeline', 'windowDays']) {
      expect(body.data).not.toHaveProperty(removed);
    }
  });

  it('?windowDays= gửi lên bị bỏ qua: kết quả y hệt khi không gửi', async () => {
    const user = await createUser({ username: 'u1' });
    const c = await createContext(user.id);
    await addEmail(c, { to: 'a@t.vn' });
    const plain = (await getOverview(user)).body.data;
    const withParam = (await getOverview(user, '?windowDays=90')).body.data;
    expect(withParam.today).toEqual(plain.today);
    expect(withParam.runs).toEqual(plain.runs);
    expect(withParam).not.toHaveProperty('windowDays');
  });
});

// ─────────────────────────── "Hôm nay" khớp tay ───────────────────────────

describe('GET /api/delivery-monitor/overview — today khớp tay từ bảng tin', () => {
  it('đếm theo kênh; "chưa gửi được" theo người nhận; kết bạn tách riêng; preview / hôm qua / chủ khác / aborted / pending không vào', async () => {
    const owner = await createUser({ username: 'uA' });
    const stranger = await createUser({ username: 'uB' });
    const c = await createContext(owner.id, { campaign: { name: 'Chiến dịch A' }, run: { totalRecipients: 40 } });

    // Email: sent, opened, clicked, bounced đều là "đã gửi" (bounced nằm trong sent) = 4; e6 lỗi rồi gửi được = +1 → 5.
    await addEmail(c, { to: 'e1@t.vn', status: 'sent' });
    await addEmail(c, { to: 'e2@t.vn', status: 'opened' });
    await addEmail(c, { to: 'e3@t.vn', status: 'clicked' });
    await addEmail(c, { to: 'e4@t.vn', status: 'bounced' });
    await addEmail(c, { to: 'e5@t.vn', status: 'failed' }); // hai lần lỗi, không bao giờ gửi được → MỘT người chưa gửi được
    await addEmail(c, { to: 'e5@t.vn', status: 'failed' });
    await addEmail(c, { to: 'e6@t.vn', status: 'failed' }); // lỗi rồi gửi được → không phải lỗi
    await addEmail(c, { to: 'e6@t.vn', status: 'sent' });
    await addEmail(c, { to: 'e7@t.vn', status: 'pending' }); // chưa xong → không vào đâu
    await addEmail(c, { to: 'quick@t.vn', status: 'sent', preview: true }); // gửi nhanh → không vào
    await addEmail(c, { to: 'old@t.vn', status: 'sent', when: yesterdayAt('23:59:59') }); // hôm qua → không vào "hôm nay"

    // Zalo cá nhân: 1 gửi được; 1 người lỗi 3 lần; 1 người aborted (chưa từng gửi, không phải lỗi).
    await addZalo(c, { to: '0900000001', status: 'sent' });
    for (let i = 0; i < 3; i += 1) await addZalo(c, { to: '0900000002', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000003', status: 'aborted' });
    await addZalo(c, { channel: 'zalo_group', to: 'g1', status: 'sent' });
    // Lời mời kết bạn: kênh riêng — KHÔNG cộng vào tin.
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000002', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000003', status: 'failed' });
    // Telegram: 1 gửi được, 1 lỗi cứng, 1 chỉ có dòng hẹn thử lại (chưa có kết quả cuối).
    await addAdapter(c, { to: 't1', status: 'sent' });
    await addAdapter(c, { to: 't2', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    await addAdapter(c, { to: 't3', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });

    // Chủ khác có một lượt riêng.
    const other = await createContext(stranger.id);
    await addEmail(other, { to: 'x@t.vn' });

    const { body } = await getOverview(owner);
    expect(body.data.today).toEqual({
      date: await vnToday(),
      // sent: email 5 + Zalo cá nhân 1 + Zalo nhóm 1 + Telegram 1 = 8. failed: email 1 + Zalo cá nhân 1 + Telegram 1 = 3.
      sent: 8,
      failed: 3,
      byChannel: [
        { channel: 'email', sent: 5, failed: 1 },
        { channel: 'zalo_personal', sent: 1, failed: 1 },
        { channel: 'zalo_group', sent: 1, failed: 0 },
        { channel: 'telegram', sent: 1, failed: 1 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 2, failed: 1 },
    });

    // Biểu đồ giờ: không có kênh kết bạn; Zalo nhóm chỉ có dòng hôm nay nên đúng 1.
    expect(body.data.hourly.some((row) => row.channel === 'zalo_friend_request')).toBe(false);
    const groupRows = body.data.hourly.filter((row) => row.channel === 'zalo_group');
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0]).toMatchObject({ sent: 1, failed: 0 });
    expect(typeof groupRows[0].hour).toBe('string');

    // Hàng lượt chạy cộng MỌI kênh của lượt (không theo cửa sổ): email 5 + 1 (hôm qua) + Zalo 1 + nhóm 1 + kết bạn 2 +
    // Telegram 1 = 11 đã gửi; chưa gửi được: email 1 + Zalo 1 + kết bạn 1 + Telegram 1 = 4.
    expect(body.data.runs).toHaveLength(1);
    expect(body.data.runs[0]).toMatchObject({
      runId: c.runId,
      campaignId: c.campaignId,
      campaignName: 'Chiến dịch A',
      campaignType: 'email',
      status: 'running',
      waitingUntil: null,
      waitingReason: null,
      sent: 11,
      failed: 4,
    });
  });

  it('chủ khác không thấy số của chủ này', async () => {
    const owner = await createUser({ username: 'uA' });
    const stranger = await createUser({ username: 'uB' });
    const c = await createContext(owner.id);
    await addEmail(c, { to: 'a@t.vn' });
    const { body } = await getOverview(stranger);
    expect(body.data.today.sent).toBe(0);
    expect(body.data.runs).toEqual([]);
    expect(body.data.hourly).toEqual([]);
  });
});

// ─────────────────────────── Lượt đang chờ ───────────────────────────

describe('GET /api/delivery-monitor/overview — lượt đang chờ, đang gửi', () => {
  const minutes = (n) => new Date(Date.now() + n * 60_000).toISOString();

  it('lượt chờ (mốc tương lai) nằm ở waiting, KHÔNG làm tăng failed; lượt chờ sớm nhất là first; mốc đã qua / lượt đã xong không tính', async () => {
    const owner = await createUser({ username: 'uW' });
    const zaloUntil = minutes(120);
    const quotaUntil = minutes(30);
    const smtpUntil = minutes(360);
    const nextStepUntil = minutes(3 * 24 * 60);

    // W1: Zalo đang trong giờ yên lặng — có 2 dòng aborted (chưa từng gửi) và 1 dòng đã gửi.
    const w1 = await createContext(owner.id, {
      campaign: { name: 'W1 zalo', type: 'zalo' },
      run: { startedAt: "NOW() - interval '50 minutes'", metadata: { zaloOutboundDeferredUntil: zaloUntil, zaloDeferredReason: 'quiet_hours' } },
    });
    await addZalo(w1, { to: '0900000001', status: 'aborted' });
    await addZalo(w1, { to: '0900000002', status: 'aborted' });
    await addZalo(w1, { to: '0900000003', status: 'sent' });
    // W2: hết lượt gửi của gói — sớm nhất (30 phút).
    const w2 = await createContext(owner.id, {
      campaign: { name: 'W2 quota' },
      run: { startedAt: "NOW() - interval '40 minutes'", metadata: { quotaDeferredUntil: quotaUntil, quotaDeferredReason: 'plan_quota_daily' } },
    });
    // W3: mốc chờ ĐÃ QUA → đang gửi (chưa dọn dấu vết), không phải đang chờ.
    await createContext(owner.id, {
      campaign: { name: 'W3 mốc cũ', type: 'zalo' },
      run: { startedAt: "NOW() - interval '30 minutes'", metadata: { zaloOutboundDeferredUntil: minutes(-10), zaloDeferredReason: 'rate_limited' } },
    });
    // W4: đang gửi bình thường.
    await createContext(owner.id, { campaign: { name: 'W4 gửi' }, run: { startedAt: "NOW() - interval '20 minutes'" } });
    // W5: lượt ĐÃ XONG còn sót khoá defer trong metadata → không phải đang chờ.
    const w5 = await createContext(owner.id, {
      campaign: { name: 'W5 xong' },
      run: { status: 'completed', startedAt: "NOW() - interval '10 minutes'", metadata: { quotaDeferredUntil: minutes(500), quotaDeferredReason: 'plan_quota_daily' } },
    });
    // W6: SMTP chặn 12 giờ (cùng mã lý do với "chờ bước kế", phân biệt bằng emailRateLimitAt trong khung 13 giờ).
    const w6 = await createContext(owner.id, {
      campaign: { name: 'W6 smtp' },
      run: {
        startedAt: "NOW() - interval '5 minutes'",
        metadata: { nonContinuousDeferredUntil: smtpUntil, nonContinuousDeferredReason: 'all_recipients_waiting_next_due', emailRateLimitAt: minutes(-1) },
      },
    });
    // W7: chờ tới bước kế 3 ngày sau; emailRateLimitAt CŨ (3 ngày trước) không được coi là SMTP.
    const w7 = await createContext(owner.id, {
      campaign: { name: 'W7 bước kế' },
      run: {
        startedAt: "NOW() - interval '2 minutes'",
        metadata: { nonContinuousDeferredUntil: nextStepUntil, nonContinuousDeferredReason: 'all_recipients_waiting_next_due', emailRateLimitAt: minutes(-3 * 24 * 60) },
      },
    });

    const { body } = await getOverview(owner);
    const { data } = body;

    // Chờ: W1, W2, W6, W7 = 4; đang gửi: W3, W4 = 2. W5 (đã xong) không tính vào đâu.
    expect(data.waiting.count).toBe(4);
    expect(data.running).toBe(2);
    expect(data.waiting.first).toEqual({ campaignName: 'W2 quota', waitingReason: 'plan_quota_daily', waitingUntil: quotaUntil });

    // aborted không phải lỗi: hôm nay chỉ có 1 tin đã gửi, 0 chưa gửi được.
    expect(data.today.sent).toBe(1);
    expect(data.today.failed).toBe(0);

    const byRun = Object.fromEntries(data.runs.map((run) => [run.runId, run]));
    expect(byRun[w1.runId]).toMatchObject({ status: 'running', waitingUntil: zaloUntil, waitingReason: 'quiet_hours', sent: 1, failed: 0 });
    expect(byRun[w2.runId]).toMatchObject({ waitingUntil: quotaUntil, waitingReason: 'plan_quota_daily' });
    expect(byRun[w5.runId]).toMatchObject({ status: 'completed', waitingUntil: null, waitingReason: null });
    expect(byRun[w6.runId]).toMatchObject({ waitingUntil: smtpUntil, waitingReason: 'smtp_rate_limited' });
    expect(byRun[w7.runId]).toMatchObject({ waitingUntil: nextStepUntil, waitingReason: 'all_recipients_waiting_next_due' });
    const expired = data.runs.find((run) => run.campaignName === 'W3 mốc cũ');
    expect(expired).toMatchObject({ status: 'running', waitingUntil: null, waitingReason: null });
  });

  it('lượt running ngoài 10 lượt mới nhất (vd. chiến dịch liên tục sống lâu) vẫn được đếm vào "đang chờ" / "đang gửi"', async () => {
    const owner = await createUser({ username: 'uL' });
    const until = minutes(90);
    await createContext(owner.id, {
      campaign: { name: 'Liên tục cũ', type: 'zalo' },
      run: { startedAt: "NOW() - interval '30 days'", metadata: { zaloOutboundDeferredUntil: until, zaloDeferredReason: 'quiet_hours' } },
    });
    for (let i = 0; i < 12; i += 1) {
      await createContext(owner.id, { campaign: { name: `Xong ${i}` }, run: { status: 'completed', startedAt: `NOW() - interval '${i + 1} hours'` } });
    }
    const { data } = (await getOverview(owner)).body;
    expect(data.runs).toHaveLength(10);
    expect(data.runs.some((run) => run.campaignName === 'Liên tục cũ')).toBe(false); // ngoài 10 lượt mới nhất
    expect(data.waiting).toEqual({ count: 1, first: { campaignName: 'Liên tục cũ', waitingReason: 'quiet_hours', waitingUntil: until } });
    expect(data.running).toBe(0);
    // Mới nhất trước.
    expect(data.runs.map((run) => run.campaignName)).toEqual(Array.from({ length: 10 }, (_, i) => `Xong ${i}`));
  });
});

// ─────────────────────────── "Cần gửi" (planned) ───────────────────────────

describe('GET /api/delivery-monitor/overview — planned chỉ hiện khi bộ đếm lượt chạy đáng tin', () => {
  it('lượt tạo TRƯỚC mốc sửa 26/09 20:36 → null; sau mốc và total ≥ sent → total; total < sent hoặc 0 → null', async () => {
    const owner = await createUser({ username: 'uP' });
    const make = async (name, createdAt, totalRecipients, sentCount) => {
      const c = await createContext(owner.id, {
        campaign: { name },
        run: { status: 'completed', createdAt: `TIMESTAMP '${createdAt}'`, startedAt: `TIMESTAMP '${createdAt}'`, totalRecipients },
      });
      for (let i = 0; i < sentCount; i += 1) await addEmail(c, { to: `${name}-${i}@t.vn` });
      return c.runId;
    };
    const old = await make('cu', '2026-09-26 20:00:00', 500, 3); // bộ đếm cũ (phình / về 0) → không tin
    const fresh = await make('moi', '2026-09-27 09:00:00', 500, 3); // 3 / 500
    const undercount = await make('lech', '2026-09-27 10:00:00', 2, 3); // total < đã gửi thật → bộ đếm sai
    const zero = await make('khong', '2026-09-27 11:00:00', 0, 3); // 0 nghĩa là chưa biết

    const { data } = (await getOverview(owner)).body;
    const byRun = Object.fromEntries(data.runs.map((run) => [run.runId, run]));
    expect(byRun[old]).toMatchObject({ sent: 3, planned: null });
    expect(byRun[fresh]).toMatchObject({ sent: 3, planned: 500 });
    expect(byRun[undercount]).toMatchObject({ sent: 3, planned: null });
    expect(byRun[zero]).toMatchObject({ sent: 3, planned: null });
  });
});

// ─────────────────────────── Phạm vi chủ (công ty) ───────────────────────────

describe('phạm vi công ty: COALESCE(workspace_owner_id, id_user)', () => {
  it('chiến dịch cũ thiếu workspace_owner_id và chiến dịch do nhân viên tạo (id_user = chủ, created_by = nhân viên) đều thuộc chủ', async () => {
    const owner = await createUser({ username: 'uO' });
    const employee = await createUser({ username: 'uE' });
    const legacy = await createContext(owner.id, { campaign: { name: 'Cũ', workspaceOwnerId: null } });
    const byEmployee = await createContext(owner.id, {
      campaign: { name: 'Nhân viên tạo', workspaceOwnerId: owner.id, createdBy: employee.id },
    });
    // Quy tắc phạm vi là COALESCE(workspace_owner_id, id_user): id_user KHÁC chủ nhưng workspace_owner_id = chủ vẫn của chủ.
    await createContext(employee.id, { campaign: { name: 'id_user khác, cùng công ty', workspaceOwnerId: owner.id, createdBy: employee.id } });
    // Chiến dịch của CHÍNH tài khoản nhân viên (chủ = nhân viên) không thuộc chủ này.
    const foreign = await createContext(employee.id, { campaign: { name: 'Của tài khoản khác' } });
    for (const c of [legacy, byEmployee, foreign]) await addEmail(c, { to: `${c.runId}@t.vn` });

    const { data } = (await getOverview(owner)).body;
    expect(data.runs.map((run) => run.campaignName).sort()).toEqual(['Cũ', 'Nhân viên tạo', 'id_user khác, cùng công ty']);
    expect(data.today.sent).toBe(2); // hai tin của chủ; tin của chủ khác không lọt vào
    expect((await getOverview(employee)).body.data.runs.map((run) => run.campaignName)).toEqual(['Của tài khoản khác']);
  });
});

// ─────────────────────────── Tín hiệu Zalo ───────────────────────────

function silentDropSignals(data) {
  return (data?.signals || []).filter((item) => item.code === ZALO_SILENT_DROP_SIGNAL_CODE);
}

describe('GET /api/delivery-monitor/overview — Zalo silent drop tenant', () => {
  it('chỉ chủ sở hữu chiến dịch mới thấy tín hiệu; chủ khác cùng lúc không thấy', async () => {
    const userA = await createUser({ username: 'sdOwner' });
    const userB = await createUser({ username: 'sdOther' });
    const campA = await createCampaign({ userId: userA.id, name: 'A zalo', type: 'zalo' });
    const campB = await createCampaign({ userId: userB.id, name: 'B zalo', type: 'zalo' });

    await insertZaloMonitorMessages({
      campaignId: campA, accountId: 11, accountName: 'Acc A',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
    });
    await insertZaloMonitorMessages({
      campaignId: campB, accountId: 22, accountName: 'Acc B',
      status: 'sent', count: 10,
    });

    const resA = await getOverview(userA);
    expect(resA.status).toBe(200);
    const silentA = silentDropSignals(resA.body.data);
    expect(silentA).toHaveLength(1);
    expect(silentA[0]).toMatchObject({
      accountId: 11,
      accountName: 'Acc A',
      silentDrops: 10,
      attempts: 10,
      value: 100,
      level: 'critical',
    });

    const resB = await getOverview(userB);
    expect(resB.status).toBe(200);
    expect(silentDropSignals(resB.body.data)).toHaveLength(0);
  });
});

// ─────────────────────────── Danh sách "chưa gửi được" của một lượt ───────────────────────────

describe('GET /api/delivery-monitor/runs/:runId/failures', () => {
  it('tham số sai → 400; lượt của chủ khác hoặc không tồn tại → 404 và KHÔNG lộ người nhận', async () => {
    const owner = await createUser({ username: 'uFailOwner' });
    const stranger = await createUser({ username: 'uFailStranger' });
    const c = await createContext(owner.id, { campaign: { type: 'zalo' } });
    await addZalo(c, { to: '0388180856', status: 'failed', error: 'Tham số không hợp lệ' });

    expect((await getFailures(stranger, c.runId)).status).toBe(404);
    expect((await getFailures(owner, 999999)).status).toBe(404);
    const badId = await getFailures(owner, 'abc');
    expect(badId.status).toBe(400);
    expect(badId.body.success).toBe(false);
    const forbidden = await getFailures(stranger, c.runId);
    expect(JSON.stringify(forbidden.body)).not.toContain('0388180856');
  });

  it('người thử 2 lần lỗi rồi gửi được KHÔNG có trong danh sách; người lỗi mãi thì có, kèm số lần và lý do; số dòng = failed ở overview', async () => {
    const owner = await createUser({ username: 'uFail' });
    const c = await createContext(owner.id, { campaign: { type: 'zalo' } });
    // p1: lỗi 2 lần rồi gửi được.
    await addZalo(c, { to: '0900000001', status: 'failed', error: 'Lỗi tạm', when: todayAt('00:05:00') });
    await addZalo(c, { to: '0900000001', status: 'failed', error: 'Lỗi tạm', when: todayAt('00:06:00') });
    await addZalo(c, { to: '0900000001', status: 'sent', when: todayAt('00:07:00') });
    // p2: lỗi 2 lần, không bao giờ gửi được.
    await addZalo(c, { to: '0900000002', status: 'failed', error: 'Lần một', when: todayAt('00:05:00') });
    await addZalo(c, { to: '0900000002', status: 'failed', error: 'Số điện thoại chưa đăng ký Zalo', when: todayAt('00:08:00') });
    // p3: bị hoãn nhiều lần (aborted) — chưa từng gửi, KHÔNG phải lỗi.
    for (let i = 0; i < 4; i += 1) await addZalo(c, { to: '0900000003', status: 'aborted', when: todayAt(`00:0${i}:00`) });
    // Email lỗi + email bounced (đã gửi, bị trả về — không phải lỗi).
    await addEmail(c, { to: 'bad@t.vn', status: 'failed' });
    await addEmail(c, { to: 'bounce@t.vn', status: 'bounced' });

    const res = await getFailures(owner, c.runId);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.runId).toBe(c.runId);
    expect(res.body.data.recipientAudit).toBeNull();
    const failures = res.body.data.failures;
    expect(failures.map((item) => item.recipient).sort()).toEqual(['0900000002', 'bad@t.vn']);
    const p2 = failures.find((item) => item.recipient === '0900000002');
    expect(p2).toMatchObject({
      channel: 'zalo_personal',
      recipientDisplay: null,
      reason: 'Số điện thoại chưa đăng ký Zalo', // lý do của lần thử lỗi CUỐI
      attempts: 2,
    });
    expect(Number.isNaN(Date.parse(p2.lastAt))).toBe(false);
    expect(failures.find((item) => item.recipient === 'bad@t.vn')).toMatchObject({ channel: 'email', attempts: 1 });

    // Số người trong danh sách = số "chưa gửi được" của lượt trên trang.
    const overview = (await getOverview(owner)).body.data;
    expect(overview.runs[0].failed).toBe(failures.length);
    expect(overview.today.failed).toBe(2);
  });

  it('trả recipientAudit của lượt (kiểm toán người nhận) và lỗi Telegram/WhatsApp có kênh + tên hiển thị', async () => {
    const owner = await createUser({ username: 'uAudit' });
    const audit = {
      sourceRows: 6, withRecipient: 3, deduped: 3, skippedNoRecipient: 3, skippedAlreadySent: 0,
      skippedNotDue: 0, skippedCompleted: 0, attempted: 2,
    };
    const c = await createContext(owner.id, { campaign: { type: 'whatsapp' }, run: { metadata: { recipientAudit: audit } } });
    await addAdapter(c, { channel: 'whatsapp', to: '84900000001', status: 'failed', category: 'hard', message: 'Số không dùng WhatsApp' });

    const res = await getFailures(owner, c.runId);
    expect(res.status).toBe(200);
    expect(res.body.data.recipientAudit).toMatchObject(audit);
    expect(res.body.data.failures).toHaveLength(1);
    expect(res.body.data.failures[0]).toMatchObject({
      channel: 'whatsapp',
      recipient: '84900000001',
      reason: 'hard: Số không dùng WhatsApp',
      attempts: 1,
    });
  });
});
