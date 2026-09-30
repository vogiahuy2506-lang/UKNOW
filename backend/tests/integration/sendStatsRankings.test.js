/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — hai hàm xếp hạng THÊM vào module đếm gửi tin dùng chung
 * (services/stats/sendStats.service.js): `getFailureReasons` (nguyên nhân chưa gửi được hàng đầu) và `getOwnerTotals`
 * (khách gửi nhiều nhất). Cùng bộ CTE với các hàm PR-4a nên phải cộng khớp `getChannelTotals`.
 *
 * Chạy trên DB thật (5433). Số kỳ vọng VIẾT TAY từ dữ liệu dựng ở đầu mỗi ca. Mốc thời gian là biểu thức giờ VN naive
 * (`LOCALTIMESTAMP - …`) như bảng tin ở production.
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import {
  getChannelTotals,
  getFailureReasons,
  getOwnerTotals,
  listFinalFailures,
} from '../../src/services/stats/sendStats.service.js';

const AT = {
  recent: "LOCALTIMESTAMP - interval '1 hour'",
  earlier: "LOCALTIMESTAMP - interval '3 hours'",
  fortyDaysAgo: "LOCALTIMESTAMP - interval '40 days'",
};
const DAYS_30 = { days: 30 };

beforeEach(async () => {
  await dbHelpers.truncateAll();
});

afterAll(async () => {
  await db.pool.end();
});

let phoneSequence = 20000000;

async function createOwner(label) {
  phoneSequence += 1;
  const user = await dbHelpers.createUser({ username: `rk_${label}`, phone: `09${phoneSequence}` });
  return Number(user.id);
}

async function createContext(ownerId) {
  const campaign = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status)
     VALUES ($1, $1, $1, 'rankings', 'email', 'active') RETURNING id`,
    [ownerId]
  );
  const campaignId = Number(campaign.rows[0].id);
  const node = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, execution_order)
     VALUES ($1, 'action', 'send_email', 'send', 1) RETURNING id`,
    [campaignId]
  );
  const run = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
     VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [campaignId, ownerId]
  );
  return { ownerId, campaignId, nodeId: Number(node.rows[0].id), runId: Number(run.rows[0].id) };
}

async function email(c, { to, status = 'sent', when = AT.recent, reason = null, bounceReason = null, runId = c.runId }) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, recipient_email, email_step, status, is_preview,
        bounce_reason, error_message, tracking_token, sent_at, created_at)
     VALUES ($1, $1, $2, $3, $4, $5, 1, $6, FALSE, $7, $8, md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [c.ownerId, c.campaignId, runId, c.nodeId, to, status, bounceReason, reason]
  );
}

async function zalo(c, { channel = 'zalo_personal', to, status, when = AT.recent, error = null }) {
  await db.query(
    `INSERT INTO zalo_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_type, recipient_value, status,
        tracking_metadata, is_preview, tracking_token, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, 'phone', $6, $7, $8::jsonb, FALSE, md5(random()::text || clock_timestamp()::text),
             ${when}, ${when}, ${when})`,
    [c.ownerId, c.campaignId, c.runId, c.nodeId, channel, to, status, JSON.stringify({ status, stepIndex: 1, ...(error ? { error } : {}) })]
  );
}

async function adapter(c, { channel = 'telegram', to, status, category = null, message = null, when = AT.recent }) {
  const instant = `((${when}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_key, step_index, status,
        error_category, error_message, is_preview, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6, 1, $7, $8, $9, FALSE, ${status === 'sent' ? instant : 'NULL'}, ${instant}, ${instant})`,
    [c.ownerId, c.campaignId, c.runId, c.nodeId, channel, to, status, category, message]
  );
}

// Thứ tự thật: nhiều đích nhất trước, bằng nhau thì lần lỗi mới nhất (phụ thuộc thứ tự chèn của test). Test so theo thứ
// tự ỔN ĐỊNH (đích giảm dần, rồi kênh, rồi lý do) để không dính vào mili-giây của dữ liệu dựng.
const reasonRows = (rows) => rows
  .map((row) => [row.channel, row.reason, row.count])
  .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]) || String(a[1] ?? '').localeCompare(String(b[1] ?? '')));

describe('getFailureReasons', () => {
  it('gom theo (kênh, lý do) trên ĐÍCH chưa gửi được: thử nhiều lần = một; lỗi rồi gửi được = không có; aborted / hẹn thử lại không phải lỗi', async () => {
    const owner = await createOwner('a');
    const c = await createContext(owner);
    // Zalo "L1": 2 đích (đích 1 thử 3 lần); đích 3 lỗi rồi gửi được; đích 4 chỉ aborted.
    for (let i = 0; i < 3; i += 1) await zalo(c, { to: '0900000001', status: 'failed', error: 'L1' });
    await zalo(c, { to: '0900000002', status: 'failed', error: 'L1' });
    await zalo(c, { to: '0900000003', status: 'failed', error: 'L1' });
    await zalo(c, { to: '0900000003', status: 'sent' });
    await zalo(c, { to: '0900000004', status: 'aborted' });
    // Email: hai đích cùng lý do "M", một đích lỗi rồi gửi được.
    await email(c, { to: 'a@t.vn', status: 'failed', reason: 'M' });
    await email(c, { to: 'b@t.vn', status: 'failed', reason: 'M' });
    await email(c, { to: 'c@t.vn', status: 'failed', reason: 'M' });
    await email(c, { to: 'c@t.vn', status: 'sent' });
    // Telegram: một lỗi cứng; một dòng hẹn thử lại (không phải lỗi cuối).
    await adapter(c, { to: 't1', status: 'failed', category: 'hard', message: 'PEER_ID_INVALID' });
    await adapter(c, { to: 't2', status: 'failed', category: 'transient_retry', message: 'timeout' });

    const rows = await getFailureReasons({ ownerId: owner }, DAYS_30, { limit: 100 });
    expect(reasonRows(rows)).toEqual([
      ['email', 'M', 2],
      ['zalo_personal', 'L1', 2],
      ['telegram', 'hard: PEER_ID_INVALID', 1],
    ]);
    const totals = await getChannelTotals({ ownerId: owner }, DAYS_30);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(totals.reduce((sum, row) => sum + row.failed, 0));
    expect(rows.every((row) => row.lastAt instanceof Date)).toBe(true);
  });

  it('lý do là của lần thử lỗi CUỐI; bounce_reason được ưu tiên hơn error_message (cùng quy ước listFinalFailures)', async () => {
    const owner = await createOwner('b');
    const c = await createContext(owner);
    await email(c, { to: 'a@t.vn', status: 'failed', reason: 'Lần một', when: AT.earlier });
    await email(c, { to: 'a@t.vn', status: 'failed', reason: 'Lần hai', when: AT.recent });
    await email(c, { to: 'b@t.vn', status: 'failed', reason: 'Bị bỏ', bounceReason: 'Bounce thắng' });
    const rows = await getFailureReasons({ ownerId: owner }, DAYS_30);
    expect(reasonRows(rows)).toEqual([['email', 'Bounce thắng', 1], ['email', 'Lần hai', 1]]);
    // Khớp danh sách chi tiết của cùng module.
    const detail = await listFinalFailures({ ownerId: owner }, { window: DAYS_30 });
    expect(detail.map((row) => row.reason).sort()).toEqual(['Bounce thắng', 'Lần hai']);
  });

  it('chuẩn hoá: bỏ địa chỉ email và dãy ≥ 7 chữ số, gộp khoảng trắng; mã ngắn (550, 5.1.1, 4 số) được giữ; lý do rỗng / NULL → một nhóm null', async () => {
    const owner = await createOwner('c');
    const c = await createContext(owner);
    await email(c, { to: 'a@x.vn', status: 'failed', reason: '550 5.1.1 <a@x.vn>: Recipient address rejected' });
    await email(c, { to: 'b@y.vn', status: 'failed', reason: '550   5.1.1 <b@y.vn>:  Recipient   address rejected' });
    await email(c, { to: 'c@y.vn', status: 'failed', reason: '450 4.2.2 <c@y.vn>: Mailbox full' });
    await zalo(c, { to: '0900000001', status: 'failed', error: 'Số 0900000001 không tồn tại (mã 1234)' });
    await zalo(c, { to: '0900000002', status: 'failed', error: 'Số 0911222333 không tồn tại (mã 1234)' });
    await email(c, { to: 'd@y.vn', status: 'failed', reason: null });
    await email(c, { to: 'e@y.vn', status: 'failed', reason: '   ' });
    const rows = await getFailureReasons({ ownerId: owner }, DAYS_30);
    expect(reasonRows(rows)).toEqual([
      ['email', null, 2],
      ['email', '550 5.1.1 <email> Recipient address rejected', 2],
      ['zalo_personal', 'Số <số> không tồn tại (mã 1234)', 2],
      ['email', '450 4.2.2 <email> Mailbox full', 1],
    ]);
  });

  it('gom trong SQL, KHÔNG trần dòng: 620 đích lý do A (cũ) + 300 đích lý do B (mới) → A = 620, B = 300', async () => {
    const owner = await createOwner('d');
    const c = await createContext(owner);
    const bulk = (count, reason, prefix, when) => db.query(
      `INSERT INTO email_messages
         (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, recipient_email, email_step, status, is_preview,
          error_message, tracking_token, sent_at, created_at)
       SELECT $1::bigint, $1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::text || g::text || '@t.vn', 1, 'failed', FALSE,
              $6::text, md5($5::text || g::text || clock_timestamp()::text), ${when}, ${when}
       FROM generate_series(1, $7::int) AS g`,
      [c.ownerId, c.campaignId, c.runId, c.nodeId, prefix, reason, count]
    );
    await bulk(620, 'Lý do A', 'a', AT.earlier);
    await bulk(300, 'Lý do B', 'b', AT.recent);
    const rows = await getFailureReasons({ ownerId: owner }, DAYS_30);
    expect(reasonRows(rows)).toEqual([['email', 'Lý do A', 620], ['email', 'Lý do B', 300]]);
  });

  it('limit cắt ở SQL (nhóm nhiều nhất trước); mặc định 10', async () => {
    const owner = await createOwner('e');
    const c = await createContext(owner);
    for (let group = 1; group <= 12; group += 1) {
      for (let k = 0; k < group; k += 1) await email(c, { to: `g${group}-${k}@t.vn`, status: 'failed', reason: `Nhóm ${String(group).padStart(2, '0')}` });
    }
    expect((await getFailureReasons({ ownerId: owner }, DAYS_30, { limit: 3 })).map((row) => row.count)).toEqual([12, 11, 10]);
    expect(await getFailureReasons({ ownerId: owner }, DAYS_30)).toHaveLength(10);
  });

  it('excludeChannels loại kênh khỏi phép đếm (kết bạn); không loại thì kết bạn có mặt', async () => {
    const owner = await createOwner('f');
    const c = await createContext(owner);
    await zalo(c, { channel: 'zalo_friend_request', to: '0911000001', status: 'failed', error: 'Đã gửi lời mời' });
    await zalo(c, { to: '0900000001', status: 'failed', error: 'Lỗi tin' });
    expect(reasonRows(await getFailureReasons({ ownerId: owner }, DAYS_30, { excludeChannels: ['zalo_friend_request'] })))
      .toEqual([['zalo_personal', 'Lỗi tin', 1]]);
    expect(reasonRows(await getFailureReasons({ ownerId: owner }, DAYS_30)).sort())
      .toEqual([['zalo_friend_request', 'Đã gửi lời mời', 1], ['zalo_personal', 'Lỗi tin', 1]]);
  });

  it('phạm vi và cửa sổ: một chủ / toàn hệ thống trừ excludeOwnerIds; tin ngoài cửa sổ không vào', async () => {
    const a = await createOwner('g1');
    const b = await createOwner('g2');
    const ca = await createContext(a);
    const cb = await createContext(b);
    await email(ca, { to: 'a1@t.vn', status: 'failed', reason: 'Của A' });
    await email(cb, { to: 'b1@t.vn', status: 'failed', reason: 'Của B' });
    await email(cb, { to: 'b2@t.vn', status: 'failed', reason: 'Của B cũ', when: AT.fortyDaysAgo });
    expect(reasonRows(await getFailureReasons({ ownerId: a }, DAYS_30))).toEqual([['email', 'Của A', 1]]);
    expect(reasonRows(await getFailureReasons({ ownerId: null }, DAYS_30)).sort()).toEqual([['email', 'Của A', 1], ['email', 'Của B', 1]]);
    expect(reasonRows(await getFailureReasons({ ownerId: null, excludeOwnerIds: [a] }, DAYS_30))).toEqual([['email', 'Của B', 1]]);
    expect(reasonRows(await getFailureReasons({ ownerId: null }, { days: 60 })).length).toBe(3);
  });

  it('dòng lỗi không định danh được đích (lượt chạy đã xoá) — mỗi dòng là một đích, không gom chung', async () => {
    const owner = await createOwner('h');
    const c = await createContext(owner);
    await email(c, { to: 'a@t.vn', status: 'failed', reason: 'Mồ côi', runId: null });
    await email(c, { to: 'a@t.vn', status: 'failed', reason: 'Mồ côi', runId: null });
    await email(c, { to: 'a@t.vn', status: 'sent', runId: null });
    expect(reasonRows(await getFailureReasons({ ownerId: owner }, DAYS_30))).toEqual([['email', 'Mồ côi', 2]]);
  });
});

describe('getOwnerTotals', () => {
  it('xếp theo đã gửi giảm dần, rồi chưa gửi được, rồi id; chỉ chủ có id; cắt ở SQL', async () => {
    const [a, b, c3, d] = [await createOwner('o1'), await createOwner('o2'), await createOwner('o3'), await createOwner('o4')];
    const [ca, cb, cc, cd] = [await createContext(a), await createContext(b), await createContext(c3), await createContext(d)];
    for (let i = 0; i < 3; i += 1) await email(ca, { to: `a${i}@t.vn` });
    for (let i = 0; i < 5; i += 1) await email(cb, { to: `b${i}@t.vn` });
    for (let i = 0; i < 3; i += 1) await email(cc, { to: `c${i}@t.vn` });
    await email(cc, { to: 'cbad@t.vn', status: 'failed', reason: 'x' }); // c3 bằng a về đã gửi nhưng có lỗi → trước a
    await email(cd, { to: 'dbad@t.vn', status: 'failed', reason: 'x' }); // chủ chỉ có lỗi vẫn có mặt (cuối)
    // Dòng thiếu chủ không phải khách.
    await email(ca, { to: 'orphan@t.vn' });
    await db.query("UPDATE email_messages SET workspace_owner_id = NULL WHERE recipient_email = 'orphan@t.vn'");

    expect(await getOwnerTotals({ ownerId: null }, DAYS_30)).toEqual([
      { ownerId: b, sent: 5, failed: 0 },
      { ownerId: c3, sent: 3, failed: 1 },
      { ownerId: a, sent: 3, failed: 0 },
      { ownerId: d, sent: 0, failed: 1 },
    ]);
    expect((await getOwnerTotals({ ownerId: null }, DAYS_30, { limit: 2 })).map((row) => row.ownerId)).toEqual([b, c3]);
  });

  it('cộng mọi kênh; excludeChannels bỏ kênh (kết bạn) — cùng tập với getChannelTotals; lọc chủ / loại chủ / cửa sổ', async () => {
    const a = await createOwner('p1');
    const b = await createOwner('p2');
    const ca = await createContext(a);
    const cb = await createContext(b);
    await email(ca, { to: 'a1@t.vn' });
    await zalo(ca, { to: '0900000001', status: 'sent' });
    await zalo(ca, { channel: 'zalo_friend_request', to: '0911000001', status: 'sent' });
    await adapter(ca, { to: 't1', status: 'sent' });
    await adapter(ca, { to: 't2', status: 'failed', category: 'hard', message: 'x' });
    await email(cb, { to: 'b1@t.vn' });
    await email(cb, { to: 'old@t.vn', when: AT.fortyDaysAgo });

    const noFriend = { excludeChannels: ['zalo_friend_request'] };
    expect(await getOwnerTotals({ ownerId: null }, DAYS_30, noFriend)).toEqual([
      { ownerId: a, sent: 3, failed: 1 }, // email 1 + Zalo 1 + Telegram 1; kết bạn không tính
      { ownerId: b, sent: 1, failed: 0 },
    ]);
    expect((await getOwnerTotals({ ownerId: null }, DAYS_30))[0]).toEqual({ ownerId: a, sent: 4, failed: 1 });
    expect(await getOwnerTotals({ ownerId: a }, DAYS_30, noFriend)).toEqual([{ ownerId: a, sent: 3, failed: 1 }]);
    expect(await getOwnerTotals({ ownerId: null, excludeOwnerIds: [a] }, DAYS_30, noFriend)).toEqual([{ ownerId: b, sent: 1, failed: 0 }]);
    expect(await getOwnerTotals({ ownerId: null }, { days: 60 }, noFriend)).toEqual([
      { ownerId: a, sent: 3, failed: 1 },
      { ownerId: b, sent: 2, failed: 0 },
    ]);

    // Cộng khớp getChannelTotals (cùng loại kết bạn).
    const channelTotals = (await getChannelTotals({ ownerId: null }, DAYS_30)).filter((row) => row.channel !== 'zalo_friend_request');
    const owners = await getOwnerTotals({ ownerId: null }, DAYS_30, noFriend);
    expect(owners.reduce((sum, row) => sum + row.sent, 0)).toBe(channelTotals.reduce((sum, row) => sum + row.sent, 0));
    expect(owners.reduce((sum, row) => sum + row.failed, 0)).toBe(channelTotals.reduce((sum, row) => sum + row.failed, 0));
  });
});
