/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — trang "Giám sát gửi tin" của ADMIN:
 * `GET /api/admin/delivery-monitor/overview?window=today|7d|30d&includeInternal=1&ownerId=`.
 *
 * Chạy trên DB thật (5433): test mock DB không bắt được SQL sai cột / sai kiểu. Mọi số kỳ vọng VIẾT TAY từ dữ liệu dựng ở
 * đầu mỗi ca, không tính bằng chính code đang test.
 *
 * Dữ liệu tin dùng mốc theo `CURRENT_DATE` (giờ VN của phiên DB) nên ca không phụ thuộc giờ chạy test. Cột thời gian của
 * `campaign_runs` trong bootstrap.sql là TIMESTAMPTZ (production là timestamp naive) — ca ép cột về naive để bắt lỗi
 * `::timestamptz` nằm ở adminDeliveryMonitorNaiveTime.test.js.
 *
 * Covered:
 *   - Quyền: chỉ admin; tham số `window` / `ownerId` sai → 400; `?windowDays=` của trang cũ bị bỏ qua
 *   - Hình dạng phản hồi + trạng thái rỗng; trường của trang cũ đã bỏ (reach %, health, recentErrors, topRuns…)
 *   - Loại tài khoản nội bộ (39/116 mặc định, env INTERNAL_USER_IDS), `includeInternal`, `ownerId` đích danh
 *   - "Đã gửi" / "chưa gửi được" khớp tay từ bảng tin (preview / aborted / pending / hôm qua / chủ khác không vào)
 *   - Cửa sổ today / 7d / 30d theo NGÀY VN, biên trên / dưới; biểu đồ giờ / ngày cộng khớp thẻ tổng
 *   - Lượt continuous bắt đầu 40 ngày trước vẫn "đang gửi"; lượt chờ không vào lỗi; lượt lỗi trong kỳ
 *   - Nguyên nhân chưa gửi được: gom ở SQL (không trần 500), dedupe đích, chuẩn hoá email / số; khách gửi nhiều nhất
 *   - Bảng lượt chạy: số từ bảng tin, KHÔNG từ bộ đếm campaign_runs
 *   - Admin lọc một chủ = trang Giám sát của chủ đó (cùng số, cùng lượt chạy)
 *   - Hàng đợi, cảnh báo đang mở, tín hiệu (stranger_blocked, Zalo silent drop)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
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

afterEach(() => {
  delete process.env.INTERNAL_USER_IDS;
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

// ─────────────────────────── Gọi API ───────────────────────────

let adminToken = null;

async function asAdmin() {
  if (!adminToken) {
    const admin = await createUser({ role: 'admin', username: 'admin-pr6' });
    adminToken = await loginAs(admin);
  }
  return adminToken;
}

// truncateAll xoá user giữa các ca nên token admin cũ vô hiệu: mỗi ca đăng nhập lại.
beforeEach(() => {
  adminToken = null;
});

const getOverview = async (query = '') => {
  const token = await asAdmin();
  return request(app).get(`/api/admin/delivery-monitor/overview${query}`).set('Authorization', `Bearer ${token}`);
};

const getData = async (query = '') => {
  const res = await getOverview(query);
  expect(res.status).toBe(200);
  return res.body.data;
};

const getUserOverview = async (user) => {
  const token = await loginAs(user);
  const res = await request(app).get('/api/delivery-monitor/overview').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
};

// ─────────────────────────── Dựng dữ liệu ───────────────────────────

const todayAt = (time) => `(CURRENT_DATE::timestamp + interval '${time}')`;
const daysAgoAt = (days, time) => `((CURRENT_DATE - ${days})::timestamp + interval '${time}')`;
const minutes = (n) => new Date(Date.now() + n * 60_000).toISOString();

/** `createUser` trả id BIGINT dạng chuỗi (node-pg); API trả số. */
const idOf = (user) => Number(user.id);

async function createCampaign({ userId, name = 'C', type = 'email', workspaceOwnerId = userId, createdBy = userId }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW()) RETURNING id`,
    [userId, workspaceOwnerId, createdBy, name, type]
  );
  return Number(rows[0].id);
}

/** Các mốc là BIỂU THỨC SQL (giờ VN); `completedAt` null = chưa kết thúc. */
async function createRun({
  campaignId,
  ownerId,
  status = 'running',
  startedAt = 'NOW()',
  createdAt = 'NOW()',
  completedAt = null,
  totalRecipients = 0,
  successfulSends = 0,
  failedSends = 0,
  metadata = {},
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs
       (id_campaign, workspace_owner_id, run_type, status, started_at, created_at, completed_at, total_recipients,
        successful_sends, failed_sends, run_metadata)
     VALUES ($1, $2, 'manual', $3, ${startedAt}, ${createdAt}, ${completedAt ?? 'NULL'}, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [campaignId, ownerId, status, totalRecipients, successfulSends, failedSends, JSON.stringify(metadata)]
  );
  return Number(rows[0].id);
}

/** Một chiến dịch + một lượt chạy của `ownerId`. */
async function createContext(ownerId, options = {}) {
  const campaignId = await createCampaign({ userId: ownerId, ...options.campaign });
  const runId = await createRun({ campaignId, ownerId, ...options.run });
  return { ownerId, campaignId, runId };
}

async function addEmail(c, { to, status = 'sent', when = todayAt('00:10:00'), preview = false, reason = null }) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, recipient_email, email_step, status, is_preview,
        error_message, tracking_token, sent_at, created_at)
     VALUES ($1, $1, $2, $3, $4, 1, $5, $6, $7, md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [c.ownerId, c.campaignId, c.runId, to, status, preview, reason]
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

/** `count` đích email chưa gửi được (mỗi đích một dòng lỗi) — dựng bằng một câu INSERT để chạy nhanh với số lớn. */
async function addManyFailedEmails(c, { count, reason, prefix, when }) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, recipient_email, email_step, status, is_preview,
        error_message, tracking_token, sent_at, created_at)
     SELECT $1::bigint, $1::bigint, $2::bigint, $3::bigint, $4::text || g::text || '@t.vn', 1, 'failed', FALSE, $5::text,
            md5($4::text || g::text || clock_timestamp()::text), ${when}, ${when}
     FROM generate_series(1, $6::int) AS g`,
    [c.ownerId, c.campaignId, c.runId, prefix, reason, count]
  );
}

/** Đổi id của user vừa tạo thành `id` cố định (ca dùng danh sách nội bộ MẶC ĐỊNH 39 / 116). Gọi ngay sau createUser. */
async function pinUserId(user, id) {
  await db.query('UPDATE users SET id = $1 WHERE id = $2', [id, user.id]);
  return { ...user, id };
}

// ─────────────────────────── Quyền truy cập ───────────────────────────

describe('Authorization — /api/admin/delivery-monitor/*', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/admin/delivery-monitor/overview');
    expect(res.status).toBe(401);
  });

  it('user role thường → 403', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin role → 200', async () => {
    expect((await getOverview()).status).toBe(200);
  });
});

// ─────────────────────────── Tham số và hình dạng ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — tham số', () => {
  it('không có window → today; window hợp lệ được phản hồi lại kèm ngày VN (7d = 6 ngày trước + hôm nay)', async () => {
    const { rows } = await db.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today,
              to_char(CURRENT_DATE - 6, 'YYYY-MM-DD') AS d6,
              to_char(CURRENT_DATE - 29, 'YYYY-MM-DD') AS d29`
    );
    const { today, d6, d29 } = rows[0];
    expect((await getData()).window).toEqual({ key: 'today', fromDate: today, toDate: today });
    expect((await getData('?window=7d')).window).toEqual({ key: '7d', fromDate: d6, toDate: today });
    expect((await getData('?window=30d')).window).toEqual({ key: '30d', fromDate: d29, toDate: today });
  });

  it('window lạ → 400 (không rơi âm thầm về mặc định); ownerId sai → 400', async () => {
    for (const query of ['?window=90d', '?window=abc', '?window=7', '?ownerId=abc', '?ownerId=-3', '?ownerId=0', '?ownerId=1.5']) {
      const res = await getOverview(query);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  it('?windowDays= của trang cũ bị bỏ qua: kết quả y hệt khi không gửi, và không còn trường windowDays', async () => {
    const owner = await createUser({ username: 'uW' });
    const c = await createContext(owner.id);
    await addEmail(c, { to: 'a@t.vn' });
    const plain = await getData();
    const withOld = await getData('?windowDays=90');
    expect(withOld.window).toEqual(plain.window);
    expect(withOld.totals).toEqual(plain.totals);
    expect(withOld).not.toHaveProperty('windowDays');
  });
});

describe('GET /api/admin/delivery-monitor/overview — hình dạng', () => {
  it('hệ thống chưa có dữ liệu: đủ trường mới, mọi số 0, năm kênh "tin" đúng thứ tự, không có kênh kết bạn', async () => {
    const data = await getData();
    expect(Object.keys(data).sort()).toEqual([
      'alerts', 'failureReasons', 'filter', 'generatedAt', 'queue', 'recentRuns', 'runs', 'series', 'signals', 'topOwners',
      'totals', 'window',
    ]);
    expect(data.totals).toEqual({
      sent: 0,
      failed: 0,
      failedPercent: null,
      byChannel: [
        { channel: 'email', sent: 0, failed: 0 },
        { channel: 'zalo_personal', sent: 0, failed: 0 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 0, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 0, failed: 0 },
    });
    expect(data.series).toEqual({ unit: 'hour', rows: [] });
    expect(data.runs).toEqual({ sending: 0, failed: 0, waiting: { count: 0, reasons: [], first: null } });
    expect(data.failureReasons).toEqual([]);
    expect(data.topOwners).toEqual([]);
    expect(data.recentRuns).toEqual([]);
    expect(data.queue).toEqual({ available: false });
    expect(data.alerts).toEqual({ open: 0 });
    expect(data.signals).toEqual([]);
    expect(data.filter).toEqual({ ownerId: null, includeInternal: false, excludedOwnerIds: [39, 116] });
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
  });

  it('các trường của trang cũ đã bỏ khỏi phản hồi (tiếp cận %, tỉ lệ thành công, sức khoẻ, lỗi gần đây, topRuns, timeline…)', async () => {
    const data = await getData();
    for (const removed of ['summary', 'channels', 'health', 'recentErrors', 'failureGroups', 'topRuns', 'timeline', 'redis', 'windowDays']) {
      expect(data).not.toHaveProperty(removed);
    }
  });
});

// ─────────────────────────── Loại tài khoản nội bộ ───────────────────────────

describe('tài khoản nội bộ (mặc định 39 / 116)', () => {
  async function seedInternalAndCustomer() {
    // Nội bộ = user 39 (id cố định như production). Dựng TRƯỚC khách để id 39 chưa bị chiếm.
    const internal = await pinUserId(await createUser({ username: 'noibo39', withPlan: false }), 39);
    const customer = await createUser({ username: 'khach-a' });
    const ci = await createContext(internal.id, { campaign: { name: 'Nội bộ' } });
    const cc = await createContext(customer.id, { campaign: { name: 'Khách' } });
    for (let i = 0; i < 4; i += 1) await addEmail(ci, { to: `in${i}@t.vn` });
    await addEmail(ci, { to: 'inbad@t.vn', status: 'failed', reason: 'Lỗi nội bộ' });
    await addEmail(cc, { to: 'k1@t.vn' });
    await addEmail(cc, { to: 'k2@t.vn' });
    await addEmail(cc, { to: 'kbad@t.vn', status: 'failed', reason: 'Lỗi của khách' });
    return { internal, customer, ci, cc };
  }

  it('mặc định LOẠI tài khoản 39: số tin, lý do, bảng khách, lượt chạy đều chỉ còn của khách; filter báo đã loại 39/116', async () => {
    const { customer, cc } = await seedInternalAndCustomer();
    const data = await getData();
    expect(data.totals.sent).toBe(2);
    expect(data.totals.failed).toBe(1);
    expect(data.failureReasons.map((row) => row.reason)).toEqual(['Lỗi của khách']);
    expect(data.topOwners).toEqual([{ ownerId: idOf(customer), name: 'Test khach-a', username: 'khach-a', sent: 2, failed: 1 }]);
    expect(data.recentRuns.map((run) => run.runId)).toEqual([cc.runId]);
    expect(data.runs.sending).toBe(1); // chỉ lượt của khách; lượt running của nội bộ không vào
    expect(data.filter).toEqual({ ownerId: null, includeInternal: false, excludedOwnerIds: [39, 116] });
  });

  it('includeInternal=1 (hoặc true) → gồm cả nội bộ ở MỌI khối; includeInternal=0 vẫn loại', async () => {
    const { internal, customer, ci, cc } = await seedInternalAndCustomer();
    for (const flag of ['1', 'true']) {
      const data = await getData(`?includeInternal=${flag}`);
      expect(data.totals.sent).toBe(6);
      expect(data.totals.failed).toBe(2);
      expect(data.failureReasons.map((row) => row.reason).sort()).toEqual(['Lỗi của khách', 'Lỗi nội bộ']);
      expect(data.topOwners.map((row) => row.ownerId)).toEqual([internal.id, idOf(customer)]); // 4 đã gửi trước 2
      expect(new Set(data.recentRuns.map((run) => run.runId))).toEqual(new Set([ci.runId, cc.runId]));
      expect(data.runs.sending).toBe(2);
      expect(data.filter).toEqual({ ownerId: null, includeInternal: true, excludedOwnerIds: [] });
    }
    const off = await getData('?includeInternal=0');
    expect(off.totals.sent).toBe(2);
  });

  it('ownerId đích danh cho tài khoản nội bộ vẫn hiện số của nó (chọn đích danh thì hiện đích danh)', async () => {
    const { internal } = await seedInternalAndCustomer();
    const data = await getData(`?ownerId=${idOf(internal)}`);
    expect(data.totals.sent).toBe(4);
    expect(data.totals.failed).toBe(1);
    expect(data.filter.ownerId).toBe(idOf(internal));
    expect(data.filter.excludedOwnerIds).toEqual([]);
  });

  it('env INTERNAL_USER_IDS đổi danh sách nội bộ (đọc lúc gọi): đặt = id khách → khách bị loại, user 39 được đếm', async () => {
    const { customer } = await seedInternalAndCustomer();
    process.env.INTERNAL_USER_IDS = `${idOf(customer)},116`;
    const data = await getData();
    expect(data.totals.sent).toBe(4);
    expect(data.filter.excludedOwnerIds).toEqual([idOf(customer), 116]);
    delete process.env.INTERNAL_USER_IDS;
    expect((await getData()).totals.sent).toBe(2);
  });

  it('dòng tin thiếu chủ (workspace_owner_id NULL) vẫn thuộc phạm vi toàn hệ thống khi có loại nội bộ, nhưng không phải "khách"', async () => {
    const customer = await createUser({ username: 'khach-n' });
    const c = await createContext(customer.id);
    await addEmail(c, { to: 'a@t.vn' });
    await db.query('UPDATE email_messages SET workspace_owner_id = NULL');
    const data = await getData();
    expect(data.totals.sent).toBe(1); // không rơi khỏi tổng vì COALESCE(… = ANY(…), FALSE)
    expect(data.topOwners).toEqual([]); // nhưng không có chủ để xếp hạng
  });
});

// ─────────────────────────── Số đếm khớp tay ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — totals khớp tay từ bảng tin', () => {
  it('đếm theo kênh; "chưa gửi được" theo đích; kết bạn tách riêng; preview / hôm qua / aborted / pending không vào; % trên (đã gửi + chưa gửi được)', async () => {
    const owner = await createUser({ username: 'uA' });
    const stranger = await createUser({ username: 'uB' });
    const c = await createContext(owner.id, { campaign: { name: 'Chiến dịch A' } });

    // Email: sent, opened, clicked, bounced đều là "đã gửi" (bounced nằm trong sent) = 4; e6 lỗi rồi gửi được = +1 → 5.
    await addEmail(c, { to: 'e1@t.vn', status: 'sent' });
    await addEmail(c, { to: 'e2@t.vn', status: 'opened' });
    await addEmail(c, { to: 'e3@t.vn', status: 'clicked' });
    await addEmail(c, { to: 'e4@t.vn', status: 'bounced' });
    await addEmail(c, { to: 'e5@t.vn', status: 'failed' }); // hai lần lỗi, không bao giờ gửi được → MỘT đích chưa gửi được
    await addEmail(c, { to: 'e5@t.vn', status: 'failed' });
    await addEmail(c, { to: 'e6@t.vn', status: 'failed' }); // lỗi rồi gửi được → không phải lỗi
    await addEmail(c, { to: 'e6@t.vn', status: 'sent' });
    await addEmail(c, { to: 'e7@t.vn', status: 'pending' });
    await addEmail(c, { to: 'quick@t.vn', status: 'sent', preview: true });
    await addEmail(c, { to: 'old@t.vn', status: 'sent', when: daysAgoAt(1, '23:59:59') });

    // Zalo cá nhân: 1 gửi được; 1 người lỗi 3 lần; 1 người aborted (chưa từng gửi, không phải lỗi).
    await addZalo(c, { to: '0900000001', status: 'sent' });
    for (let i = 0; i < 3; i += 1) await addZalo(c, { to: '0900000002', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000003', status: 'aborted' });
    await addZalo(c, { channel: 'zalo_group', to: 'g1', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000002', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000003', status: 'failed', error: 'Đã gửi lời mời' });
    await addAdapter(c, { to: 't1', status: 'sent' });
    await addAdapter(c, { to: 't2', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    await addAdapter(c, { to: 't3', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });

    // Chủ khác — vẫn nằm trong tổng toàn hệ thống.
    const other = await createContext(stranger.id);
    await addEmail(other, { to: 'x@t.vn' });

    const { totals } = await getData();
    // sent: email 5 + Zalo cá nhân 1 + Zalo nhóm 1 + Telegram 1 = 8, cộng 1 của chủ khác = 9.
    // failed: email 1 + Zalo cá nhân 1 + Telegram 1 = 3.  % = 3 / (9 + 3) = 25.
    expect(totals).toEqual({
      sent: 9,
      failed: 3,
      failedPercent: 25,
      byChannel: [
        { channel: 'email', sent: 6, failed: 1 },
        { channel: 'zalo_personal', sent: 1, failed: 1 },
        { channel: 'zalo_group', sent: 1, failed: 0 },
        { channel: 'telegram', sent: 1, failed: 1 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 2, failed: 1 },
    });
  });
});

// ─────────────────────────── Cửa sổ ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — cửa sổ theo NGÀY VN', () => {
  async function seedWindows() {
    const owner = await createUser({ username: 'uWin' });
    const c = await createContext(owner.id);
    const add = (label, when) => addEmail(c, { to: `${label}@t.vn`, when });
    await add('h0', todayAt('00:10:00'));
    await add('d3', daysAgoAt(3, '12:00:00'));
    await add('d6-dau-ngay', daysAgoAt(6, '00:00:00')); // biên dưới của 7d: còn trong
    await add('d7-cuoi-ngay', daysAgoAt(7, '23:59:59')); // ngay trước biên: ra ngoài 7d
    await add('d10', daysAgoAt(10, '12:00:00'));
    await add('d29-dau-ngay', daysAgoAt(29, '00:00:00')); // biên dưới của 30d: còn trong
    await add('d30-cuoi-ngay', daysAgoAt(30, '23:59:59')); // ra ngoài 30d
    await add('d40', daysAgoAt(40, '12:00:00'));
    return { owner, c };
  }

  it('today / 7d / 30d đúng biên ngày VN: 1 / 3 / 6 tin', async () => {
    await seedWindows();
    expect((await getData('?window=today')).totals.sent).toBe(1); // h0
    expect((await getData('?window=7d')).totals.sent).toBe(3); // h0, d3, d6-dau-ngay
    expect((await getData('?window=30d')).totals.sent).toBe(6); // + d7-cuoi-ngay, d10, d29-dau-ngay
  });

  it('biểu đồ: hôm nay theo GIỜ (unit=hour, đầu giờ VN dạng ISO), 7 / 30 ngày theo NGÀY (unit=day); tổng biểu đồ = thẻ tổng', async () => {
    await seedWindows();
    const today = await getData('?window=today');
    expect(today.series.unit).toBe('hour');
    expect(today.series.rows).toHaveLength(1);
    const { rows } = await db.query(`SELECT (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start`);
    expect(today.series.rows[0]).toEqual({ hour: rows[0].start.toISOString(), channel: 'email', sent: 1, failed: 0 });

    for (const [windowKey, expectedSent] of [['7d', 3], ['30d', 6]]) {
      const data = await getData(`?window=${windowKey}`);
      expect(data.series.unit).toBe('day');
      expect(data.series.rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && row.channel === 'email')).toBe(true);
      expect(data.series.rows.reduce((sum, row) => sum + row.sent, 0)).toBe(expectedSent);
      expect(data.series.rows.reduce((sum, row) => sum + row.sent, 0)).toBe(data.totals.sent);
    }
  });

  it('biểu đồ không có kênh kết bạn (không phải "tin") và tổng vẫn khớp thẻ', async () => {
    const owner = await createUser({ username: 'uSeries' });
    const c = await createContext(owner.id, { campaign: { type: 'zalo' } });
    await addZalo(c, { to: '0900000001', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' });
    for (const windowKey of ['today', '7d']) {
      const data = await getData(`?window=${windowKey}`);
      expect(data.series.rows.some((row) => row.channel === 'zalo_friend_request')).toBe(false);
      expect(data.series.rows.reduce((sum, row) => sum + row.sent, 0)).toBe(data.totals.sent);
      expect(data.totals.friendRequests.sent).toBe(1);
    }
  });
});

// ─────────────────────────── Lượt chạy: đang gửi / đang chờ / lỗi ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — lượt chạy', () => {
  it('lượt continuous bắt đầu 40 ngày trước, vẫn running → "đang gửi" ở CẢ ba cửa sổ (không theo ngày bắt đầu)', async () => {
    const owner = await createUser({ username: 'uCont' });
    await createContext(owner.id, {
      campaign: { name: 'Liên tục', type: 'zalo' },
      run: { startedAt: "NOW() - interval '40 days'", createdAt: "NOW() - interval '40 days'" },
    });
    for (const windowKey of ['today', '7d', '30d']) {
      const data = await getData(`?window=${windowKey}`);
      expect(data.runs.sending).toBe(1);
      expect(data.runs.waiting.count).toBe(0);
    }
  });

  it('đang gửi / đang chờ / lỗi trong kỳ: lượt chờ KHÔNG vào lỗi và KHÔNG vào đang gửi; lý do nhiều nhất trước', async () => {
    const owner = await createUser({ username: 'uRuns' });
    const quotaUntil = minutes(30);
    const zaloUntil = minutes(120);

    // Đang gửi: R1 (liên tục cũ), R2 (mốc chờ ĐÃ QUA — chưa dọn dấu vết).
    await createContext(owner.id, { campaign: { name: 'R1' }, run: { startedAt: "NOW() - interval '40 days'" } });
    await createContext(owner.id, {
      campaign: { name: 'R2', type: 'zalo' },
      run: { metadata: { zaloOutboundDeferredUntil: minutes(-10), zaloDeferredReason: 'rate_limited' } },
    });
    // Đang chờ: hai lượt hết lượt gửi của gói (sớm nhất), một lượt giờ yên lặng.
    const w1 = await createContext(owner.id, {
      campaign: { name: 'W1' },
      run: { metadata: { quotaDeferredUntil: quotaUntil, quotaDeferredReason: 'plan_quota_daily' } },
    });
    await createContext(owner.id, {
      campaign: { name: 'W2' },
      run: { metadata: { quotaDeferredUntil: minutes(200), quotaDeferredReason: 'plan_quota_daily' } },
    });
    const w3 = await createContext(owner.id, {
      campaign: { name: 'W3', type: 'zalo' },
      run: { metadata: { zaloOutboundDeferredUntil: zaloUntil, zaloDeferredReason: 'quiet_hours' } },
    });
    // Lượt ĐÃ XONG còn sót khoá defer → không phải đang chờ.
    await createContext(owner.id, {
      campaign: { name: 'Xong' },
      run: { status: 'completed', completedAt: 'NOW()', metadata: { quotaDeferredUntil: minutes(500), quotaDeferredReason: 'plan_quota_daily' } },
    });
    // Lượt chờ có nhiều dòng aborted (chưa từng gửi) — không được cộng vào chưa gửi được.
    await addZalo(w3, { to: '0900000001', status: 'aborted' });
    await addZalo(w3, { to: '0900000002', status: 'aborted' });
    await addZalo(w3, { to: '0900000003', status: 'sent' });
    // Lỗi trong kỳ: lượt failed kết thúc hôm nay; lượt failed 10 ngày trước (chỉ vào 30d); lượt failed không có completed_at
    // (tính theo started_at, hôm nay). Lượt failed 40 ngày trước: ra ngoài cả ba cửa sổ.
    await createContext(owner.id, { campaign: { name: 'F1' }, run: { status: 'failed', completedAt: 'NOW()' } });
    await createContext(owner.id, {
      campaign: { name: 'F2' },
      run: { status: 'failed', startedAt: "NOW() - interval '10 days'", completedAt: "NOW() - interval '10 days'" },
    });
    await createContext(owner.id, { campaign: { name: 'F3' }, run: { status: 'failed', completedAt: null } });
    await createContext(owner.id, {
      campaign: { name: 'F4' },
      run: { status: 'failed', startedAt: "NOW() - interval '40 days'", completedAt: "NOW() - interval '40 days'" },
    });

    const today = await getData('?window=today');
    expect(today.runs.sending).toBe(2); // R1, R2
    expect(today.runs.waiting.count).toBe(3); // W1, W2, W3
    expect(today.runs.waiting.reasons).toEqual([
      { reason: 'plan_quota_daily', count: 2 },
      { reason: 'quiet_hours', count: 1 },
    ]);
    expect(today.runs.waiting.first).toEqual({ campaignName: 'W1', waitingReason: 'plan_quota_daily', waitingUntil: quotaUntil });
    expect(today.runs.failed).toBe(2); // F1, F3
    expect(today.totals).toMatchObject({ sent: 1, failed: 0 }); // aborted không phải lỗi

    expect((await getData('?window=7d')).runs).toMatchObject({ sending: 2, failed: 2 });
    expect((await getData('?window=30d')).runs).toMatchObject({ sending: 2, failed: 3 }); // + F2

    const byName = Object.fromEntries((await getData()).recentRuns.map((run) => [run.campaignName, run]));
    expect(byName.W1).toMatchObject({ status: 'running', waitingUntil: quotaUntil, waitingReason: 'plan_quota_daily' });
    expect(byName.W3).toMatchObject({ waitingUntil: zaloUntil, waitingReason: 'quiet_hours', sent: 1, failed: 0 });
    expect(byName.R2).toMatchObject({ status: 'running', waitingUntil: null, waitingReason: null });
    expect(byName.Xong).toMatchObject({ status: 'completed', waitingUntil: null, waitingReason: null });
    expect(w1.runId).toBe(byName.W1.runId);
  });

  it('SMTP chặn: cùng mã "chờ bước kế" nhưng emailRateLimitAt trong khung 13 giờ → smtp_rate_limited; mốc cũ giữ mã gốc', async () => {
    const owner = await createUser({ username: 'uSmtp' });
    await createContext(owner.id, {
      campaign: { name: 'SMTP' },
      run: {
        metadata: {
          nonContinuousDeferredUntil: minutes(360),
          nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
          emailRateLimitAt: minutes(-1),
        },
      },
    });
    await createContext(owner.id, {
      campaign: { name: 'Bước kế' },
      run: {
        metadata: {
          nonContinuousDeferredUntil: minutes(3 * 24 * 60),
          nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
          emailRateLimitAt: minutes(-3 * 24 * 60),
        },
      },
    });
    const { runs } = await getData();
    expect(runs.waiting.count).toBe(2);
    expect(runs.waiting.reasons).toEqual([
      { reason: 'all_recipients_waiting_next_due', count: 1 },
      { reason: 'smtp_rate_limited', count: 1 },
    ]);
  });

  it('mốc chờ nằm ở BẤT KỲ khoá defer nào (kể cả channelDeferredUntil của Telegram/WhatsApp) đều làm lượt thành "đang chờ"', async () => {
    const owner = await createUser({ username: 'uChan' });
    await createContext(owner.id, {
      campaign: { name: 'TG', type: 'telegram' },
      run: { metadata: { channelDeferredUntil: minutes(45), channelDeferredReason: 'channel_rate_limit' } },
    });
    const { runs } = await getData();
    expect(runs.sending).toBe(0);
    expect(runs.waiting).toMatchObject({ count: 1, reasons: [{ reason: 'channel_rate_limit', count: 1 }] });
  });

  it('metadata hỏng (mốc không phải ISO) không làm hỏng cả truy vấn: lượt vẫn là "đang gửi"', async () => {
    const owner = await createUser({ username: 'uBad' });
    await createContext(owner.id, { run: { metadata: { quotaDeferredUntil: 'khong-phai-ngay', quotaDeferredReason: 'plan_quota_daily' } } });
    const { runs } = await getData();
    expect(runs).toMatchObject({ sending: 1 });
    expect(runs.waiting.count).toBe(0);
  });
});

// ─────────────────────────── Nguyên nhân chưa gửi được ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — nguyên nhân chưa gửi được', () => {
  it('gom theo (kênh, lý do), đếm ĐÍCH: người thử nhiều lần chỉ tính một lần, người thử lại thành công không có mặt; kết bạn không vào', async () => {
    const owner = await createUser({ username: 'uReason' });
    const c = await createContext(owner.id, { campaign: { type: 'zalo' } });
    // Zalo "Tham số không hợp lệ": 3 người, người z1 thử 3 lần (vẫn một đích); z9 lỗi rồi gửi được → không tính.
    for (let i = 0; i < 3; i += 1) await addZalo(c, { to: '0900000001', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000002', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000003', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000009', status: 'failed', error: 'Tham số không hợp lệ' });
    await addZalo(c, { to: '0900000009', status: 'sent' });
    // Zalo "Chưa đăng ký": 1 người. Kết bạn lỗi: KHÔNG vào bảng này (là kênh riêng).
    await addZalo(c, { to: '0900000004', status: 'failed', error: 'Số điện thoại chưa đăng ký Zalo' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'failed', error: 'Đã gửi lời mời' });
    // Email: cùng nguyên nhân SMTP nhưng KHÁC địa chỉ / khác số → gom một nhóm; một đích không ghi lý do → nhóm null.
    await addEmail(c, { to: 'a@x.vn', status: 'failed', reason: '550 5.1.1 <a@x.vn>: Recipient address rejected' });
    await addEmail(c, { to: 'b@y.vn', status: 'failed', reason: '550 5.1.1 <b@y.vn>: Recipient address rejected' });
    await addEmail(c, { to: 'c@z.vn', status: 'failed', reason: '550   5.1.1 <c@z.vn>:  Recipient   address rejected' });
    await addEmail(c, { to: 'd@z.vn', status: 'failed', reason: null });
    // Telegram: lỗi cứng 1 đích; dòng hẹn thử lại KHÔNG phải lỗi cuối.
    await addAdapter(c, { to: 't1', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    await addAdapter(c, { to: 't2', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });

    const data = await getData();
    // Nhiều đích nhất trước; bằng nhau thì lần lỗi mới nhất, rồi theo kênh (mọi dòng cùng giờ nên rơi về kênh).
    expect(data.failureReasons.map((row) => [row.channel, row.reason, row.count])).toEqual([
      ['email', '550 5.1.1 <email> Recipient address rejected', 3],
      ['zalo_personal', 'Tham số không hợp lệ', 3],
      ['email', null, 1],
      ['telegram', 'hard: PEER_ID_INVALID', 1],
      ['zalo_personal', 'Số điện thoại chưa đăng ký Zalo', 1],
    ]);
    // Viết tay: Zalo 3 + 1 đích, email 3 + 1 đích, Telegram 1 đích = 9 (người z9 gửi được, kết bạn và dòng hẹn thử lại không tính).
    expect(data.totals.failed).toBe(9);
    // Tổng mọi nhóm = "chưa gửi được" của thẻ (cùng một tập đích, cùng loại kết bạn).
    expect(data.failureReasons.reduce((sum, row) => sum + row.count, 0)).toBe(data.totals.failed);
    expect(data.failureReasons.every((row) => typeof row.category === 'string')).toBe(true);
    expect(data.failureReasons.every((row) => !Number.isNaN(Date.parse(row.lastAt)))).toBe(true);
  });

  it('gom trong SQL, KHÔNG lấy một trang dòng rồi gom ở JS: 620 đích lý do A (cũ) + 300 đích lý do B (mới) → A = 620, B = 300', async () => {
    const owner = await createUser({ username: 'uBig' });
    const c = await createContext(owner.id);
    await addManyFailedEmails(c, { count: 620, reason: 'Lý do A: máy chủ từ chối', prefix: 'a', when: todayAt('00:05:00') });
    await addManyFailedEmails(c, { count: 300, reason: 'Lý do B: hộp thư đầy', prefix: 'b', when: todayAt('00:20:00') });
    const data = await getData();
    expect(data.failureReasons.map((row) => [row.reason, row.count])).toEqual([
      ['Lý do A: máy chủ từ chối', 620],
      ['Lý do B: hộp thư đầy', 300],
    ]);
    expect(data.totals.failed).toBe(920);
  });

  it('chỉ trả 10 nhóm nhiều nhất', async () => {
    const owner = await createUser({ username: 'uTen' });
    const c = await createContext(owner.id);
    for (let group = 1; group <= 12; group += 1) {
      await addManyFailedEmails(c, { count: group, reason: `Nguyên nhân số ${String(group).padStart(2, '0')}`, prefix: `g${group}x`, when: todayAt('00:10:00') });
    }
    const data = await getData();
    expect(data.failureReasons).toHaveLength(10);
    expect(data.failureReasons.map((row) => row.count)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });
});

// ─────────────────────────── Khách gửi nhiều nhất ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — khách gửi nhiều nhất', () => {
  it('top 10 chủ theo đã gửi, kèm chưa gửi được; kết bạn không tính; tên hiển thị; chủ không có tin không có mặt', async () => {
    const owners = [];
    for (let i = 1; i <= 11; i += 1) owners.push(await createUser({ username: `top${String(i).padStart(2, '0')}`, fullName: i === 3 ? 'Nguyễn Văn Ba' : '' }));
    await createUser({ username: 'khong-gui' });
    // Chủ i gửi i email; chủ 11 thêm 5 lời mời kết bạn (không tính) và 2 email lỗi.
    for (let i = 1; i <= 11; i += 1) {
      const c = await createContext(owners[i - 1].id, { campaign: { type: i === 11 ? 'zalo' : 'email' } });
      for (let k = 0; k < i; k += 1) await addEmail(c, { to: `o${i}-${k}@t.vn` });
      if (i === 11) {
        for (let k = 0; k < 5; k += 1) await addZalo(c, { channel: 'zalo_friend_request', to: `09110000${k}`, status: 'sent' });
        await addEmail(c, { to: 'bad1@t.vn', status: 'failed', reason: 'x' });
        await addEmail(c, { to: 'bad2@t.vn', status: 'failed', reason: 'x' });
      }
    }
    const { topOwners } = await getData();
    expect(topOwners).toHaveLength(10);
    expect(topOwners.map((row) => row.sent)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    expect(topOwners[0]).toMatchObject({ ownerId: idOf(owners[10]), username: 'top11', failed: 2 });
    expect(topOwners.every((row) => row.ownerId !== idOf(owners[0]))).toBe(true); // chủ gửi ít nhất bị cắt
    // fullName rỗng → dùng username; có fullName → dùng fullName.
    const three = topOwners.find((row) => row.ownerId === idOf(owners[2]));
    expect(three).toMatchObject({ name: 'Nguyễn Văn Ba', username: 'top03' });
    expect(topOwners.find((row) => row.ownerId === idOf(owners[3]))).toMatchObject({ name: 'top04', username: 'top04' });
  });
});

// ─────────────────────────── Bảng lượt chạy ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — bảng lượt chạy', () => {
  it('20 lượt mới nhất toàn hệ thống (không theo cửa sổ), mới nhất trước, kèm chủ tài khoản', async () => {
    const a = await createUser({ username: 'chuA', fullName: 'Chủ A' });
    const b = await createUser({ username: 'chuB', fullName: '' });
    for (let i = 0; i < 24; i += 1) {
      await createContext(i % 2 === 0 ? a.id : b.id, {
        campaign: { name: `L${String(i).padStart(2, '0')}` },
        run: { status: 'completed', startedAt: `NOW() - interval '${i + 1} hours'`, completedAt: 'NOW()' },
      });
    }
    // Một lượt rất cũ (40 ngày) không lọt 20 dòng đầu.
    await createContext(a.id, { campaign: { name: 'Cũ' }, run: { status: 'completed', startedAt: "NOW() - interval '40 days'", completedAt: "NOW() - interval '40 days'" } });
    const { recentRuns } = await getData('?window=today');
    expect(recentRuns).toHaveLength(20);
    expect(recentRuns.map((run) => run.campaignName)).toEqual(Array.from({ length: 20 }, (_, i) => `L${String(i).padStart(2, '0')}`));
    expect(recentRuns[0]).toMatchObject({ ownerId: idOf(a), ownerName: 'Chủ A', ownerUsername: 'chuA' });
    expect(recentRuns[1]).toMatchObject({ ownerId: idOf(b), ownerName: 'chuB', ownerUsername: 'chuB' });
  });

  it('số tin của lượt lấy từ BẢNG TIN, không từ bộ đếm campaign_runs (bộ đếm phình 999 / 500 không thắng); cộng mọi kênh, không theo cửa sổ', async () => {
    const owner = await createUser({ username: 'uCounter' });
    const c = await createContext(owner.id, {
      campaign: { name: 'Bộ đếm phình' },
      run: { status: 'completed', completedAt: 'NOW()', successfulSends: 999, failedSends: 500, totalRecipients: 3 },
    });
    await addEmail(c, { to: 'a@t.vn' });
    await addEmail(c, { to: 'old@t.vn', when: daysAgoAt(20, '10:00:00') }); // ngoài "hôm nay" nhưng vẫn của lượt
    await addEmail(c, { to: 'bad@t.vn', status: 'failed', reason: 'x' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' }); // kết bạn của lượt vẫn cộng vào lượt
    const { recentRuns } = await getData('?window=today');
    expect(recentRuns).toHaveLength(1);
    expect(recentRuns[0]).toMatchObject({ sent: 3, failed: 1 });
  });

  it('planned chỉ hiện khi bộ đếm đáng tin: trước mốc 26/09 20:36 → null; sau mốc và total ≥ sent → total; total < sent hoặc 0 → null', async () => {
    const owner = await createUser({ username: 'uPlan' });
    const make = async (name, createdAt, totalRecipients, sentCount) => {
      const c = await createContext(owner.id, {
        campaign: { name },
        run: { status: 'completed', completedAt: 'NOW()', createdAt: `TIMESTAMP '${createdAt}'`, startedAt: `TIMESTAMP '${createdAt}'`, totalRecipients },
      });
      for (let i = 0; i < sentCount; i += 1) await addEmail(c, { to: `${name}-${i}@t.vn` });
      return c.runId;
    };
    const old = await make('cu', '2026-09-26 20:00:00', 500, 3);
    const fresh = await make('moi', '2026-09-27 09:00:00', 500, 3);
    const under = await make('lech', '2026-09-27 10:00:00', 2, 3);
    const zero = await make('khong', '2026-09-27 11:00:00', 0, 3);
    const byRun = Object.fromEntries((await getData()).recentRuns.map((run) => [run.runId, run]));
    expect(byRun[old]).toMatchObject({ sent: 3, planned: null });
    expect(byRun[fresh]).toMatchObject({ sent: 3, planned: 500 });
    expect(byRun[under]).toMatchObject({ sent: 3, planned: null });
    expect(byRun[zero]).toMatchObject({ sent: 3, planned: null });
  });
});

// ─────────────────────────── Admin lọc một chủ = trang của chủ đó ───────────────────────────

describe('admin lọc một chủ = trang Giám sát của chủ đó (cùng số, cùng lượt chạy)', () => {
  it('cùng thẻ tổng "hôm nay" (theo kênh, kết bạn, chưa gửi được), cùng đang gửi / đang chờ, cùng số từng lượt', async () => {
    const owner = await createUser({ username: 'uPar' });
    const other = await createUser({ username: 'uParOther' });
    const c = await createContext(owner.id, { campaign: { name: 'Chiến dịch' }, run: { totalRecipients: 40, createdAt: "TIMESTAMP '2026-09-28 09:00:00'" } });
    await addEmail(c, { to: 'e1@t.vn', status: 'sent' });
    await addEmail(c, { to: 'e2@t.vn', status: 'opened' });
    await addEmail(c, { to: 'e3@t.vn', status: 'failed' });
    await addEmail(c, { to: 'e3@t.vn', status: 'failed' });
    await addEmail(c, { to: 'e4@t.vn', status: 'bounced' });
    await addZalo(c, { to: '0900000001', status: 'sent' });
    await addZalo(c, { to: '0900000002', status: 'failed', error: 'Lỗi' });
    await addZalo(c, { to: '0900000003', status: 'aborted' });
    await addZalo(c, { channel: 'zalo_group', to: 'g1', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' });
    await addZalo(c, { channel: 'zalo_friend_request', to: '0911000002', status: 'failed', error: 'x' });
    await addAdapter(c, { to: 't1', status: 'sent' });
    await addAdapter(c, { to: 't2', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    await addEmail(c, { to: 'old@t.vn', when: daysAgoAt(2, '10:00:00') }); // ngoài "hôm nay", vẫn của lượt
    const untilQuota = minutes(90);
    await createContext(owner.id, {
      campaign: { name: 'Chờ hạn mức' },
      run: { metadata: { quotaDeferredUntil: untilQuota, quotaDeferredReason: 'plan_quota_daily' } },
    });
    await createContext(owner.id, { campaign: { name: 'Đang gửi' }, run: { startedAt: "NOW() - interval '30 days'" } });
    await createContext(owner.id, {
      campaign: { name: 'Xong', type: 'zalo' },
      run: { status: 'completed', completedAt: 'NOW()', totalRecipients: 1, createdAt: "TIMESTAMP '2026-09-20 09:00:00'" },
    });
    const otherCtx = await createContext(other.id);
    await addEmail(otherCtx, { to: 'x@t.vn' });

    const user = await getUserOverview(owner);
    const admin = await getData(`?ownerId=${idOf(owner)}&window=today`);

    expect(admin.totals.sent).toBe(user.today.sent);
    expect(admin.totals.failed).toBe(user.today.failed);
    expect(admin.totals.byChannel).toEqual(user.today.byChannel);
    expect(admin.totals.friendRequests).toEqual(user.today.friendRequests);
    // Viết tay: sent = email e1, e2, e4 (3) + Zalo cá nhân z1 (1) + nhóm g1 (1) + Telegram t1 (1) = 6;
    // failed = email e3 (1 đích, thử 2 lần) + Zalo z2 (1) + Telegram t2 (1) = 3; kết bạn 1 gửi / 1 lỗi tách riêng.
    expect(admin.totals.sent).toBe(6);
    expect(admin.totals.failed).toBe(3);
    expect(admin.totals.friendRequests).toEqual({ sent: 1, failed: 1 });
    expect(admin.runs.sending).toBe(user.running);
    expect(admin.runs.waiting.count).toBe(user.waiting.count);
    expect(admin.runs.waiting.first).toEqual(user.waiting.first);
    const pick = (run) => ({
      status: run.status,
      waitingUntil: run.waitingUntil,
      waitingReason: run.waitingReason,
      sent: run.sent,
      failed: run.failed,
      planned: run.planned,
      campaignName: run.campaignName,
      startedAt: run.startedAt,
    });
    const asMap = (runs) => Object.fromEntries(runs.map((run) => [run.runId, pick(run)]));
    expect(asMap(admin.recentRuns)).toEqual(asMap(user.runs));
    // Chủ khác không lọt vào.
    expect(admin.recentRuns.every((run) => run.ownerId === idOf(owner))).toBe(true);
  });
});

// ─────────────────────────── Hàng đợi, cảnh báo, tín hiệu ───────────────────────────

describe('GET /api/admin/delivery-monitor/overview — cảnh báo đang mở và tín hiệu', () => {
  it('alerts.open = số LUẬT còn sự kiện chưa xử lý (một luật bắn lặp vẫn là một; luật đã xử lý hết không tính)', async () => {
    await db.query('DELETE FROM alert_events');
    const rule = async (code) => {
      const { rows } = await db.query(
        `INSERT INTO alert_rules (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [code, code]
      );
      return rows[0].id;
    };
    const [a, b, c] = [await rule('pr6_open_a'), await rule('pr6_open_b'), await rule('pr6_resolved_c')];
    const event = (ruleId, resolved) => db.query('INSERT INTO alert_events (rule_id, resolved) VALUES ($1, $2)', [ruleId, resolved]);
    await event(a, false);
    await event(a, false);
    await event(a, false); // luật a bắn lặp 3 lần → vẫn một luật
    await event(b, false);
    await event(c, true);
    await event(b, true); // luật b: một sự kiện mở + một đã xử lý → vẫn mở
    expect((await getData()).alerts).toEqual({ open: 2 });
  });

  it('BullMQ tắt → queue.available=false (không 500)', async () => {
    expect((await getData()).queue).toEqual({ available: false });
  });

  it('stranger_blocked: tín hiệu critical theo số bị chặn trong cửa sổ; số của tài khoản nội bộ bị loại mặc định, includeInternal thì có', async () => {
    const internal = await pinUserId(await createUser({ username: 'noibo39b', withPlan: false }), 39);
    const customer = await createUser({ username: 'khach-sb' });
    const add = (userId, phone, reason, when = 'NOW()') => db.query(
      `INSERT INTO zalo_unreachable_phones (id_user, phone_normalized, reason, updated_at) VALUES ($1, $2, $3, ${when})`,
      [userId, phone, reason]
    );
    await add(customer.id, '0900000001', 'stranger_blocked');
    await add(customer.id, '0900000002', 'stranger_blocked');
    await add(customer.id, '0900000003', 'not_found'); // lý do khác → không tính
    await add(customer.id, '0900000004', 'stranger_blocked', "NOW() - interval '10 days'"); // ngoài "hôm nay"
    await add(internal.id, '0900000005', 'stranger_blocked');

    const signal = (data) => data.signals.find((item) => item.code === 'stranger_blocked_detected');
    expect(signal(await getData('?window=today'))).toMatchObject({ level: 'critical', value: 2 });
    expect(signal(await getData('?window=30d'))).toMatchObject({ level: 'critical', value: 3 });
    expect(signal(await getData('?window=today&includeInternal=1'))).toMatchObject({ value: 3 });
  });

  it('không có số nào bị chặn → không có tín hiệu stranger_blocked', async () => {
    expect((await getData()).signals.find((item) => item.code === 'stranger_blocked_detected')).toBeUndefined();
  });
});

// ─────────────────────────── Zalo silent drop ───────────────────────────

function silentDropSignals(data) {
  return (data?.signals || []).filter((item) => item.code === ZALO_SILENT_DROP_SIGNAL_CODE);
}

describe('GET /api/admin/delivery-monitor/overview — Zalo silent drop', () => {
  afterAll(async () => {
    await db.query('ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_id BIGINT');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
        ON zalo_messages (account_id, created_at DESC)
        WHERE account_id IS NOT NULL
    `);
  });

  it('3/10 silent-drop trong 1 giờ → warning 30%; 9/9 không đủ sàn; bản ghi 2 giờ trước không tính', async () => {
    const owner = await createUser({ username: 'ownerSd' });
    const camp = await createCampaign({ userId: owner.id, name: 'Zalo drip', type: 'zalo' });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 42, accountName: 'MỸ - SHTT',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 3,
    });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 42, accountName: 'MỸ - SHTT',
      status: 'sent', count: 7,
    });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 9, accountName: 'Too few',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 9,
    });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 8, accountName: 'Stale',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
      createdAt: twoHoursAgo,
    });

    const silent = silentDropSignals(await getData());
    expect(silent).toHaveLength(1);
    expect(silent[0]).toMatchObject({
      level: 'warning',
      accountId: 42,
      accountName: 'MỸ - SHTT',
      silentDrops: 3,
      attempts: 10,
      value: 30,
    });
  });

  it('5/10 silent-drop → critical', async () => {
    const owner = await createUser({ username: 'ownerCrit' });
    const camp = await createCampaign({ userId: owner.id });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 7, accountName: 'Hot',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 5,
    });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 7, accountName: 'Hot',
      status: 'sent', count: 5,
    });
    const silent = silentDropSignals(await getData());
    expect(silent).toHaveLength(1);
    expect(silent[0]).toMatchObject({ level: 'critical', accountId: 7, silentDrops: 5, attempts: 10, value: 50 });
  });

  it('lọc một chủ: chỉ thấy tín hiệu của tài khoản thuộc chủ đó', async () => {
    const a = await createUser({ username: 'sdA' });
    const b = await createUser({ username: 'sdB' });
    const campA = await createCampaign({ userId: a.id, type: 'zalo' });
    const campB = await createCampaign({ userId: b.id, type: 'zalo' });
    await insertZaloMonitorMessages({ campaignId: campA, accountId: 11, accountName: 'Acc A', status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10 });
    await insertZaloMonitorMessages({ campaignId: campB, accountId: 22, accountName: 'Acc B', status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10 });
    expect(silentDropSignals(await getData()).map((item) => item.accountId).sort()).toEqual([11, 22]);
    expect(silentDropSignals(await getData(`?ownerId=${idOf(a)}`)).map((item) => item.accountId)).toEqual([11]);
    expect(silentDropSignals(await getData(`?ownerId=${idOf(b)}`)).map((item) => item.accountId)).toEqual([22]);
  });

  it('thiếu cột account_id → overview vẫn 200 và không có tín hiệu silent-drop', async () => {
    const owner = await createUser({ username: 'ownerDropCol' });
    const camp = await createCampaign({ userId: owner.id });
    await insertZaloMonitorMessages({
      campaignId: camp, accountId: 15, accountName: 'Will vanish',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
    });
    expect(silentDropSignals(await getData())).toHaveLength(1);

    await db.query('ALTER TABLE zalo_messages DROP COLUMN IF EXISTS account_id CASCADE');
    try {
      // Cột account_id là của phép đếm silent-drop; phép đếm tin của module sendStats không đọc cột này.
      const res = await getOverview();
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.signals)).toBe(true);
      expect(silentDropSignals(res.body.data)).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_id BIGINT');
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
          ON zalo_messages (account_id, created_at DESC)
          WHERE account_id IS NOT NULL
      `);
    }
  });
});
