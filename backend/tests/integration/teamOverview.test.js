/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-7 — khối "Hoạt động nhóm" và thẻ "Tiến độ của bạn": MỘT nguồn số, bảng 5 cột
 * cộng khớp "Cả công ty" (services/user/teamOverview.service.js).
 *
 * Chạy trên DB thật vì test mock DB không bắt được SQL sai cột / sai kiểu (vụ `cj.campaign_id`, `chatbots`). Mọi con số
 * kỳ vọng VIẾT TAY từ kịch bản dựng dưới đây (bảng cộng tay ngay trong từng ca), không tính bằng chính code đang test.
 *
 * Kịch bản chính: chủ A có nhân viên N1 (linked — cũng là nhân viên của chủ B và có không gian riêng) và N2; người đã
 * rời nhóm X; dòng tin chưa ghi người thực hiện. Script integration chạy với TZ=UTC nên lệch 7 giờ ở biên ngày /
 * "18:00 VN" lộ ngay.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { getTeamOverview, getMyContribution } from '../../src/services/user/teamOverview.service.js';
import { findLastActivityByActor } from '../../src/repositories/user/teamOverview.repository.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';

const DAY = 86400000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

// Biểu thức SQL giờ VN (timestamp không múi giờ) làm mốc thời gian của một tin.
const AT = {
  // 00:01 hôm nay giờ VN: luôn thuộc THÁNG NÀY, kể cả khi test chạy ngày mùng 1.
  thisMonth: "date_trunc('day', LOCALTIMESTAMP) + interval '1 minute'",
  fortyDaysAgo: "LOCALTIMESTAMP - interval '40 days'",
};

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let phoneSequence = 20000000;

async function makeUser(label, overrides = {}) {
  phoneSequence += 1;
  const user = await createUser({ username: `to_${label}_${unique()}`, phone: `09${phoneSequence}`, ...overrides });
  return Number(user.id);
}

async function makePlanOwner(label, { aiLimit = 1000, activatedDaysAgo = 8 } = {}) {
  const plan = await createPlan({ aiCreditsPerPeriod: aiLimit, isActive: true });
  const ownerId = await makeUser(label, { planId: plan.id });
  await db.query(`UPDATE users SET plan_activated_at = $1 WHERE id = $2`, [daysAgo(activatedDaysAgo), ownerId]);
  return ownerId;
}

/** Nhân viên của chủ: đã chấp nhận (mặc định), có thể đặt hạn mức lượt AI kỳ. */
async function addMember(ownerId, employeeId, { acceptedAt = new Date(), periodAiCreditLimit = null, status = 'active' } = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, status, origin, accepted_at, period_ai_credit_limit)
     VALUES ($1, $2, $3, 'linked', $4, $5)`,
    [ownerId, employeeId, status, acceptedAt, periodAiCreditLimit]
  );
}

async function createCampaign(workspaceOwnerId, createdBy, { status = 'active' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, 'teamOverview test', 'email', $3) RETURNING id`,
    [workspaceOwnerId, createdBy, status]
  );
  return Number(rows[0].id);
}

async function addRun(campaignId, workspaceOwnerId, { status = 'running', metadata = {} } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', $3, $4::jsonb) RETURNING id`,
    [campaignId, workspaceOwnerId, status, JSON.stringify(metadata)]
  );
  return Number(rows[0].id);
}

/** Chiến dịch + node + một lượt `running` — mọi dòng tin của chiến dịch bám vào đây. */
async function createContext(workspaceOwnerId, createdBy) {
  const campaignId = await createCampaign(workspaceOwnerId, createdBy);
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, execution_order)
     VALUES ($1, 'action', 'send_email', 'send', 1) RETURNING id`,
    [campaignId]
  );
  const runId = await addRun(campaignId, workspaceOwnerId);
  return { ownerId: workspaceOwnerId, actorId: createdBy, campaignId, nodeId: Number(rows[0].id), runId };
}

async function insertEmail(c, { to, status = 'sent', when = AT.thisMonth, preview = false, actorId = c.actorId }) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, recipient_email, email_step, status,
        is_preview, tracking_token, sent_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [c.ownerId, actorId, c.campaignId, c.runId, c.nodeId, to, status, preview]
  );
}

async function insertZalo(c, { channel = 'zalo_personal', to, status, when = AT.thisMonth }) {
  await db.query(
    `INSERT INTO zalo_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_type, recipient_value,
        status, tracking_metadata, is_preview, tracking_token, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'phone', $7, $8, $9::jsonb, FALSE,
             md5(random()::text || clock_timestamp()::text), ${when}, ${when}, ${when})`,
    [c.ownerId, c.actorId, c.campaignId, c.runId, c.nodeId, channel, to, status,
      JSON.stringify({ status, stepIndex: 1 })]
  );
}

async function insertTelegram(c, { to, status = 'sent', when = AT.thisMonth }) {
  const instant = `((${when}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_key, step_index, status,
        is_preview, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'telegram', $6, 1, $7, FALSE, ${status === 'sent' ? instant : 'NULL'}, ${instant}, ${instant})`,
    [c.ownerId, c.actorId, c.campaignId, c.runId, c.nodeId, to, status]
  );
}

/** Ghi thẳng một dòng `usage_logs` với `created_at` tuỳ ý; metadata === null → SQL NULL. */
async function insertUsage({ idUser, actor = null, delta = 1, metadata = {}, createdAt = new Date(), resourceType = 'ai_credit' }) {
  await db.query(
    `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [idUser, actor, resourceType, delta, createdAt, new Date(createdAt.getTime() + 30 * DAY),
      metadata === null ? null : JSON.stringify(metadata), createdAt]
  );
}

async function insertAudit({ ownerId, userId, action = 'EMAIL_TEMPLATE_UPDATED', category = 'workspace', createdAt = new Date() }) {
  await db.query(
    `INSERT INTO audit_logs (id_user, owner_id, category, action, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [userId, ownerId, category, action, createdAt]
  );
}

const byId = (rows, id) => rows.find((row) => Number(row.id) === Number(id));

let app;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await db.pool.end();
});

// ===========================================================================
// 1. Kịch bản chính: bảng 5 cột cộng khớp dòng "Cả công ty"
// ===========================================================================
describe('Hoạt động nhóm — kịch bản chính (chủ A, nhân viên N1 dùng chung với chủ B, N2, người đã rời X)', () => {
  const ids = {};
  let overviewA;
  let overviewB;
  let midInstant;
  let monthStartInstant;

  beforeAll(async () => {
    await truncateAll();
    ids.A = await makePlanOwner('a', { aiLimit: 1000, activatedDaysAgo: 8 });
    ids.B = await makePlanOwner('b', { aiLimit: 500 });
    ids.N1 = await makeUser('n1', { withPlan: false });
    ids.N2 = await makeUser('n2', { withPlan: false });
    ids.N3 = await makeUser('n3_pending', { withPlan: false });
    ids.X = await makeUser('x_left', { withPlan: false });
    await addMember(ids.A, ids.N1, { periodAiCreditLimit: 10 });
    await addMember(ids.A, ids.N2);
    await addMember(ids.A, ids.N3, { acceptedAt: null }); // lời mời chưa chấp nhận → không có dòng
    await addMember(ids.B, ids.N1); // N1 cũng là nhân viên của chủ B

    // ── Tin đã gửi tháng này, chủ A ──────────────────────────────────────────
    // Chủ A (actor A): 3 thư sent + 1 opened (đều là "đã gửi") + 1 thư lỗi → 4 / 1.
    const cA = await createContext(ids.A, ids.A);
    for (const to of ['a1', 'a2', 'a3']) await insertEmail(cA, { to: `${to}@t.vn` }); // eslint-disable-line no-await-in-loop
    await insertEmail(cA, { to: 'a4@t.vn', status: 'opened' });
    await insertEmail(cA, { to: 'a5@t.vn', status: 'failed' });
    // NULL actor (dòng chưa ghi người thực hiện): 1 thư → vào "Khác", không đoán là của chủ.
    await insertEmail(cA, { to: 'nul@t.vn', actorId: null });

    // N1 (chiến dịch do N1 tạo trong không gian của A):
    //   email: n1ok sent; n1retry lỗi rồi gửi được (1 đích, đã gửi); n1fail lỗi 2 lần (1 đích lỗi) → 2 gửi / 1 lỗi
    //   zalo_personal: 2 sent + 1 failed → 2 / 1;  telegram: 1 sent → 1 / 0.   Tổng N1: 5 / 2.
    const cN1 = await createContext(ids.A, ids.N1);
    // Bộ đếm của lượt chạy cố ý phình vô nghĩa (lượt cũ / lượt vỡ bất biến): bảng phải bỏ qua chúng và đếm từ bảng tin.
    await db.query(`UPDATE campaign_runs SET successful_sends = 999, failed_sends = 888 WHERE id = $1`, [cN1.runId]);
    await insertEmail(cN1, { to: 'n1ok@t.vn' });
    await insertEmail(cN1, { to: 'n1retry@t.vn', status: 'failed' });
    await insertEmail(cN1, { to: 'n1retry@t.vn', status: 'sent' });
    await insertEmail(cN1, { to: 'n1fail@t.vn', status: 'failed' });
    await insertEmail(cN1, { to: 'n1fail@t.vn', status: 'failed' });
    await insertZalo(cN1, { to: '0900000001', status: 'sent' });
    await insertZalo(cN1, { to: '0900000002', status: 'sent' });
    await insertZalo(cN1, { to: '0900000003', status: 'failed' });
    await insertTelegram(cN1, { to: 'tg1' });
    // Lời mời kết bạn (4 gửi + 1 lỗi): KHÔNG phải "tin" → không vào bảng, không vào "Cả công ty".
    for (const to of ['0911000001', '0911000002', '0911000003', '0911000004']) {
      await insertZalo(cN1, { channel: 'zalo_friend_request', to, status: 'sent' }); // eslint-disable-line no-await-in-loop
    }
    await insertZalo(cN1, { channel: 'zalo_friend_request', to: '0911000005', status: 'failed' });
    // Tháng trước và gửi nhanh (is_preview) không thuộc "tháng này" / số chiến dịch.
    await insertEmail(cN1, { to: 'old@t.vn', when: AT.fortyDaysAgo });
    await insertEmail(cN1, { to: 'quick@t.vn', preview: true });

    // N1 ở chủ B (7 thư) và ở không gian RIÊNG của N1 (3 thư): KHÔNG được vào bảng của A.
    const cN1inB = await createContext(ids.B, ids.N1);
    for (let i = 1; i <= 7; i += 1) await insertEmail(cN1inB, { to: `b${i}@t.vn` }); // eslint-disable-line no-await-in-loop
    const cN1own = await createContext(ids.N1, ids.N1);
    for (let i = 1; i <= 3; i += 1) await insertEmail(cN1own, { to: `own${i}@t.vn` }); // eslint-disable-line no-await-in-loop

    // Người đã rời nhóm X (còn tin trong không gian của A): 2 thư → "Khác".
    const cX = await createContext(ids.A, ids.X);
    await insertEmail(cX, { to: 'x1@t.vn' });
    await insertEmail(cX, { to: 'x2@t.vn' });

    // ── Chiến dịch đang chạy (lượt `running`), chủ A ─────────────────────────
    // Chủ: cA có 1 lượt running → 1.  N1: cN1 (1) + c2 (lượt đang chờ tới giờ) + c4 (2 lượt: 1 chờ, 1 đang gửi → không
    // phải "đang chờ") + c6 (mốc hoãn ĐÃ QUA) + c7 (mốc hỏng) = 5 chạy, 1 chờ. c3: chiến dịch `active` chỉ có lượt đã
    // xong → KHÔNG đếm.  N2: chiến dịch `active` không có lượt nào → 0.
    const future = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const past = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const c2 = await createCampaign(ids.A, ids.N1);
    await addRun(c2, ids.A, { metadata: { quotaDeferredUntil: future } });
    const c4 = await createCampaign(ids.A, ids.N1);
    await addRun(c4, ids.A, { metadata: { zaloOutboundDeferredUntil: future } });
    await addRun(c4, ids.A);
    const c3 = await createCampaign(ids.A, ids.N1);
    await addRun(c3, ids.A, { status: 'completed' });
    const c6 = await createCampaign(ids.A, ids.N1);
    await addRun(c6, ids.A, { metadata: { channelDeferredUntil: past } });
    const c7 = await createCampaign(ids.A, ids.N1);
    await addRun(c7, ids.A, { metadata: { quotaDeferredUntil: 'khong-phai-ngay' } });
    await createCampaign(ids.A, ids.N2, { status: 'active' });

    // ── Lượt AI trong KỲ của chủ A (kích hoạt 8 ngày trước → kỳ [now-8d, now+22d)) ──
    // Chủ: 2 dòng actor A + 1 dòng actor NULL = 3 (dòng BÁN Marketplace +900 bị loại).
    await insertUsage({ idUser: ids.A, actor: ids.A, createdAt: daysAgo(2) });
    await insertUsage({ idUser: ids.A, actor: ids.A, createdAt: daysAgo(1) });
    await insertUsage({ idUser: ids.A, actor: null, createdAt: daysAgo(1) });
    await insertUsage({ idUser: ids.A, actor: null, delta: 900, metadata: { type: 'marketplace_sale' }, createdAt: daysAgo(1) });
    // N1: 3 dòng trong kỳ = 3. Loại: trước kỳ (20 ngày), ví chủ B (4), ví riêng của N1 (5).
    for (const d of [3, 2, 1]) await insertUsage({ idUser: ids.A, actor: ids.N1, createdAt: daysAgo(d) }); // eslint-disable-line no-await-in-loop
    await insertUsage({ idUser: ids.A, actor: ids.N1, createdAt: daysAgo(20) });
    await insertUsage({ idUser: ids.B, actor: ids.N1, delta: 4, createdAt: daysAgo(1) });
    await insertUsage({ idUser: ids.N1, actor: ids.N1, delta: 5, createdAt: daysAgo(1) });
    // X: 2 dòng trong kỳ → "Khác".
    await insertUsage({ idUser: ids.A, actor: ids.X, delta: 2, createdAt: daysAgo(1) });
    // N2: một dòng ở GIỮA mốc đầu kỳ và mốc đầu THÁNG dương lịch — phân biệt tính theo kỳ với theo tháng.
    const cycle = (await getTeamOverview(ids.A)).aiCycle;
    const monthPrefix = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    monthStartInstant = new Date(`${monthPrefix}-01T00:00:00+07:00`);
    midInstant = new Date((new Date(cycle.start).getTime() + monthStartInstant.getTime()) / 2);
    await insertUsage({ idUser: ids.A, actor: ids.N2, createdAt: midInstant });

    overviewA = await getTeamOverview(ids.A);
    overviewB = await getTeamOverview(ids.B);
  });

  it('có đúng dòng "Bạn" + nhân viên đã chấp nhận (không có người đang chờ chấp nhận), sắp theo tên đăng nhập', () => {
    // `id` giữ kiểu pg trả (BIGINT → chuỗi) như API vẫn trả từ trước.
    expect(Number(overviewA.owner.id)).toBe(ids.A);
    expect(overviewA.employees.map((row) => Number(row.id))).toEqual([ids.N1, ids.N2]);
    expect(byId(overviewA.employees, ids.N3)).toBeUndefined();
  });

  it('tin của N1: gửi được / chưa gửi được theo ĐÍCH (thử lại rồi gửi được không là lỗi); kết bạn, tháng trước, gửi nhanh không vào', () => {
    const n1 = byId(overviewA.employees, ids.N1);
    // email 2 + zalo 2 + telegram 1 = 5 đã gửi; lỗi = n1fail (1 đích, 2 lần thử) + zalo 0900000003 = 2.
    expect(n1.sentThisMonth).toBe(5);
    expect(n1.failedThisMonth).toBe(2);
  });

  it('tin của N1 ở chủ B / không gian riêng KHÔNG vào bảng của A; bảng của B thấy đúng 7 tin của N1', () => {
    expect(byId(overviewA.employees, ids.N1).sentThisMonth).toBe(5); // 5, không phải 5 + 7 + 3
    const n1InB = byId(overviewB.employees, ids.N1);
    expect(n1InB.sentThisMonth).toBe(7);
    expect(n1InB.failedThisMonth).toBe(0);
  });

  it('dòng "Bạn": chỉ actor = chủ (opened tính là đã gửi); dòng thiếu người thực hiện KHÔNG bị đoán là của chủ', () => {
    expect(overviewA.owner.sentThisMonth).toBe(4);
    expect(overviewA.owner.failedThisMonth).toBe(1);
  });

  it('N2 chưa gửi gì → 0 / 0', () => {
    const n2 = byId(overviewA.employees, ids.N2);
    expect(n2.sentThisMonth).toBe(0);
    expect(n2.failedThisMonth).toBe(0);
  });

  it('"Cả công ty" = số của module đếm (bỏ kết bạn) và = Σ dòng + "Khác"', () => {
    // Cộng tay: chủ 4 + N1 5 + X 2 + NULL 1 = 12 đã gửi; lỗi chủ 1 + N1 2 = 3.
    expect(overviewA.company.sentThisMonth).toBe(12);
    expect(overviewA.company.failedThisMonth).toBe(3);
    // "Khác" = X 2 + NULL 1 = 3 đã gửi, 0 lỗi.
    expect(overviewA.other).toMatchObject({ sentThisMonth: 3, failedThisMonth: 0 });
    const rows = [overviewA.owner, ...overviewA.employees, overviewA.other];
    expect(rows.reduce((total, row) => total + row.sentThisMonth, 0)).toBe(overviewA.company.sentThisMonth);
    expect(rows.reduce((total, row) => total + row.failedThisMonth, 0)).toBe(overviewA.company.failedThisMonth);
  });

  it('không có người rời nhóm / dòng thiếu actor thì KHÔNG có dòng "Khác" (Σ dòng khớp đúng "Cả công ty")', () => {
    // Chủ B chỉ có tin của N1 (7): chủ 0 + N1 7 = 7 = công ty.
    expect(overviewB.other).toBeNull();
    expect(overviewB.company.sentThisMonth).toBe(7);
    expect(overviewB.owner.sentThisMonth + byId(overviewB.employees, ids.N1).sentThisMonth).toBe(7);
  });

  it('chiến dịch đang chạy = chiến dịch có lượt `running`, không phải chiến dịch `active`; kèm số đang chờ', () => {
    expect(overviewA.owner.runningCampaigns).toBe(1);
    expect(overviewA.owner.waitingCampaigns).toBe(0);
    const n1 = byId(overviewA.employees, ids.N1);
    // cN1 + c2 + c4 + c6 + c7 = 5; chỉ c2 mọi lượt đều chờ. Không tính: c3 (lượt đã xong), chiến dịch ở chủ B / không gian riêng.
    expect(n1.runningCampaigns).toBe(5);
    expect(n1.waitingCampaigns).toBe(1);
    // N2 có chiến dịch `active` nhưng không có lượt nào.
    const n2 = byId(overviewA.employees, ids.N2);
    expect(n2.runningCampaigns).toBe(0);
    expect(n2.waitingCampaigns).toBe(0);
  });

  it('lượt AI theo KỲ của chủ: chủ 3 (gồm dòng NULL, bỏ dòng bán Marketplace); N1 3 (bỏ trước kỳ, ví chủ B, ví riêng)', () => {
    expect(overviewA.owner.aiCreditsUsed).toBe(3);
    const n1 = byId(overviewA.employees, ids.N1);
    expect(n1.aiCreditsUsed).toBe(3);
    expect(n1.aiCreditsLimit).toBe(10); // user_members.period_ai_credit_limit
    expect(byId(overviewA.employees, ids.N2).aiCreditsLimit).toBeNull(); // không đặt hạn mức
    // Chủ B: N1 dùng 4 trong ví của B — không lẫn ví của A.
    expect(byId(overviewB.employees, ids.N1).aiCreditsUsed).toBe(4);
    expect(byId(overviewB.employees, ids.N1).aiCreditsLimit).toBeNull();
  });

  it('kỳ AI là kỳ 30 ngày của chủ (không phải tháng dương lịch): dòng giữa đầu kỳ và đầu tháng tính đúng phía', () => {
    const cycleStart = new Date(overviewA.aiCycle.start);
    expect(cycleStart.getTime()).toBeGreaterThan(daysAgo(9).getTime());
    expect(cycleStart.getTime()).toBeLessThan(daysAgo(7).getTime()); // kích hoạt 8 ngày trước
    expect(Math.abs(cycleStart.getTime() - monthStartInstant.getTime())).toBeGreaterThan(60 * 1000);
    // midInstant nằm giữa hai mốc: chỉ tính cho N2 khi nó rơi trong kỳ (mốc đầu kỳ < mốc đầu tháng).
    const inCycle = midInstant.getTime() >= cycleStart.getTime();
    expect(byId(overviewA.employees, ids.N2).aiCreditsUsed).toBe(inCycle ? 1 : 0);
  });

  it('lượt AI: "Cả công ty" = hàm cổng chặn (getCreditUsageForCycle) và = Σ dòng + "Khác"', () => {
    const n2 = byId(overviewA.employees, ids.N2).aiCreditsUsed;
    // Cộng tay: chủ 3 + N1 3 + N2 + X 2 = 8 + N2.
    expect(overviewA.company.aiCreditsUsed).toBe(8 + n2);
    expect(overviewA.company.aiCreditsLimit).toBe(1000); // hạn mức lượt AI của GÓI
    expect(overviewA.other.aiCreditsUsed).toBe(2); // X
    const total = overviewA.owner.aiCreditsUsed
      + overviewA.employees.reduce((sum, row) => sum + row.aiCreditsUsed, 0)
      + overviewA.other.aiCreditsUsed;
    expect(total).toBe(overviewA.company.aiCreditsUsed);
    expect(new Date(overviewA.aiCycle.end).getTime()).toBeGreaterThan(Date.now());
  });

  it('trả đúng bộ trường mới, không còn trường cũ (tỉ lệ thành công, mẫu đã soạn, ghi chú triggered_by…)', () => {
    const n1 = byId(overviewA.employees, ids.N1);
    for (const key of ['sendsThisMonth', 'campaignsThisMonth', 'templatesThisMonth', 'successRate', 'attributionNote',
      'aiCreditsThisMonth', 'dailyEmailLimit', 'monthlyEmailLimit']) {
      expect(n1).not.toHaveProperty(key);
    }
    for (const key of ['id', 'username', 'runningCampaigns', 'waitingCampaigns', 'sentThisMonth', 'failedThisMonth',
      'aiCreditsUsed', 'aiCreditsLimit', 'lastActiveAt']) {
      expect(n1).toHaveProperty(key);
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    expect(overviewA.period).toEqual({ fromDate: `${today.slice(0, 7)}-01`, toDate: today });
  });

  it('thẻ của nhân viên (getMyContribution) là CHÍNH dòng của họ trong bảng của chủ', async () => {
    const mine = await getMyContribution({ userId: ids.N1, activeContext: { type: 'employee', ownerId: ids.A } });
    const inTable = byId(overviewA.employees, ids.N1);
    expect(Number(mine.id)).toBe(ids.N1);
    expect(mine).toMatchObject({
      runningCampaigns: inTable.runningCampaigns,
      waitingCampaigns: inTable.waitingCampaigns,
      sentThisMonth: inTable.sentThisMonth,
      failedThisMonth: inTable.failedThisMonth,
      aiCreditsUsed: inTable.aiCreditsUsed,
      aiCreditsLimit: 10,
    });
    expect(mine.period).toEqual(overviewA.period);
    expect(mine.aiCycle).toEqual(overviewA.aiCycle);
    // Ngữ cảnh chủ B: cùng nhân viên nhưng số của chủ B.
    const inB = await getMyContribution({ userId: ids.N1, activeContext: { type: 'employee', ownerId: ids.B } });
    expect(inB.sentThisMonth).toBe(7);
    expect(inB.aiCreditsUsed).toBe(4);
  });

  it('người không thuộc nhóm của chủ → thẻ trống (null), không rơi sang số của người khác', async () => {
    const stranger = await makeUser('stranger', { withPlan: false });
    expect(await getMyContribution({ userId: stranger, activeContext: { type: 'employee', ownerId: ids.A } })).toBeNull();
    // N3 chưa chấp nhận lời mời cũng không có số.
    expect(await getMyContribution({ userId: ids.N3, activeContext: { type: 'employee', ownerId: ids.A } })).toBeNull();
  });
});

// ===========================================================================
// 2. "Chờ tới giờ": đủ bốn khoá hoãn của run_metadata
// ===========================================================================
describe('Hoạt động nhóm — lượt đang chờ tới giờ (bốn khoá hoãn)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it.each([
    ['quotaDeferredUntil'],
    ['zaloOutboundDeferredUntil'],
    ['nonContinuousDeferredUntil'],
    ['channelDeferredUntil'],
  ])('mốc %s còn ở tương lai → đang chạy + đang chờ', async (key) => {
    const owner = await makePlanOwner('wait_owner');
    const emp = await makeUser('wait_emp', { withPlan: false });
    await addMember(owner, emp);
    const campaign = await createCampaign(owner, emp);
    await addRun(campaign, owner, { metadata: { [key]: new Date(Date.now() + 3600 * 1000).toISOString() } });
    const row = byId((await getTeamOverview(owner)).employees, emp);
    expect(row.runningCampaigns).toBe(1);
    expect(row.waitingCampaigns).toBe(1);
  });

  it('chiến dịch chỉ có lượt `stopped` / `failed` không tính là đang chạy', async () => {
    const owner = await makePlanOwner('wait_owner2');
    const emp = await makeUser('wait_emp2', { withPlan: false });
    await addMember(owner, emp);
    const campaign = await createCampaign(owner, emp);
    await addRun(campaign, owner, { status: 'stopped' });
    await addRun(campaign, owner, { status: 'failed' });
    const row = byId((await getTeamOverview(owner)).employees, emp);
    expect(row.runningCampaigns).toBe(0);
  });
});

// ===========================================================================
// 3. Hoạt động gần nhất
// ===========================================================================
describe('Hoạt động gần nhất — đúng thời điểm, đúng phạm vi', () => {
  let owner;
  let other;
  let emp;

  beforeEach(async () => {
    await truncateAll();
    owner = await makePlanOwner('la_owner');
    other = await makePlanOwner('la_other');
    emp = await makeUser('la_emp', { withPlan: false });
    await addMember(owner, emp);
    await addMember(other, emp);
  });

  const lastActive = async (ownerId = owner, employeeId = emp) => {
    const overview = await getTeamOverview(ownerId);
    return byId(overview.employees, employeeId).lastActiveAt;
  };

  it('không có gì → null', async () => {
    expect(await lastActive()).toBeNull();
  });

  it('thư gửi 18:00 giờ VN → đúng thời điểm 11:00 UTC (không lệch sang ngày hôm sau)', async () => {
    const c = await createContext(owner, emp);
    await insertEmail(c, { to: 'late@t.vn', when: "TIMESTAMP '2026-01-15 18:00:00'" });
    expect(await lastActive()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('kết quả không dựa vào múi giờ của phiên DB (phiên UTC vẫn ra đúng thời điểm)', async () => {
    const c = await createContext(owner, emp);
    await insertEmail(c, { to: 'late@t.vn', when: "TIMESTAMP '2026-01-15 18:00:00'" });
    const client = await db.getClient();
    try {
      await client.query(`SET TIME ZONE 'UTC'`);
      const rows = await findLastActivityByActor(owner, [emp], client);
      expect(rows).toHaveLength(1);
      expect(rows[0].lastActiveAt.toISOString()).toBe('2026-01-15T11:00:00.000Z');
    } finally {
      client.release();
    }
  });

  it('Zalo (naive giờ VN) và Telegram (timestamptz) đều đúng thời điểm', async () => {
    const c = await createContext(owner, emp);
    await insertZalo(c, { to: '0900000009', status: 'sent', when: "TIMESTAMP '2026-02-01 23:30:00'" });
    expect(await lastActive()).toBe('2026-02-01T16:30:00.000Z');
    await insertTelegram(c, { to: 'tg9', when: "TIMESTAMP '2026-03-10 06:15:00'" });
    expect(await lastActive()).toBe('2026-03-09T23:15:00.000Z');
  });

  it('lấy MẤT lớn nhất của các nguồn: nhật ký thao tác (tạo/sửa mẫu, chiến dịch…) mới hơn tin gửi', async () => {
    const c = await createContext(owner, emp);
    await insertEmail(c, { to: 'old@t.vn', when: "TIMESTAMP '2026-01-15 18:00:00'" });
    const auditAt = new Date('2026-04-20T03:00:00.000Z');
    await insertAudit({ ownerId: owner, userId: emp, action: 'CAMPAIGN_CREATED', createdAt: auditAt });
    expect(await lastActive()).toBe(auditAt.toISOString());
  });

  it('lượt AI trong ví của chủ tính là hoạt động; lượt ở ví khác / dòng bán Marketplace thì không', async () => {
    const aiAt = new Date('2026-05-05T05:05:05.000Z');
    await insertUsage({ idUser: owner, actor: emp, createdAt: aiAt });
    // Mới hơn nhưng ở ví chủ khác / ví riêng của nhân viên → bỏ qua.
    await insertUsage({ idUser: other, actor: emp, createdAt: new Date('2026-06-06T06:06:06.000Z') });
    await insertUsage({ idUser: emp, actor: emp, createdAt: new Date('2026-06-07T06:06:06.000Z') });
    expect(await lastActive()).toBe(aiAt.toISOString());
  });

  it('thao tác ở không gian của chủ KHÁC không làm nhích hoạt động của không gian này', async () => {
    await insertAudit({ ownerId: other, userId: emp, action: 'CAMPAIGN_CREATED', createdAt: new Date('2026-07-07T07:07:07.000Z') });
    await insertAudit({ ownerId: owner, userId: emp, category: 'system', action: 'AI_SYSTEM_MODEL_UPDATED', createdAt: new Date('2026-07-08T07:07:07.000Z') });
    expect(await lastActive(owner)).toBeNull();
    expect(await lastActive(other)).toBe('2026-07-07T07:07:07.000Z');
  });

  it('dòng chủ: dòng bán Marketplace (actor NULL) không tính là hoạt động của chủ', async () => {
    await insertUsage({ idUser: owner, actor: null, delta: 900, metadata: { type: 'marketplace_sale' }, createdAt: new Date('2026-08-08T08:08:08.000Z') });
    const overview = await getTeamOverview(owner);
    expect(overview.owner.lastActiveAt).toBeNull();
    await insertUsage({ idUser: owner, actor: null, createdAt: new Date('2026-08-01T01:01:01.000Z') });
    expect((await getTeamOverview(owner)).owner.lastActiveAt).toBe('2026-08-01T01:01:01.000Z');
  });
});

// ===========================================================================
// 4. Chủ chưa có gói: không có kỳ → lượt AI "—", các cột còn lại vẫn đúng
// ===========================================================================
describe('Hoạt động nhóm — chủ không có gói (không có kỳ AI)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('aiCycle = null, lượt AI = null cho mọi dòng; tin đã gửi vẫn đếm', async () => {
    const owner = await makeUser('noplan_owner', { withPlan: false });
    const emp = await makeUser('noplan_emp', { withPlan: false });
    await addMember(owner, emp);
    const c = await createContext(owner, emp);
    await insertEmail(c, { to: 'x@t.vn' });
    await insertUsage({ idUser: owner, actor: emp, createdAt: daysAgo(1) });
    const overview = await getTeamOverview(owner);
    expect(overview.aiCycle).toBeNull();
    expect(overview.owner.aiCreditsUsed).toBeNull();
    expect(overview.company.aiCreditsUsed).toBeNull();
    expect(overview.company.aiCreditsLimit).toBeNull();
    const row = byId(overview.employees, emp);
    expect(row.aiCreditsUsed).toBeNull();
    expect(row.sentThisMonth).toBe(1);
  });
});

// ===========================================================================
// 5. Qua HTTP: cả hai route dùng chung một hàm, ranh giới quyền giữ nguyên
// ===========================================================================
describe('GET /api/employees/team-overview và /contribution/me', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function loginAs(user) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    return res.body.data.accessToken;
  }

  it('chủ nhận { period, aiCycle, owner, employees, other, company }; nhân viên nhận đúng dòng của mình', async () => {
    const plan = await createPlan({ aiCreditsPerPeriod: 100, maxEmployees: 5, isActive: true });
    const ownerUser = await createUser({ username: `http_owner_${unique()}`, planId: plan.id, phone: '0977000001' });
    const empUser = await createUser({ username: `http_emp_${unique()}`, role: 'employee', phone: '0977000002' });
    await db.query(`UPDATE users SET plan_activated_at = $1 WHERE id = $2`, [daysAgo(3), ownerUser.id]);
    await addMember(ownerUser.id, empUser.id, { periodAiCreditLimit: 7 });
    const c = await createContext(ownerUser.id, empUser.id);
    await insertEmail(c, { to: 'h1@t.vn' });
    await insertUsage({ idUser: ownerUser.id, actor: empUser.id, createdAt: daysAgo(1) });

    const ownerRes = await request(app)
      .get('/api/employees/team-overview')
      .set('Authorization', `Bearer ${await loginAs(ownerUser)}`);
    expect(ownerRes.status).toBe(200);
    const data = ownerRes.body.data;
    expect(Object.keys(data).sort()).toEqual(['aiCycle', 'company', 'employees', 'other', 'owner', 'period']);
    expect(data.employees).toHaveLength(1);
    expect(data.employees[0]).toMatchObject({ id: empUser.id, sentThisMonth: 1, aiCreditsUsed: 1, aiCreditsLimit: 7, runningCampaigns: 1 });
    expect(data.company.sentThisMonth).toBe(1);

    const contribution = await request(app)
      .get('/api/employees/contribution')
      .set('Authorization', `Bearer ${await loginAs(ownerUser)}`);
    expect(contribution.body.data).toEqual(data);

    const meRes = await request(app)
      .get('/api/employees/contribution/me')
      .set('Authorization', `Bearer ${await loginAs(empUser)}`)
      .set('X-Owner-Context', String(ownerUser.id));
    expect(meRes.status).toBe(200);
    expect(meRes.body.data).toMatchObject({ id: empUser.id, sentThisMonth: 1, aiCreditsUsed: 1, aiCreditsLimit: 7 });
    // Nhân viên vẫn KHÔNG đọc được bảng của cả nhóm.
    const forbidden = await request(app)
      .get('/api/employees/team-overview')
      .set('Authorization', `Bearer ${await loginAs(empUser)}`)
      .set('X-Owner-Context', String(ownerUser.id));
    expect(forbidden.status).toBe(403);
  });
});
