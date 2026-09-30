/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4a — module đếm gửi tin dùng chung (services/stats/sendStats.service.js).
 *
 * Chạy trên DB thật vì test mock DB không bắt được SQL sai cột / sai kiểu (vụ `cj.campaign_id`, `chatbots`).
 * Mọi con số kỳ vọng dưới đây VIẾT TAY từ bảng chân lý (định nghĩa ở đầu sendStats.service.js), không tính bằng
 * chính code đang test. Danh sách 6 kênh cũng viết tay, không lấy từ registry.
 *
 * Lưu ý bootstrap.sql khai `email_messages.status` là VARCHAR (production là enum `message_status`), nên nhãn
 * trạng thái email dưới đây chép từ enum production: pending, queued, sent, delivered, opened, clicked, bounced,
 * failed, spam, unsubscribed. Mốc thời gian của email/Zalo là `timestamp` giờ VN, của campaign_channel_messages
 * là `timestamptz`; helper chèn dữ liệu nhận MỘT biểu thức giờ VN (naive) và tự đổi sang timestamptz cho bảng adapter.
 * Script integration chạy với TZ=UTC nên lệch 7 giờ ở biên ngày sẽ lộ ngay ở các ca "cửa sổ".
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import {
  getChannelTotals,
  getDailySeries,
  getHourlySeries,
  getRunTotals,
  getCampaignTotals,
  getActorTotals,
  listFinalFailures,
} from '../../src/services/stats/sendStats.service.js';
import { TRANSIENT_RETRY_CATEGORY } from '../../src/services/campaign/campaignChannelRunner.service.js';

// ───────────────────────── Dữ liệu dùng chung ─────────────────────────

const CHANNELS = ['email', 'zalo_personal', 'zalo_group', 'zalo_friend_request', 'telegram', 'whatsapp'];

/** Bảng đủ 6 kênh, kênh không nêu = 0 — so sánh nguyên mảng để không sót kênh nào. */
function expectedTotals(byChannel = {}) {
  return CHANNELS.map((channel) => ({
    channel,
    sent: 0,
    failed: 0,
    bounced: 0,
    opened: 0,
    clicked: 0,
    ...(byChannel[channel] || {}),
  }));
}

// Biểu thức SQL giờ VN (timestamp không múi giờ), dùng làm mốc thời gian của một tin.
const AT = {
  recent: "LOCALTIMESTAMP - interval '1 hour'",
  twoDaysAgo: "LOCALTIMESTAMP - interval '2 days'",
  fortyDaysAgo: "LOCALTIMESTAMP - interval '40 days'",
  hundredDaysAgo: "LOCALTIMESTAMP - interval '100 days'",
};
const at = (literal) => `TIMESTAMP '${literal}'`;

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// SĐT tăng dần: users có unique index trên phone, đừng để createUser tự sinh ngẫu nhiên rồi va nhau.
let phoneSequence = 10000000;

async function createOwner(label) {
  phoneSequence += 1;
  const user = await dbHelpers.createUser({ username: `ss_${label}_${unique()}`, phone: `09${phoneSequence}` });
  return Number(user.id);
}

/** Một chiến dịch + một node + một lượt chạy của `ownerId`; `createdBy` là người tạo (actor_user_id). */
async function createContext(ownerId, { createdBy = ownerId } = {}) {
  const campaign = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, 'sendStats test', 'email', 'active') RETURNING id`,
    [ownerId, createdBy]
  );
  const campaignId = Number(campaign.rows[0].id);
  const context = { ownerId, actorId: createdBy, campaignId };
  context.nodeId = await addNode(context);
  context.runId = await addRun(context);
  return context;
}

async function addNode(context) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, execution_order)
     VALUES ($1, 'action', 'send_email', 'send', 1) RETURNING id`,
    [context.campaignId]
  );
  return Number(rows[0].id);
}

async function addRun(context) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
     VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [context.campaignId, context.ownerId]
  );
  return Number(rows[0].id);
}

async function insertEmail(c, {
  to,
  status = 'sent',
  step = 1,
  when = AT.recent,
  preview = false,
  opened = false,
  clicked = false,
  clickCount = 0,
  bounceReason = null,
  errorMessage = null,
  ownerId = c.ownerId,
  actorId = c.actorId,
  campaignId = c.campaignId,
  runId = c.runId,
  nodeId = c.nodeId,
}) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, recipient_email, email_step, status,
        is_preview, first_opened_at, first_clicked_at, click_count, bounce_reason, error_message,
        tracking_token, sent_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             CASE WHEN $10::boolean THEN ${when} END, CASE WHEN $11::boolean THEN ${when} END, $12, $13, $14,
             md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [ownerId, actorId, campaignId, runId, nodeId, to, step, status, preview, opened, clicked, clickCount,
      bounceReason, errorMessage]
  );
}

/**
 * Chèn một dòng zalo_messages. `colStatus` là cột `status`, `jsonStatus` là tracking_metadata.status:
 * dòng đúng dạng sau 11/09 có cả hai giống nhau; dòng cũ có cột 'pending' nhưng JSON nói thật; dòng đang gửi có
 * 'pending' + JSON 'queued'. `noJson` = không có tracking_metadata.
 */
async function insertZalo(c, {
  channel = 'zalo_personal',
  to,
  colStatus,
  jsonStatus = colStatus,
  step = 1,
  error = null,
  groupName = null,
  clickCount = 0,
  when = AT.recent,
  preview = false,
  noJson = false,
  ownerId = c.ownerId,
  actorId = c.actorId,
  campaignId = c.campaignId,
  runId = c.runId,
  nodeId = c.nodeId,
}) {
  const metadata = noJson
    ? null
    : { status: jsonStatus, stepIndex: step, ...(error ? { error } : {}), ...(groupName ? { groupName } : {}) };
  await db.query(
    `INSERT INTO zalo_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_type, recipient_value,
        group_id, status, tracking_metadata, click_count, is_preview, tracking_token, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
             md5(random()::text || clock_timestamp()::text), ${when}, ${when}, ${when})`,
    [ownerId, actorId, campaignId, runId, nodeId, channel, channel === 'zalo_group' ? 'group' : 'phone', to,
      channel === 'zalo_group' ? to : null, colStatus, metadata ? JSON.stringify(metadata) : null, clickCount, preview]
  );
}

/**
 * Chèn một dòng campaign_channel_messages. Giống production: `sent_at` chỉ có ở dòng đã gửi (markSent), dòng
 * lỗi / đang xếp hàng chỉ có created_at (markFailed không đặt sent_at). `when` là giờ VN naive, đổi sang timestamptz.
 */
async function insertAdapter(c, {
  channel = 'telegram',
  to,
  status,
  step = 1,
  category = null,
  message = null,
  display = null,
  when = AT.recent,
  preview = false,
  ownerId = c.ownerId,
  actorId = c.actorId,
  campaignId = c.campaignId,
  runId = c.runId,
  nodeId = c.nodeId,
}) {
  const instant = `((${when}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_key, recipient_display,
        step_index, status, error_category, error_message, is_preview, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             ${status === 'sent' ? instant : 'NULL'}, ${instant}, ${instant})`,
    [ownerId, actorId, campaignId, runId, nodeId, channel, to, display, step, status, category, message, preview]
  );
}

const DAYS_7 = { days: 7 };

afterAll(async () => {
  await db.pool.end();
});

// ───────────────────────── Email: bảng chân lý trạng thái ─────────────────────────

describe('sendStats — email: mỗi nhãn enum một dòng', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('email_status');
    const c = await createContext(owner);
    // 10 nhãn của enum production message_status, mỗi nhãn một thư gửi cho một người khác nhau.
    await insertEmail(c, { to: 'pending@t.vn', status: 'pending' });
    await insertEmail(c, { to: 'queued@t.vn', status: 'queued' });
    await insertEmail(c, { to: 'sent@t.vn', status: 'sent', clickCount: 2 }); // nhấp qua click_count, không có first_clicked_at
    await insertEmail(c, { to: 'delivered@t.vn', status: 'delivered' });
    await insertEmail(c, { to: 'opened@t.vn', status: 'opened', opened: true });
    await insertEmail(c, { to: 'clicked@t.vn', status: 'clicked', opened: true, clicked: true, clickCount: 1 });
    await insertEmail(c, { to: 'bounced@t.vn', status: 'bounced', bounceReason: '550 user unknown' });
    // Thư lỗi mà có dấu mở/nhấp (không thể xảy ra thật) vẫn KHÔNG được vào opened/clicked: chỉ thư đã gửi mới tính.
    await insertEmail(c, { to: 'failed@t.vn', status: 'failed', opened: true, clicked: true, clickCount: 3 });
    await insertEmail(c, { to: 'spam@t.vn', status: 'spam' });
    await insertEmail(c, { to: 'unsub@t.vn', status: 'unsubscribed', opened: true });
  });

  it('sent = 7 nhãn (sent, delivered, opened, clicked, bounced, spam, unsubscribed); failed = 1; bounced nằm trong sent', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_7);
    expect(totals).toEqual(expectedTotals({
      // opened: opened, clicked, unsubscribed = 3. clicked: dòng 'clicked' + dòng 'sent' có click_count = 2 (thư lỗi không tính).
      email: { sent: 7, failed: 1, bounced: 1, opened: 3, clicked: 2 },
    }));
  });

  it('pending và queued không vào đâu (không phải đã gửi, không phải lỗi)', async () => {
    const [email] = await getChannelTotals({ ownerId: owner }, DAYS_7);
    expect(email.sent + email.failed).toBe(8);
  });
});

// ───────────────────────── Email: đích và thử lại ─────────────────────────

describe('sendStats — email: "chưa gửi được" đếm theo ĐÍCH, không theo lượt thử', () => {
  let owner;
  let c;
  let node2;
  let run2;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('email_dest');
    c = await createContext(owner);
    node2 = await addNode(c);
    run2 = await addRun(c);

    // 1. 3 lần lỗi rồi gửi được → đích đã gửi: failed 0, sent 1.
    for (let i = 0; i < 3; i += 1) await insertEmail(c, { to: 'p1@t.vn', status: 'failed' });
    await insertEmail(c, { to: 'p1@t.vn', status: 'sent' });
    // 2. 2 lần lỗi, không gửi được → MỘT đích lỗi.
    for (let i = 0; i < 2; i += 1) await insertEmail(c, { to: 'p2@t.vn', status: 'failed' });
    // 3. Bước 1 lỗi, bước 2 gửi được → hai đích khác nhau: failed 1, sent 1.
    await insertEmail(c, { to: 'p3@t.vn', status: 'failed', step: 1 });
    await insertEmail(c, { to: 'p3@t.vn', status: 'sent', step: 2 });
    // 4. Lỗi ở node 1, gửi được ở node 2 → hai đích khác nhau.
    await insertEmail(c, { to: 'p4@t.vn', status: 'failed' });
    await insertEmail(c, { to: 'p4@t.vn', status: 'sent', nodeId: node2 });
    // 5. Lỗi ở lượt 1, gửi được ở lượt 2 → hai đích khác nhau.
    await insertEmail(c, { to: 'p5@t.vn', status: 'failed' });
    await insertEmail(c, { to: 'p5@t.vn', status: 'sent', runId: run2 });
    // 6. Cùng địa chỉ khác hoa/thường và khoảng trắng → CÙNG đích: failed 0, sent 1.
    await insertEmail(c, { to: '  P6@T.VN ', status: 'failed' });
    await insertEmail(c, { to: 'p6@t.vn', status: 'sent' });
    // 7. Lượt chạy đã xoá (id_run NULL): mỗi dòng lỗi là một đích riêng, dòng gửi được không xoá lỗi nào.
    await insertEmail(c, { to: 'p7@t.vn', status: 'failed', runId: null, campaignId: null });
    await insertEmail(c, { to: 'p7@t.vn', status: 'failed', runId: null, campaignId: null });
    await insertEmail(c, { to: 'p7@t.vn', status: 'sent', runId: null, campaignId: null });
    // 8. Lỗi rồi bị trả về (bounced): bounced thuộc bộ đã-gửi → đích đã gửi, failed 0.
    await insertEmail(c, { to: 'p8@t.vn', status: 'failed' });
    await insertEmail(c, { to: 'p8@t.vn', status: 'bounced' });
  });

  it('bảng chân lý: sent 7, failed 6 (p2, p3, p4, p5 và hai dòng p7), bounced 1', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_7);
    // sent: p1, p3(bước 2), p4(node 2), p5(lượt 2), p6, p7(dòng sent), p8(bounced) = 7.
    // failed: p2 (1) + p3 bước 1 (1) + p4 node 1 (1) + p5 lượt 1 (1) + p7 hai dòng (2) = 6; p1, p6, p8 đã được gửi.
    expect(totals).toEqual(expectedTotals({ email: { sent: 7, failed: 6, bounced: 1 } }));
  });

  it('danh sách lỗi cuối khớp con số failed (mỗi đích một dòng)', async () => {
    const failures = await listFinalFailures({ ownerId: owner }, { window: DAYS_7, limit: 100 });
    expect(failures).toHaveLength(6);
    const recipients = failures.map((failure) => failure.recipient).sort();
    expect(recipients).toEqual(['p2@t.vn', 'p3@t.vn', 'p4@t.vn', 'p5@t.vn', 'p7@t.vn', 'p7@t.vn']);
  });
});

// ───────────────────────── Zalo ─────────────────────────

describe('sendStats — Zalo: 3 kênh riêng, aborted/pending không vào đâu, dòng cũ đọc từ JSON', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('zalo');
    const c = await createContext(owner);

    // ── zalo_personal ──
    await insertZalo(c, { to: '0900000001', colStatus: 'sent' });
    await insertZalo(c, { to: '0900000002', colStatus: 'failed', error: 'Tham số không hợp lệ' });
    await insertZalo(c, { to: '0900000003', colStatus: 'aborted' }); // tin CHƯA TỪNG gửi
    await insertZalo(c, { to: '0900000004', colStatus: 'pending', jsonStatus: 'queued' }); // đang gửi
    // Dòng cũ (trước 11/09): cột status kẹt 'pending' vĩnh viễn, trạng thái thật chỉ nằm ở JSON.
    await insertZalo(c, { to: '0900000005', colStatus: 'pending', jsonStatus: 'sent' });
    await insertZalo(c, { to: '0900000006', colStatus: 'pending', jsonStatus: 'failed', error: 'Lỗi cũ' });
    // Lỗi hai lần rồi gửi được → đích đã gửi.
    await insertZalo(c, { to: '0900000007', colStatus: 'failed' });
    await insertZalo(c, { to: '0900000007', colStatus: 'failed' });
    await insertZalo(c, { to: '0900000007', colStatus: 'sent' });
    // Lỗi hai lần, không gửi được → MỘT đích lỗi.
    await insertZalo(c, { to: '0900000008', colStatus: 'failed' });
    await insertZalo(c, { to: '0900000008', colStatus: 'failed' });
    // Nhấp link: chỉ tin đã gửi mới tính.
    await insertZalo(c, { to: '0900000009', colStatus: 'sent', clickCount: 3 });
    await insertZalo(c, { to: '0900000010', colStatus: 'failed', clickCount: 1 });
    // Không có tracking_metadata và cột còn 'pending' → không xác định được, không vào đâu.
    await insertZalo(c, { to: '0900000011', colStatus: 'pending', noJson: true });
    // Bước 1 lỗi, bước 2 gửi được → hai đích khác nhau.
    await insertZalo(c, { to: '0900000012', colStatus: 'failed', step: 1 });
    await insertZalo(c, { to: '0900000012', colStatus: 'sent', step: 2 });
    // Dòng có channel NULL hoặc ngoài registry không thuộc kênh nào → bị bỏ qua (không đoán kênh).
    await insertZalo(c, { channel: null, to: '0900000013', colStatus: 'sent' });
    await insertZalo(c, { channel: 'zalo_khac', to: '0900000014', colStatus: 'failed' });

    // ── zalo_friend_request (kênh riêng, không cộng vào "tin" của Zalo cá nhân) ──
    for (let i = 0; i < 3; i += 1) await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000001', colStatus: 'failed' });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000002', colStatus: 'failed' });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000002', colStatus: 'failed' });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000002', colStatus: 'sent' });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000003', colStatus: 'sent' });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000004', colStatus: 'aborted' });

    // ── zalo_group ──
    await insertZalo(c, { channel: 'zalo_group', to: 'g1', colStatus: 'sent', clickCount: 2, groupName: 'Nhóm A' });
    await insertZalo(c, { channel: 'zalo_group', to: 'g2', colStatus: 'failed', error: 'Nhóm không tồn tại' });
  });

  it('bảng chân lý theo từng kênh Zalo', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_7);
    expect(totals).toEqual(expectedTotals({
      // sent: 0900000001, 05 (dòng cũ), 07, 09, 12 (bước 2) = 5.
      // failed: 02, 06 (dòng cũ), 08, 10, 12 (bước 1) = 5. aborted (03), đang gửi (04), không rõ (11) không tính.
      // clicked: chỉ 09 (dòng lỗi có click_count không tính).
      zalo_personal: { sent: 5, failed: 5, clicked: 1 },
      // sent: 0911000002 (sau 2 lần lỗi), 0911000003 = 2; failed: 0911000001 (3 dòng = 1 đích) = 1; aborted không tính.
      zalo_friend_request: { sent: 2, failed: 1 },
      zalo_group: { sent: 1, failed: 1, clicked: 1 },
    }));
  });

  it('dòng có kênh NULL / ngoài registry bị bỏ qua ở MỌI phép gom, không chỉ ở bảng theo kênh', async () => {
    // Cộng mọi kênh: sent 5 + 2 + 1 = 8, failed 5 + 1 + 1 = 7. Hai dòng kênh lạ (một sent, một failed) mà lọt vào sẽ làm 9 / 8.
    expect(await getActorTotals({ ownerId: owner }, DAYS_7)).toEqual([{ actorUserId: owner, sent: 8, failed: 7 }]);
  });
});

// ───────────────────────── Kênh adapter (Telegram / WhatsApp) ─────────────────────────

describe('sendStats — Telegram/WhatsApp: transient_retry không phải lỗi cuối', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('adapter');
    const c = await createContext(owner);

    // 1. Một lần thử lại + dòng lỗi cuối cùng đích → MỘT đích lỗi.
    await insertAdapter(c, { to: 'peer1', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });
    await insertAdapter(c, { to: 'peer1', status: 'failed', category: 'transient', message: '[lần 3/3] timeout' });
    // 2. Thử lại rồi gửi được → đã gửi, không lỗi.
    await insertAdapter(c, { to: 'peer2', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });
    await insertAdapter(c, { to: 'peer2', status: 'sent' });
    // 3. Chỉ có dòng hẹn thử lại (lượt bị dừng giữa chừng): chưa có kết quả cuối → không phải lỗi, không phải đã gửi.
    await insertAdapter(c, { to: 'peer3', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout' });
    // 4. Đang xếp hàng → không vào đâu.
    await insertAdapter(c, { to: 'peer4', status: 'queued' });
    // 5. Lỗi cứng.
    await insertAdapter(c, { to: 'peer5', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    // 6. Bước 1 gửi được, bước 2 lỗi cứng → hai đích khác nhau.
    await insertAdapter(c, { to: 'peer6', status: 'sent', step: 1 });
    await insertAdapter(c, { to: 'peer6', status: 'failed', step: 2, category: 'hard', message: 'BLOCKED' });

    // WhatsApp: một tin gửi được; một lỗi cuối chỉ có created_at (sent_at NULL) trong cửa sổ 7 ngày;
    // một lỗi cuối 40 ngày trước — ngoài cửa sổ 7 ngày, trong cửa sổ 90 ngày (cửa sổ tính theo created_at khi thiếu sent_at).
    await insertAdapter(c, { channel: 'whatsapp', to: '84901000001', status: 'sent' });
    await insertAdapter(c, { channel: 'whatsapp', to: '84901000002', status: 'failed', category: 'hard', message: 'NOT_ON_WA' });
    await insertAdapter(c, { channel: 'whatsapp', to: '84901000003', status: 'failed', category: 'hard', message: 'NOT_ON_WA', when: AT.fortyDaysAgo });
  });

  it('nhãn transient_retry của runner khớp nhãn module đếm dùng (chống lệch tên)', () => {
    expect(TRANSIENT_RETRY_CATEGORY).toBe('transient_retry');
  });

  it('cửa sổ 7 ngày: Telegram sent 2 / failed 3, WhatsApp sent 1 / failed 1', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_7);
    expect(totals).toEqual(expectedTotals({
      // sent: peer2, peer6 (bước 1) = 2. failed: peer1 (không đếm dòng transient_retry), peer5, peer6 (bước 2) = 3.
      // peer3 (chỉ transient_retry) và peer4 (queued) không tính.
      telegram: { sent: 2, failed: 3 },
      whatsapp: { sent: 1, failed: 1 },
    }));
  });

  it('cửa sổ 90 ngày lấy thêm dòng lỗi 40 ngày trước (không có sent_at → tính theo created_at)', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, { days: 90 });
    const whatsapp = totals.find((row) => row.channel === 'whatsapp');
    expect(whatsapp).toEqual({ channel: 'whatsapp', sent: 1, failed: 2, bounced: 0, opened: 0, clicked: 0 });
  });
});

// ───────────────────────── Gửi nhanh / gửi thử ─────────────────────────

describe('sendStats — is_preview không vào đâu', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('preview');
    const c = await createContext(owner);
    // Mỗi bảng: một dòng đã gửi thật + các dòng preview (đã gửi và lỗi).
    await insertEmail(c, { to: 'real@t.vn', status: 'sent' });
    await insertEmail(c, { to: 'quick1@t.vn', status: 'sent', preview: true, opened: true });
    await insertEmail(c, { to: 'quick2@t.vn', status: 'failed', preview: true });
    await insertZalo(c, { to: '0900000001', colStatus: 'sent' });
    await insertZalo(c, { to: '0900000002', colStatus: 'sent', preview: true });
    await insertZalo(c, { to: '0900000003', colStatus: 'failed', preview: true });
    await insertAdapter(c, { to: 'peer1', status: 'sent' });
    await insertAdapter(c, { to: 'peer2', status: 'sent', preview: true });
    await insertAdapter(c, { to: 'peer3', status: 'failed', category: 'hard', message: 'x', preview: true });
  });

  it('chỉ dòng không-preview được đếm, cả ba bảng', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_7);
    expect(totals).toEqual(expectedTotals({
      email: { sent: 1 },
      zalo_personal: { sent: 1 },
      telegram: { sent: 1 },
    }));
  });

  it('danh sách lỗi cuối cũng bỏ qua preview', async () => {
    expect(await listFinalFailures({ ownerId: owner }, { window: DAYS_7 })).toEqual([]);
  });
});

// ───────────────────────── Phạm vi: chủ / toàn hệ thống ─────────────────────────

describe('sendStats — phạm vi chủ và toàn hệ thống', () => {
  let s1;
  let s2;
  let internal;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    s1 = await createOwner('scope1');
    s2 = await createOwner('scope2');
    internal = await createOwner('internal');
    // Mỗi chủ: 1 email gửi được, 1 Zalo cá nhân gửi được, 1 Telegram lỗi cuối.
    for (const owner of [s1, s2, internal]) {
      const c = await createContext(owner);
      await insertEmail(c, { to: 'a@t.vn', status: 'sent' });
      await insertZalo(c, { to: '0900000001', colStatus: 'sent' });
      await insertAdapter(c, { to: 'peer', status: 'failed', category: 'hard', message: 'x' });
    }
    // Thư không thuộc chiến dịch nào (không chủ, không lượt chạy): chỉ hiện ở phạm vi toàn hệ thống.
    const orphan = { ownerId: null, actorId: null, campaignId: null, runId: null, nodeId: null };
    await insertEmail(orphan, { to: 'system@t.vn', status: 'sent' });
  });

  it('một chủ chỉ thấy số của mình', async () => {
    expect(await getChannelTotals({ ownerId: s1 }, DAYS_7)).toEqual(expectedTotals({
      email: { sent: 1 },
      zalo_personal: { sent: 1 },
      telegram: { failed: 1 },
    }));
  });

  it('toàn hệ thống cộng mọi chủ, kể cả thư thiếu chủ', async () => {
    expect(await getChannelTotals({ ownerId: null }, DAYS_7)).toEqual(expectedTotals({
      email: { sent: 4 },
      zalo_personal: { sent: 3 },
      telegram: { failed: 3 },
    }));
  });

  it('excludeOwnerIds loại đúng chủ nội bộ nhưng vẫn giữ thư thiếu chủ', async () => {
    expect(await getChannelTotals({ ownerId: null, excludeOwnerIds: [internal] }, DAYS_7)).toEqual(expectedTotals({
      email: { sent: 3 },
      zalo_personal: { sent: 2 },
      telegram: { failed: 2 },
    }));
    expect(await getChannelTotals({ ownerId: null, excludeOwnerIds: [s1, s2, internal] }, DAYS_7)).toEqual(expectedTotals({
      email: { sent: 1 },
    }));
  });

  it('thiếu hoặc sai chủ thì ném lỗi, KHÔNG rơi sang toàn hệ thống', async () => {
    await expect(getChannelTotals({}, DAYS_7)).rejects.toThrow(TypeError);
    await expect(getChannelTotals({ ownerId: undefined }, DAYS_7)).rejects.toThrow(TypeError);
    await expect(getChannelTotals({ ownerId: 0 }, DAYS_7)).rejects.toThrow(TypeError);
    await expect(getChannelTotals(undefined, DAYS_7)).rejects.toThrow(TypeError);
  });
});

// ───────────────────────── Cửa sổ thời gian và ngày ─────────────────────────

describe('sendStats — cửa sổ theo ngày VN, không lệch 7 giờ', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('window');
    const c = await createContext(owner);
    // Email (timestamp giờ VN). Cửa sổ thử: 2026-03-10 → 2026-03-11 (gồm trọn ngày 11).
    await insertEmail(c, { to: 'e0@t.vn', when: at('2026-03-09 18:00:00') }); // trước cửa sổ
    await insertEmail(c, { to: 'e1@t.vn', when: at('2026-03-10 23:30:00') });
    await insertEmail(c, { to: 'e2@t.vn', when: at('2026-03-11 00:30:00') });
    await insertEmail(c, { to: 'e3@t.vn', when: at('2026-03-11 23:59:59') }); // giây cuối của toDate
    await insertEmail(c, { to: 'e4@t.vn', when: at('2026-03-12 00:00:00') }); // sang ngày sau
    // Chiều muộn của toDate: cửa sổ dựng nhầm bằng Date JS (lệch 7 giờ) sẽ cắt mất dòng này.
    await insertEmail(c, { to: 'e5@t.vn', when: at('2026-03-11 20:00:00') });
    // Zalo cá nhân (timestamp giờ VN): giây đầu và giây cuối của cửa sổ đều nằm trong, giây sát hai bên thì ngoài.
    await insertZalo(c, { to: '0900000000', colStatus: 'sent', when: at('2026-03-09 23:59:59') }); // trước cửa sổ
    await insertZalo(c, { to: '0900000001', colStatus: 'sent', when: at('2026-03-10 00:00:00') }); // giây đầu của fromDate
    await insertZalo(c, { to: '0900000002', colStatus: 'sent', when: at('2026-03-11 23:59:59') }); // giây cuối của toDate
    await insertZalo(c, { to: '0900000003', colStatus: 'sent', when: at('2026-03-12 00:00:00') }); // sang ngày sau
    // Telegram (timestamptz), viết bằng giờ VN: 02:00 ngày 10 VN = 19:00 ngày 09 UTC — theo UTC là ngày 9.
    await insertAdapter(c, { to: 't0', status: 'sent', when: at('2026-03-09 18:00:00') });
    await insertAdapter(c, { to: 't1', status: 'sent', when: at('2026-03-10 02:00:00') });
    await insertAdapter(c, { to: 't2', status: 'sent', when: at('2026-03-10 23:30:00') });
    await insertAdapter(c, { to: 't3', status: 'sent', when: at('2026-03-11 00:30:00') });
    await insertAdapter(c, { to: 't4', status: 'sent', when: at('2026-03-11 23:30:00') });
    await insertAdapter(c, { to: 't5', status: 'sent', when: at('2026-03-12 00:30:00') });
    // Lỗi cuối của Telegram chỉ có created_at (sent_at NULL): ngày 11.
    await insertAdapter(c, { to: 't6', status: 'failed', category: 'hard', message: 'x', when: at('2026-03-11 10:00:00') });
  });

  const RANGE = { fromDate: '2026-03-10', toDate: '2026-03-11' };

  it('getChannelTotals theo fromDate/toDate: đúng biên ngày cho cả cột timestamp và timestamptz', async () => {
    expect(await getChannelTotals({ ownerId: owner }, RANGE)).toEqual(expectedTotals({
      email: { sent: 4 }, // e1, e2, e3, e5
      zalo_personal: { sent: 2 }, // 10/03 00:00:00 và 11/03 23:59:59
      telegram: { sent: 4, failed: 1 }, // t1, t2, t3, t4 ; t6 lỗi
    }));
  });

  it('getDailySeries: dòng 23:30 hôm trước và 00:30 hôm sau nằm đúng ngày; ngày là chuỗi YYYY-MM-DD', async () => {
    expect(await getDailySeries({ ownerId: owner }, RANGE)).toEqual([
      { day: '2026-03-10', channel: 'email', sent: 1, failed: 0 }, // e1
      { day: '2026-03-10', channel: 'zalo_personal', sent: 1, failed: 0 }, // 00:00:00
      { day: '2026-03-10', channel: 'telegram', sent: 2, failed: 0 }, // t1, t2
      { day: '2026-03-11', channel: 'email', sent: 3, failed: 0 }, // e2, e3, e5
      { day: '2026-03-11', channel: 'zalo_personal', sent: 1, failed: 0 }, // 23:59:59
      { day: '2026-03-11', channel: 'telegram', sent: 2, failed: 1 }, // t3, t4 ; t6 lỗi
    ]);
  });

  it('cửa sổ một ngày duy nhất', async () => {
    expect(await getDailySeries({ ownerId: owner }, { fromDate: '2026-03-11', toDate: '2026-03-11' })).toEqual([
      { day: '2026-03-11', channel: 'email', sent: 3, failed: 0 },
      { day: '2026-03-11', channel: 'zalo_personal', sent: 1, failed: 0 },
      { day: '2026-03-11', channel: 'telegram', sent: 2, failed: 1 },
    ]);
  });
});

describe('sendStats — cửa sổ quyết định dòng nào được NHÌN THẤY khi xét "chưa gửi được"', () => {
  let owner;
  let runId;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('visible');
    const c = await createContext(owner);
    runId = c.runId;
    // q1: lỗi trong cửa sổ, gửi được SAU cửa sổ → xét trong cửa sổ vẫn là lỗi.
    await insertEmail(c, { to: 'q1@t.vn', status: 'failed', when: at('2026-03-11 10:00:00') });
    await insertEmail(c, { to: 'q1@t.vn', status: 'sent', when: at('2026-03-13 10:00:00') });
    // q2: lỗi TRƯỚC cửa sổ, gửi được trong cửa sổ → trong cửa sổ chỉ thấy dòng gửi được.
    await insertEmail(c, { to: 'q2@t.vn', status: 'failed', when: at('2026-03-09 10:00:00') });
    await insertEmail(c, { to: 'q2@t.vn', status: 'sent', when: at('2026-03-10 10:00:00') });
    // q3: hai lần lỗi trong cửa sổ, không bao giờ gửi được → MỘT đích lỗi, tính vào ngày của lần lỗi cuối.
    await insertEmail(c, { to: 'q3@t.vn', status: 'failed', when: at('2026-03-10 09:00:00') });
    await insertEmail(c, { to: 'q3@t.vn', status: 'failed', when: at('2026-03-11 09:00:00') });
  });

  it('cửa sổ 10–11/03: q1 vẫn lỗi (gửi được sau cửa sổ), q2 đã gửi (lỗi nằm trước cửa sổ), q3 lỗi một đích', async () => {
    const window = { fromDate: '2026-03-10', toDate: '2026-03-11' };
    expect(await getChannelTotals({ ownerId: owner }, window)).toEqual(expectedTotals({ email: { sent: 1, failed: 2 } }));
    expect(await getDailySeries({ ownerId: owner }, window)).toEqual([
      { day: '2026-03-10', channel: 'email', sent: 1, failed: 0 }, // q2 gửi được
      { day: '2026-03-11', channel: 'email', sent: 0, failed: 2 }, // q1 lỗi lúc 10:00 ; q3 lỗi cuối lúc 09:00 (đích chỉ tính một lần)
    ]);
  });

  it('mở rộng cửa sổ tới 13/03 thì q1 đã gửi được; số theo lượt (không cửa sổ) cùng kết quả', async () => {
    expect(await getChannelTotals({ ownerId: owner }, { fromDate: '2026-03-09', toDate: '2026-03-13' }))
      .toEqual(expectedTotals({ email: { sent: 2, failed: 1 } }));
    expect(await getRunTotals({ ownerId: owner }, [runId])).toEqual([{ runId, channel: 'email', sent: 2, failed: 1 }]);
  });
});

describe('sendStats — cửa sổ cuộn { days }', () => {
  let owner;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('days');
    const c = await createContext(owner);
    await insertEmail(c, { to: 'd1@t.vn', when: AT.twoDaysAgo });
    await insertEmail(c, { to: 'd2@t.vn', when: AT.fortyDaysAgo });
    await insertEmail(c, { to: 'd3@t.vn', when: AT.hundredDaysAgo });
    await insertZalo(c, { to: '0900000001', colStatus: 'sent', when: AT.twoDaysAgo });
    await insertZalo(c, { to: '0900000002', colStatus: 'sent', when: AT.fortyDaysAgo });
    await insertZalo(c, { to: '0900000003', colStatus: 'sent', when: AT.hundredDaysAgo });
    await insertAdapter(c, { to: 'd1', status: 'sent', when: AT.twoDaysAgo });
    await insertAdapter(c, { to: 'd2', status: 'sent', when: AT.fortyDaysAgo });
  });

  it('7 ngày / 30 ngày / 90 ngày lấy đúng dòng theo giờ của tin', async () => {
    expect(await getChannelTotals({ ownerId: owner }, { days: 7 }))
      .toEqual(expectedTotals({ email: { sent: 1 }, zalo_personal: { sent: 1 }, telegram: { sent: 1 } }));
    expect(await getChannelTotals({ ownerId: owner }, { days: 30 }))
      .toEqual(expectedTotals({ email: { sent: 1 }, zalo_personal: { sent: 1 }, telegram: { sent: 1 } }));
    expect(await getChannelTotals({ ownerId: owner }, { days: 90 }))
      .toEqual(expectedTotals({ email: { sent: 2 }, zalo_personal: { sent: 2 }, telegram: { sent: 2 } }));
  });

  it('cửa sổ sai thì ném lỗi', async () => {
    await expect(getChannelTotals({ ownerId: owner })).rejects.toThrow(TypeError);
    await expect(getChannelTotals({ ownerId: owner }, { days: 0 })).rejects.toThrow(RangeError);
    await expect(getChannelTotals({ ownerId: owner }, { fromDate: '2026-02-30', toDate: '2026-03-01' })).rejects.toThrow(TypeError);
    await expect(getChannelTotals({ ownerId: owner }, { fromDate: '2026-03-02', toDate: '2026-03-01' })).rejects.toThrow(RangeError);
  });
});

// ───────────────────────── Chuỗi theo giờ VN (PR-4b) ─────────────────────────

describe('sendStats — getHourlySeries: dòng 23:30 hôm qua và 00:30 hôm nay vào đúng giờ VN', () => {
  let owner;
  let stranger;
  let day;

  // Giờ VN = UTC + 7: đầu giờ 23:00 VN hôm qua = 16:00 UTC hôm qua, đầu giờ 00:00 VN hôm nay = 17:00 UTC hôm qua.
  // Mốc kỳ vọng viết tay từ ngày VN mà DB báo, không tính bằng chính code đang test.
  const hourIso = (date, hh) => new Date(`${date}T${hh}:00:00+07:00`).toISOString();
  const yesterdayAt = (time) => `((CURRENT_DATE - 1)::timestamp + interval '${time}')`;
  const todayAt = (time) => `(CURRENT_DATE::timestamp + interval '${time}')`;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('hourly');
    stranger = await createOwner('hourly_stranger');
    const { rows } = await db.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today, to_char(CURRENT_DATE - 1, 'YYYY-MM-DD') AS yesterday`
    );
    day = rows[0];
    const c = await createContext(owner);

    // Email (timestamp giờ VN): 23:30 hôm qua → giờ 23; 00:30 và 00:45 hôm nay → cùng giờ 00 của hôm nay.
    await insertEmail(c, { to: 'h1@t.vn', when: yesterdayAt('23:30:00') });
    await insertEmail(c, { to: 'h2@t.vn', when: todayAt('00:30:00') });
    await insertEmail(c, { to: 'h3@t.vn', when: todayAt('00:45:00') });
    // Zalo cá nhân: giây cuối 23:59:59 vẫn thuộc giờ 23, giây đầu 00:00:00 thuộc giờ 00 ngày kế.
    await insertZalo(c, { to: '0900000001', colStatus: 'sent', when: yesterdayAt('23:59:59') });
    await insertZalo(c, { to: '0900000002', colStatus: 'sent', when: todayAt('00:00:00') });
    // Telegram (timestamptz) viết bằng giờ VN: 23:05 hôm qua = 16:05 UTC, 00:15 hôm nay = 17:15 UTC hôm qua.
    await insertAdapter(c, { to: 't1', status: 'sent', when: yesterdayAt('23:05:00') });
    await insertAdapter(c, { to: 't2', status: 'sent', when: todayAt('00:15:00') });

    // Lỗi: hai lần thử 23:10 và 23:40 hôm qua, không bao giờ gửi được → MỘT đích lỗi, tính vào giờ của lần thử lỗi cuối (23).
    await insertEmail(c, { to: 'f1@t.vn', status: 'failed', when: yesterdayAt('23:10:00') });
    await insertEmail(c, { to: 'f1@t.vn', status: 'failed', when: yesterdayAt('23:40:00') });
    // Lỗi 23:50 hôm qua rồi gửi được lúc 00:10 hôm nay → đích đã gửi: chỉ có dòng "đã gửi" ở giờ 00, không có lỗi nào.
    await insertEmail(c, { to: 'f2@t.vn', status: 'failed', when: yesterdayAt('23:50:00') });
    await insertEmail(c, { to: 'f2@t.vn', status: 'sent', when: todayAt('00:10:00') });
    // Zalo nhóm lỗi 00:20 hôm nay; lời mời kết bạn là kênh riêng nhưng vẫn có mặt ở phép gom (màn tự loại khỏi "tin").
    await insertZalo(c, { channel: 'zalo_group', to: 'g1', colStatus: 'failed', when: todayAt('00:20:00') });
    await insertZalo(c, { channel: 'zalo_friend_request', to: '0911000001', colStatus: 'sent', when: todayAt('00:25:00') });
    // Gửi nhanh (preview) và tin của chủ khác không vào.
    await insertEmail(c, { to: 'quick@t.vn', preview: true, when: todayAt('00:30:00') });
    const other = await createContext(stranger);
    await insertEmail(other, { to: 's@t.vn', when: todayAt('00:30:00') });
  });

  it('mỗi dòng vào đúng đầu giờ VN (timestamptz), sắp theo giờ rồi thứ tự kênh; lỗi tính theo ĐÍCH ở giờ của lần thử cuối', async () => {
    const yesterday23 = hourIso(day.yesterday, '23');
    const today00 = hourIso(day.today, '00');
    expect(await getHourlySeries({ ownerId: owner }, { hours: 72 })).toEqual([
      { hour: yesterday23, channel: 'email', sent: 1, failed: 1 }, // sent: h1 ; failed: f1 (hai lần thử = MỘT đích, giờ của lần 23:40)
      { hour: yesterday23, channel: 'zalo_personal', sent: 1, failed: 0 }, // 23:59:59
      { hour: yesterday23, channel: 'telegram', sent: 1, failed: 0 }, // 23:05 VN
      { hour: today00, channel: 'email', sent: 3, failed: 0 }, // h2, h3, f2 (gửi được sau lần lỗi → không còn là lỗi)
      { hour: today00, channel: 'zalo_personal', sent: 1, failed: 0 }, // 00:00:00
      { hour: today00, channel: 'zalo_group', sent: 0, failed: 1 }, // 00:20
      { hour: today00, channel: 'zalo_friend_request', sent: 1, failed: 0 },
      { hour: today00, channel: 'telegram', sent: 1, failed: 0 }, // 00:15 VN
    ]);
  });

  it('cộng theo giờ = tổng theo kênh cùng dữ liệu (sent và failed)', async () => {
    const series = await getHourlySeries({ ownerId: owner }, { hours: 72 });
    const totals = await getChannelTotals({ ownerId: owner }, { days: 7 });
    for (const total of totals) {
      const rows = series.filter((row) => row.channel === total.channel);
      expect(rows.reduce((sum, row) => sum + row.sent, 0)).toBe(total.sent);
      expect(rows.reduce((sum, row) => sum + row.failed, 0)).toBe(total.failed);
    }
    // Đối chứng dương: tổng không phải toàn số 0.
    expect(totals.reduce((sum, row) => sum + row.sent, 0)).toBe(9);
  });

  it('chủ khác không thấy số của chủ này; chủ mới không có dữ liệu → mảng rỗng', async () => {
    expect(await getHourlySeries({ ownerId: stranger }, { hours: 72 })).toEqual([
      { hour: hourIso(day.today, '00'), channel: 'email', sent: 1, failed: 0 },
    ]);
    const nobody = await createOwner('hourly_nobody');
    expect(await getHourlySeries({ ownerId: nobody }, { hours: 72 })).toEqual([]);
  });

  it('toàn hệ thống cộng cả hai chủ (bộ lọc phạm vi có mặt ở cả ba bảng)', async () => {
    const all = await getHourlySeries({ ownerId: null }, { hours: 72 });
    const email00 = all.find((row) => row.channel === 'email' && row.hour === hourIso(day.today, '00'));
    expect(email00).toEqual({ hour: hourIso(day.today, '00'), channel: 'email', sent: 4, failed: 0 });
  });
});

describe('sendStats — getHourlySeries: mốc đầu cửa sổ là ĐẦU GIỜ VN, cho cả cột timestamp lẫn timestamptz', () => {
  let owner;
  let startHourIso;
  let currentHourIso;
  let beforeCurrentHourIso;
  // Cửa sổ 24 giờ = 23 giờ đã khép + giờ hiện tại → mốc đầu = đầu giờ của 23 giờ trước (không phải "bây giờ - 24 giờ").
  const START = "date_trunc('hour', LOCALTIMESTAMP) - interval '23 hours'";
  const CURRENT = "date_trunc('hour', LOCALTIMESTAMP)";

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('hourly_edge');
    const { rows } = await db.query(
      `SELECT to_char(${START}, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' AS start_at,
              to_char(${CURRENT}, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' AS current_at`
    );
    startHourIso = new Date(rows[0].start_at).toISOString();
    currentHourIso = new Date(rows[0].current_at).toISOString();
    const c = await createContext(owner);

    await insertEmail(c, { to: 'in@t.vn', when: START }); // đúng giây đầu của cửa sổ → trong
    await insertEmail(c, { to: 'out@t.vn', when: `${START} - interval '1 second'` }); // giây cuối của giờ trước → ngoài
    await insertZalo(c, { to: '0900000001', colStatus: 'sent', when: START });
    await insertZalo(c, { to: '0900000002', colStatus: 'sent', when: `${START} - interval '1 second'` });
    await insertAdapter(c, { to: 't-in', status: 'sent', when: START });
    await insertAdapter(c, { to: 't-out', status: 'sent', when: `${START} - interval '1 second'` });
    await insertEmail(c, { to: 'now@t.vn', when: CURRENT }); // giờ hiện tại đang chạy dở vẫn có mặt
    await insertEmail(c, { to: 'before-now@t.vn', when: `${CURRENT} - interval '1 second'` }); // giây cuối của giờ liền trước giờ hiện tại
    beforeCurrentHourIso = new Date(new Date(currentHourIso).getTime() - 3600_000).toISOString();
  });

  it('hours = 24: giây đầu của giờ thứ 24 (tính lùi) trong, giây liền trước ngoài — email, Zalo và Telegram đều đúng biên', async () => {
    expect(await getHourlySeries({ ownerId: owner }, { hours: 24 })).toEqual([
      { hour: startHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: startHourIso, channel: 'zalo_personal', sent: 1, failed: 0 },
      { hour: startHourIso, channel: 'telegram', sent: 1, failed: 0 },
      { hour: beforeCurrentHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: currentHourIso, channel: 'email', sent: 1, failed: 0 },
    ]);
  });

  it('hours = 1: chỉ giờ hiện tại — giây cuối của giờ liền trước nằm NGOÀI; hours = 2 thì lấy thêm đúng một giờ đó', async () => {
    expect(await getHourlySeries({ ownerId: owner }, { hours: 1 })).toEqual([
      { hour: currentHourIso, channel: 'email', sent: 1, failed: 0 },
    ]);
    expect(await getHourlySeries({ ownerId: owner }, { hours: 2 })).toEqual([
      { hour: beforeCurrentHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: currentHourIso, channel: 'email', sent: 1, failed: 0 },
    ]);
  });

  it('hours = 25: lấy thêm đúng MỘT giờ phía trước — ba dòng "out" (giây cuối của giờ trước) nay vào cửa sổ', async () => {
    const previousHourIso = new Date(new Date(startHourIso).getTime() - 3600_000).toISOString();
    expect(await getHourlySeries({ ownerId: owner }, { hours: 25 })).toEqual([
      { hour: previousHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: previousHourIso, channel: 'zalo_personal', sent: 1, failed: 0 },
      { hour: previousHourIso, channel: 'telegram', sent: 1, failed: 0 },
      { hour: startHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: startHourIso, channel: 'zalo_personal', sent: 1, failed: 0 },
      { hour: startHourIso, channel: 'telegram', sent: 1, failed: 0 },
      { hour: beforeCurrentHourIso, channel: 'email', sent: 1, failed: 0 },
      { hour: currentHourIso, channel: 'email', sent: 1, failed: 0 },
    ]);
  });
});

// ───────────────────────── Theo lượt chạy / chiến dịch / người thực hiện ─────────────────────────

describe('sendStats — getRunTotals (toàn bộ dòng của lượt, không theo cửa sổ, đúng chủ)', () => {
  let owner;
  let other;
  let run1;
  let run2;
  let run3;
  let otherRun;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('runs');
    other = await createOwner('runs_other');
    const c1 = await createContext(owner);
    run1 = c1.runId;
    run2 = await addRun(c1);
    const c2 = await createContext(owner);
    run3 = c2.runId;
    const cOther = await createContext(other);
    otherRun = cOther.runId;

    // Lượt 1: email 3 gửi được (100 ngày trước — ngoài mọi cửa sổ) + 1 lỗi; Zalo cá nhân 1 gửi được + 2 người lỗi.
    for (const to of ['a@t.vn', 'b@t.vn', 'c@t.vn']) await insertEmail(c1, { to, when: AT.hundredDaysAgo });
    await insertEmail(c1, { to: 'x@t.vn', status: 'failed', when: AT.hundredDaysAgo });
    await insertZalo(c1, { to: '0900000001', colStatus: 'sent' });
    await insertZalo(c1, { to: '0900000002', colStatus: 'failed' });
    await insertZalo(c1, { to: '0900000003', colStatus: 'failed' });
    // Lượt 2 (cùng chiến dịch): 1 email.
    await insertEmail(c1, { to: 'a@t.vn', runId: run2 });
    // Lượt 3 (chiến dịch khác): Telegram 1 gửi được + 1 lỗi.
    await insertAdapter(c2, { to: 'peer1', status: 'sent' });
    await insertAdapter(c2, { to: 'peer2', status: 'failed', category: 'hard', message: 'x' });
    // Lượt của chủ khác.
    await insertEmail(cOther, { to: 'o@t.vn' });
  });

  it('gồm cả dòng 100 ngày trước, đúng lượt, sắp theo lượt rồi kênh', async () => {
    expect(await getRunTotals({ ownerId: owner }, [run3, run1, run2])).toEqual([
      { runId: run1, channel: 'email', sent: 3, failed: 1 },
      { runId: run1, channel: 'zalo_personal', sent: 1, failed: 2 },
      { runId: run2, channel: 'email', sent: 1, failed: 0 },
      { runId: run3, channel: 'telegram', sent: 1, failed: 1 },
    ]);
  });

  it('chỉ lượt được hỏi mới có mặt (bộ lọc lượt nằm ở cả ba bảng)', async () => {
    expect(await getRunTotals({ ownerId: owner }, [run2])).toEqual([
      { runId: run2, channel: 'email', sent: 1, failed: 0 },
    ]);
    expect(await getRunTotals({ ownerId: owner }, [run3])).toEqual([
      { runId: run3, channel: 'telegram', sent: 1, failed: 1 },
    ]);
    expect(await getRunTotals({ ownerId: owner }, [run1])).toEqual([
      { runId: run1, channel: 'email', sent: 3, failed: 1 },
      { runId: run1, channel: 'zalo_personal', sent: 1, failed: 2 },
    ]);
  });

  it('lượt của chủ khác không lộ ra khi hỏi bằng phạm vi của chủ này', async () => {
    expect(await getRunTotals({ ownerId: owner }, [otherRun])).toEqual([]);
    expect(await getRunTotals({ ownerId: other }, [otherRun])).toEqual([
      { runId: otherRun, channel: 'email', sent: 1, failed: 0 },
    ]);
    // Toàn hệ thống thì thấy.
    expect(await getRunTotals({ ownerId: null }, [otherRun])).toHaveLength(1);
  });

  it('danh sách lượt rỗng → mảng rỗng; id sai → ném lỗi', async () => {
    expect(await getRunTotals({ ownerId: owner }, [])).toEqual([]);
    await expect(getRunTotals({ ownerId: owner }, undefined)).rejects.toThrow(TypeError);
    await expect(getRunTotals({ ownerId: owner }, [run1, 'abc'])).rejects.toThrow(TypeError);
  });
});

describe('sendStats — getCampaignTotals và getActorTotals', () => {
  let owner;
  let employee;
  let campaignA;
  let campaignB;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('camp');
    employee = await createOwner('camp_employee');
    const a = await createContext(owner); // chiến dịch do chủ tạo
    const b = await createContext(owner, { createdBy: employee }); // chiến dịch do nhân viên tạo
    campaignA = a.campaignId;
    campaignB = b.campaignId;

    // Chiến dịch A: email 2 gửi được (1 đã mở, 1 đã nhấp) + 1 lỗi.
    await insertEmail(a, { to: 'a1@t.vn', status: 'opened', opened: true });
    await insertEmail(a, { to: 'a2@t.vn', status: 'clicked', opened: true, clicked: true, clickCount: 1 });
    await insertEmail(a, { to: 'a3@t.vn', status: 'failed' });
    // Chiến dịch B (nhân viên): email 1 đã mở, Zalo cá nhân 2 gửi được + 1 lỗi, Telegram 1 gửi được.
    await insertEmail(b, { to: 'b1@t.vn', status: 'opened', opened: true });
    await insertZalo(b, { to: '0900000001', colStatus: 'sent', clickCount: 1 });
    await insertZalo(b, { to: '0900000002', colStatus: 'sent' });
    await insertZalo(b, { to: '0900000003', colStatus: 'failed' });
    await insertAdapter(b, { to: 'peer1', status: 'sent' });
    // Dòng chưa gắn người thực hiện (actor_user_id NULL) — thư gửi cho chiến dịch A.
    await insertEmail(a, { to: 'a4@t.vn', status: 'sent', actorId: null });
    // Thư của chiến dịch đã xoá (id_campaign / id_run NULL do FK SET NULL), người thực hiện là chủ.
    await insertEmail(a, { to: 'gone@t.vn', status: 'sent', campaignId: null, runId: null });
  });

  it('getCampaignTotals theo cửa sổ: từng chiến dịch, từng kênh, kèm mở/nhấp', async () => {
    expect(await getCampaignTotals({ ownerId: owner }, DAYS_7, null)).toEqual([
      { campaignId: campaignA, channel: 'email', sent: 3, failed: 1, opened: 2, clicked: 1 },
      { campaignId: campaignB, channel: 'email', sent: 1, failed: 0, opened: 1, clicked: 0 },
      { campaignId: campaignB, channel: 'zalo_personal', sent: 2, failed: 1, opened: 0, clicked: 1 },
      { campaignId: campaignB, channel: 'telegram', sent: 1, failed: 0, opened: 0, clicked: 0 },
      // Chiến dịch đã xoá vẫn có mặt (xếp cuối) để tổng các dòng khớp tổng theo kênh.
      { campaignId: null, channel: 'email', sent: 1, failed: 0, opened: 0, clicked: 0 },
    ]);
  });

  it('getCampaignTotals theo danh sách chiến dịch, không cửa sổ; thiếu cả hai thì ném lỗi', async () => {
    expect(await getCampaignTotals({ ownerId: owner }, null, [campaignB])).toEqual([
      { campaignId: campaignB, channel: 'email', sent: 1, failed: 0, opened: 1, clicked: 0 },
      { campaignId: campaignB, channel: 'zalo_personal', sent: 2, failed: 1, opened: 0, clicked: 1 },
      { campaignId: campaignB, channel: 'telegram', sent: 1, failed: 0, opened: 0, clicked: 0 },
    ]);
    // Chỉ chiến dịch A (email): Zalo và Telegram của chiến dịch B không được lọt vào (bộ lọc chiến dịch ở cả ba bảng).
    expect(await getCampaignTotals({ ownerId: owner }, null, [campaignA])).toEqual([
      { campaignId: campaignA, channel: 'email', sent: 3, failed: 1, opened: 2, clicked: 1 },
    ]);
    expect(await getCampaignTotals({ ownerId: owner }, null, [])).toEqual([]);
    await expect(getCampaignTotals({ ownerId: owner }, null, null)).rejects.toThrow(TypeError);
  });

  it('getChannelTotals / getDailySeries nhận campaignIds (PR-5): lọc trong CTE ở cả ba bảng; [] = không chiến dịch nào, không phải tất cả', async () => {
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

    // Chỉ chiến dịch A (email): Zalo và Telegram của chiến dịch B không lọt vào.
    expect(await getChannelTotals({ ownerId: owner }, DAYS_7, { campaignIds: [campaignA] })).toEqual(
      expectedTotals({ email: { sent: 3, failed: 1, opened: 2, clicked: 1 } })
    );
    // Chỉ chiến dịch B: cả ba bảng (email, Zalo, adapter) cùng bị lọc.
    expect(await getChannelTotals({ ownerId: owner }, DAYS_7, { campaignIds: [campaignB] })).toEqual(
      expectedTotals({
        email: { sent: 1, opened: 1 },
        zalo_personal: { sent: 2, failed: 1, clicked: 1 },
        telegram: { sent: 1 },
      })
    );
    // Không truyền = mọi chiến dịch (kể cả thư của chiến dịch đã xoá): 3 + 1 + 1 email.
    expect((await getChannelTotals({ ownerId: owner }, DAYS_7)).find((row) => row.channel === 'email').sent).toBe(5);
    expect(await getChannelTotals({ ownerId: owner }, DAYS_7, { campaignIds: [] })).toEqual(expectedTotals());

    // Chuỗi theo ngày cùng bộ lọc: tổng các ngày = tổng theo kênh cùng bộ lọc.
    const dailyA = await getDailySeries({ ownerId: owner }, DAYS_7, { campaignIds: [campaignA] });
    expect({ sent: sum(dailyA, 'sent'), failed: sum(dailyA, 'failed') }).toEqual({ sent: 3, failed: 1 });
    expect(dailyA.every((row) => row.channel === 'email')).toBe(true);
    const dailyB = await getDailySeries({ ownerId: owner }, DAYS_7, { campaignIds: [campaignB] });
    expect({ sent: sum(dailyB, 'sent'), failed: sum(dailyB, 'failed') }).toEqual({ sent: 4, failed: 1 });
    expect(await getDailySeries({ ownerId: owner }, DAYS_7, { campaignIds: [] })).toEqual([]);
    await expect(getChannelTotals({ ownerId: owner }, DAYS_7, { campaignIds: ['x'] })).rejects.toThrow(TypeError);
  });

  it('getActorTotals: người tạo chiến dịch (chủ, nhân viên) và dòng chưa gắn người', async () => {
    expect(await getActorTotals({ ownerId: owner }, DAYS_7)).toEqual([
      { actorUserId: owner, sent: 3, failed: 1 }, // A: 2 gửi được (a1, a2) + thư chiến dịch đã xoá; lỗi a3
      { actorUserId: employee, sent: 4, failed: 1 }, // B: email 1 + Zalo 2 + Telegram 1; Zalo lỗi 1
      { actorUserId: null, sent: 1, failed: 0 }, // a4
    ]);
  });
});

// ───────────────────────── Danh sách lỗi cuối ─────────────────────────

describe('sendStats — listFinalFailures', () => {
  let owner;
  let stranger;
  let runId;
  let otherRunId;

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('fail');
    stranger = await createOwner('fail_stranger');
    const c = await createContext(owner);
    runId = c.runId;
    otherRunId = await addRun(c);

    // Email: hai lần thử lỗi; lý do lấy từ lần thử lỗi cuối có lý do (bounce_reason, rồi error_message).
    await insertEmail(c, { to: 'bad@t.vn', status: 'failed', bounceReason: 'lý do lần 1', when: at('2026-03-15 09:00:00') });
    await insertEmail(c, { to: 'bad@t.vn', status: 'failed', errorMessage: 'lý do lần 2', when: at('2026-03-15 10:00:00') });
    // Email lỗi rồi gửi được → không nằm trong danh sách.
    await insertEmail(c, { to: 'ok@t.vn', status: 'failed', when: at('2026-03-15 09:30:00') });
    await insertEmail(c, { to: 'ok@t.vn', status: 'sent', when: at('2026-03-15 09:45:00') });
    // Zalo: lý do ở tracking_metadata.error; aborted không phải lỗi.
    await insertZalo(c, { to: '0901', colStatus: 'failed', error: 'Số điện thoại không tồn tại trên Zalo', when: at('2026-03-15 11:00:00') });
    await insertZalo(c, { to: '0902', colStatus: 'aborted', when: at('2026-03-15 11:10:00') });
    await insertZalo(c, { channel: 'zalo_group', to: 'g9', colStatus: 'failed', error: 'Nhóm không tồn tại', groupName: 'Nhóm Bán Hàng', when: at('2026-03-15 12:00:00') });
    // Telegram: dòng hẹn thử lại + lỗi cuối; lý do = "loại: nội dung".
    await insertAdapter(c, { to: 'peerx', status: 'failed', category: 'transient_retry', message: '[lần 1/3] timeout', display: 'Nguyen Van A', when: at('2026-03-15 12:30:00') });
    await insertAdapter(c, { to: 'peerx', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID', display: 'Nguyen Van A', when: at('2026-03-15 13:00:00') });
    // Lỗi ở lượt khác của cùng chủ.
    await insertEmail(c, { to: 'other-run@t.vn', status: 'failed', runId: otherRunId, when: at('2026-03-15 14:00:00') });
    // Lỗi của chủ khác.
    const cStranger = await createContext(stranger);
    await insertEmail(cStranger, { to: 'stranger@t.vn', status: 'failed', when: at('2026-03-15 15:00:00') });
  });

  it('theo lượt: lỗi cuối của từng đích, mới nhất trước, đủ lý do / người nhận / thời điểm', async () => {
    const failures = await listFinalFailures({ ownerId: owner }, { runId });
    expect(failures.map(({ at: _at, ...rest }) => rest)).toEqual([
      {
        runId, campaignId: expect.any(Number), channel: 'telegram', recipient: 'peerx', recipientDisplay: 'Nguyen Van A',
        reason: 'hard: PEER_ID_INVALID', attempts: 1,
      },
      {
        runId, campaignId: expect.any(Number), channel: 'zalo_group', recipient: 'g9', recipientDisplay: 'Nhóm Bán Hàng',
        reason: 'Nhóm không tồn tại', attempts: 1,
      },
      {
        runId, campaignId: expect.any(Number), channel: 'zalo_personal', recipient: '0901', recipientDisplay: null,
        reason: 'Số điện thoại không tồn tại trên Zalo', attempts: 1,
      },
      {
        runId, campaignId: expect.any(Number), channel: 'email', recipient: 'bad@t.vn', recipientDisplay: null,
        reason: 'lý do lần 2', attempts: 2,
      },
    ]);
    // Thời điểm là timestamptz thật: 13:00 giờ VN = 06:00 UTC; 10:00 giờ VN = 03:00 UTC.
    expect(failures[0].at.toISOString()).toBe('2026-03-15T06:00:00.000Z');
    expect(failures[3].at.toISOString()).toBe('2026-03-15T03:00:00.000Z');
  });

  it('số đích lỗi của lượt bằng failed của getRunTotals', async () => {
    const failures = await listFinalFailures({ ownerId: owner }, { runId, limit: 500 });
    const totals = await getRunTotals({ ownerId: owner }, [runId]);
    expect(failures).toHaveLength(totals.reduce((sum, row) => sum + row.failed, 0));
  });

  it('limit cắt bớt; không cùng lượt / cùng chủ thì không lẫn', async () => {
    const two = await listFinalFailures({ ownerId: owner }, { runId, limit: 2 });
    expect(two.map((failure) => failure.channel)).toEqual(['telegram', 'zalo_group']);
    const otherRun = await listFinalFailures({ ownerId: owner }, { runId: otherRunId });
    expect(otherRun.map((failure) => failure.recipient)).toEqual(['other-run@t.vn']);
    expect(await listFinalFailures({ ownerId: stranger }, { runId })).toEqual([]);
  });

  it('theo cửa sổ (không runId): thấy lỗi của mọi lượt của chủ, đúng biên ngày', async () => {
    const day = await listFinalFailures({ ownerId: owner }, { window: { fromDate: '2026-03-15', toDate: '2026-03-15' } });
    expect(day).toHaveLength(5); // 4 đích của lượt 1 + 1 đích của lượt khác
    expect(await listFinalFailures({ ownerId: owner }, { window: { fromDate: '2026-03-16', toDate: '2026-03-16' } })).toEqual([]);
    expect(await listFinalFailures({ ownerId: owner }, { window: { fromDate: '2026-03-14', toDate: '2026-03-14' } })).toEqual([]);
  });

  it('thiếu cả runId lẫn window, hoặc limit sai → ném lỗi', async () => {
    await expect(listFinalFailures({ ownerId: owner }, {})).rejects.toThrow(TypeError);
    await expect(listFinalFailures({ ownerId: owner }, { runId, limit: 0 })).rejects.toThrow(RangeError);
    await expect(listFinalFailures({ ownerId: owner }, { runId, limit: 501 })).rejects.toThrow(RangeError);
  });
});

// ───────────────────────── Nhất quán giữa các phép gom ─────────────────────────

/** Bộ sinh số giả ngẫu nhiên có hạt giống cố định — dữ liệu giống nhau mỗi lần chạy. */
function mulberry32(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sendStats — các phép gom cộng khớp nhau trên cùng dữ liệu', () => {
  let owner;
  let employee;
  let runIds;
  const WINDOW = { days: 30 };

  beforeAll(async () => {
    await dbHelpers.truncateAll();
    owner = await createOwner('consist');
    employee = await createOwner('consist_employee');
    const c1 = await createContext(owner);
    const c2 = await createContext(owner, { createdBy: employee });
    const nodes = [[c1.nodeId, await addNode(c1)], [c2.nodeId, await addNode(c2)]];
    const contexts = [c1, c2];
    runIds = [c1.runId, c2.runId];

    const random = mulberry32(20260930);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const STATUS = {
      email: ['sent', 'sent', 'opened', 'clicked', 'failed', 'failed', 'bounced', 'queued'],
      zalo: ['sent', 'sent', 'failed', 'failed', 'failed', 'aborted'],
      adapter: ['sent', 'sent', 'failed', 'failed', 'queued', 'retry'],
    };
    const channels = ['email', 'zalo_personal', 'zalo_group', 'zalo_friend_request', 'telegram', 'whatsapp'];

    for (let i = 0; i < 360; i += 1) {
      const which = Math.floor(random() * 2);
      const context = contexts[which];
      const channel = pick(channels);
      const to = `r${Math.floor(random() * 10)}`;
      const step = 1 + Math.floor(random() * 2);
      const when = `LOCALTIMESTAMP - interval '${Math.floor(random() * 24 * 6)} hours'`;
      const nodeId = pick(nodes[which]);
      const common = { when, nodeId, preview: random() < 0.05 };
      if (channel === 'email') {
        const status = pick(STATUS.email);
        await insertEmail(context, {
          ...common, to: `${to}@t.vn`, status, step,
          opened: status === 'opened' || status === 'clicked', clicked: status === 'clicked',
        });
      } else if (channel.startsWith('zalo')) {
        const status = pick(STATUS.zalo);
        await insertZalo(context, { ...common, channel, to, colStatus: status, step, clickCount: status === 'sent' && random() < 0.3 ? 1 : 0 });
      } else {
        const status = pick(STATUS.adapter);
        await insertAdapter(context, {
          ...common, channel, to, step,
          status: status === 'retry' ? 'failed' : status,
          category: status === 'retry' ? 'transient_retry' : (status === 'failed' ? 'hard' : null),
          message: status === 'failed' ? 'lỗi cứng' : null,
        });
      }
    }
  });

  it('dữ liệu thử đủ lớn và có cả gửi được lẫn lỗi (chống bài "khớp" vì toàn số 0)', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, WINDOW);
    expect(totals.reduce((sum, row) => sum + row.sent, 0)).toBeGreaterThan(50);
    expect(totals.reduce((sum, row) => sum + row.failed, 0)).toBeGreaterThan(20);
    for (const row of totals) {
      expect(row.sent + row.failed).toBeGreaterThan(0);
    }
  });

  it('chuỗi theo ngày cộng lại = tổng theo kênh (sent và failed)', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, WINDOW);
    const series = await getDailySeries({ ownerId: owner }, WINDOW);
    for (const total of totals) {
      const rows = series.filter((row) => row.channel === total.channel);
      expect(rows.reduce((sum, row) => sum + row.sent, 0)).toBe(total.sent);
      expect(rows.reduce((sum, row) => sum + row.failed, 0)).toBe(total.failed);
    }
  });

  it('tổng theo lượt chạy = tổng theo kênh (dữ liệu nằm trong cửa sổ)', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, WINDOW);
    const perRun = await getRunTotals({ ownerId: owner }, runIds);
    for (const total of totals) {
      const rows = perRun.filter((row) => row.channel === total.channel);
      expect(rows.reduce((sum, row) => sum + row.sent, 0)).toBe(total.sent);
      expect(rows.reduce((sum, row) => sum + row.failed, 0)).toBe(total.failed);
    }
  });

  it('tổng theo chiến dịch = tổng theo kênh (sent, failed, opened, clicked)', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, WINDOW);
    const perCampaign = await getCampaignTotals({ ownerId: owner }, WINDOW, null);
    for (const total of totals) {
      const rows = perCampaign.filter((row) => row.channel === total.channel);
      for (const key of ['sent', 'failed', 'opened', 'clicked']) {
        expect(rows.reduce((sum, row) => sum + row[key], 0)).toBe(total[key]);
      }
    }
  });

  it('tổng theo người thực hiện = tổng mọi kênh; danh sách lỗi cuối có đúng số phần tử failed', async () => {
    const totals = await getChannelTotals({ ownerId: owner }, WINDOW);
    const actors = await getActorTotals({ ownerId: owner }, WINDOW);
    expect(actors.map((row) => row.actorUserId).sort((a, b) => a - b)).toEqual([owner, employee].sort((a, b) => a - b));
    expect(actors.reduce((sum, row) => sum + row.sent, 0)).toBe(totals.reduce((sum, row) => sum + row.sent, 0));
    const totalFailed = totals.reduce((sum, row) => sum + row.failed, 0);
    expect(actors.reduce((sum, row) => sum + row.failed, 0)).toBe(totalFailed);
    const failures = await listFinalFailures({ ownerId: owner }, { window: WINDOW, limit: 500 });
    expect(failures).toHaveLength(totalFailed);
  });
});

describe('sendStats — kênh lấy từ registry', () => {
  it('trả đủ 6 kênh đúng thứ tự dù không có dữ liệu', async () => {
    await dbHelpers.truncateAll();
    const owner = await createOwner('empty');
    expect(await getChannelTotals({ ownerId: owner }, DAYS_7)).toEqual(expectedTotals());
    expect(await getDailySeries({ ownerId: owner }, DAYS_7)).toEqual([]);
    expect(await getActorTotals({ ownerId: owner }, DAYS_7)).toEqual([]);
  });
});
