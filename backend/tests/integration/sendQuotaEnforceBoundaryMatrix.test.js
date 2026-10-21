import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { checkSendQuota, _clearQuotaCache } from '../../src/utils/userSendLimit.util.js';
import {
  evaluateReservationQuotaPolicy,
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  getVnDayBoundaries,
} from '../../src/services/quota/sendQuotaReservation.service.js';
import { getWalletAvailableBalance } from '../../src/repositories/sendQuota.repository.js';
import { getBillingCycle, resolveBillingUserId } from '../../src/utils/billingCycle.util.js';
import { checkAccountDailyLimit } from '../../src/services/quota/accountDailyLimit.service.js';
import { buildDirectReservationKey } from '../../src/services/quota/sendQuotaKey.service.js';

/**
 * MA TRẬN RANH GIỚI HẠN MỨC GỬI Ở CHẾ ĐỘ ENFORCE (PLAN_ESLINT_PUBLIC_VA_HAN_MUC_ENFORCE_2026-10-19, mục B).
 *
 * Production đang `shadow`: nhánh đặt chỗ (`send_quota_reservations`, trừ ví lúc consume) CHƯA TỪNG chạy với dữ liệu
 * thật. Bài này dựng dữ liệu thật trong CSDL test, rồi với MỖI tình huống hỏi ba nơi cùng lúc:
 *
 *   1. luật cũ   — `checkSendQuota` (userSendLimit.util.js)
 *   2. luật mới  — `evaluateReservationQuotaPolicy` (trong giao dịch, rollback)
 *   3. enforce   — `reserveSendQuota(..., { modeOverride: 'enforce' })`: cho phép thì phải sinh ĐÚNG một dòng
 *                  `reserved`, chặn thì KHÔNG được sinh dòng nào.
 *
 * Chế độ được đặt bằng `modeOverride` từng lời gọi (KHÔNG sửa process.env — xem ghi chú ở sendQuotaShadowParity.test.js),
 * nên bài này chạy ở enforce bất kể biến môi trường của lượt chạy.
 *
 * Ba chiều lệch có CHỦ ĐÍCH, được ghim thành cột `blind` thay vì giấu đi (luật cũ không thấy):
 *   - đặt chỗ đang treo (reserved/sending/uncertain) và giữ chỗ ví: dòng tin chưa tồn tại, luật cũ chỉ đếm dòng tin;
 *   - đặt chỗ đã consume của kênh adapter: dòng ccm gắn reservation bị luật cũ loại (`quota_reservation_id IS NULL`,
 *     userSendLimit.util.js:476) và chỉ được tính ở ledger.
 * Mọi ca KHÔNG gắn `blind` phải có luật cũ == luật mới == enforce, kể cả limitType.
 *
 * Mốc thời gian: hàng dữ liệu được dựng bằng SQL theo giờ VN (cột email/zalo là `timestamp` không múi giờ, ghi giờ VN —
 * xem userSendLimit.util.js:31-44), chu kỳ gói neo `plan_activated_at` = 10 ngày trước nên `beforeCycle` nằm đúng ngoài chu kỳ.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FP = 'a'.repeat(64);
let seq = 0;
const nextSeq = () => { seq += 1; return seq; };

const records = [];

// ───────────────────────────── Dựng dữ liệu ─────────────────────────────

async function createQuotaPlan(limits = {}, graceDays = 0) {
  const L = {
    dailyEmail: null, monthlyEmail: null, dailyZalo: null, monthlyZalo: null,
    monthlyTelegram: null, monthlyWhatsapp: null, perPeriod: null, ...limits,
  };
  const { rows } = await db.query(
    `INSERT INTO plans (name, price, daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        monthly_telegram_limit, monthly_whatsapp_limit, messages_per_period, grace_period_days, is_active)
     VALUES ($1, 100000, $2, $3, $4, $5, $6, $7, $8, $9, true) RETURNING id`,
    [`QP_${nextSeq()}_${Date.now()}`, L.dailyEmail, L.monthlyEmail, L.dailyZalo, L.monthlyZalo,
      L.monthlyTelegram, L.monthlyWhatsapp, L.perPeriod, graceDays]
  );
  return rows[0].id;
}

/** Biểu thức SQL cho mốc `sent_at` (cột KHÔNG múi giờ, giờ VN) và `created_at` (TIMESTAMPTZ). */
function timeExprs(ownerId) {
  const anchor = `(SELECT plan_activated_at FROM users WHERE id = ${Number(ownerId)})`;
  return {
    naive: {
      now: 'LOCALTIMESTAMP',
      todayStart: "date_trunc('day', LOCALTIMESTAMP)",
      beforeToday: "date_trunc('day', LOCALTIMESTAMP) - interval '1 second'",
      twoDaysAgo: "LOCALTIMESTAMP - interval '2 days'",
      beforeCycle: `(${anchor} AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 second'`,
    },
    tz: {
      now: 'NOW()',
      todayStart: "date_trunc('day', NOW())",
      beforeToday: "date_trunc('day', NOW()) - interval '1 second'",
      twoDaysAgo: "NOW() - interval '2 days'",
      beforeCycle: `${anchor} - interval '1 second'`,
    },
  };
}

async function buildHarness(c) {
  const sfx = `${nextSeq()}_${Date.now()}`;
  const ownerRole = c.ownerRole ?? 'user';
  const owner = await createUser({ username: `qm_owner_${sfx}`, role: ownerRole, withPlan: false });

  if (!c.noPlan && ownerRole !== 'admin') {
    const planId = await createQuotaPlan(c.plan ?? {}, c.graceDays ?? 0);
    const expiresExpr = c.expiredDaysAgo != null
      ? `NOW() - interval '${Number(c.expiredDaysAgo)} days'`
      : "NOW() + interval '365 days'";
    await db.query(
      `UPDATE users
          SET active_plan_id = $1,
              plan_activated_at = date_trunc('second', NOW() - interval '10 days'),
              subscription_expires_at = ${expiresExpr}
        WHERE id = $2`,
      [planId, owner.id]
    );
  }

  const t = timeExprs(owner.id);
  const h = {
    owner,
    actor: owner,
    ownerContextId: c.ownerContext ? owner.id : null,
    actorUserId: null,
    roleCode: ownerRole === 'admin' ? 'admin' : 'user',
    staff: null,
  };

  async function makeStaff(limits = {}, status = 'active') {
    const staff = await createUser({ username: `qm_staff_${nextSeq()}_${Date.now()}`, withPlan: false });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, daily_email_limit, monthly_email_limit,
                                 daily_zalo_limit, monthly_zalo_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [owner.id, staff.id, status, limits.dailyEmail ?? null, limits.monthlyEmail ?? null,
        limits.dailyZalo ?? null, limits.monthlyZalo ?? null]
    );
    return staff;
  }
  h.makeStaff = makeStaff;

  if (c.employee) {
    const staff = await makeStaff(c.employee.limits ?? {}, c.employee.status ?? 'active');
    h.staff = staff;
    h.actor = staff;
    h.actorUserId = staff.id;
    // Ngữ cảnh nhân viên mặc định có X-Owner-Context (middleware); `noOwnerContext` dựng ca phải tự suy ra chủ qua membership.
    h.ownerContextId = c.employee.noOwnerContext ? null : owner.id;
  }
  if (c.actorOnly) {
    // userId = chủ, actorUserId = nhân viên, KHÔNG ownerContextId (ca tách luật cũ/mới ở tầng nhân viên).
    const staff = await makeStaff(c.actorOnly.limits ?? {});
    h.staff = staff;
    h.actor = owner;
    h.actorUserId = staff.id;
    h.ownerContextId = null;
  }

  h.email = async (n, o = {}) => {
    const { at = 'now', status = 'sent', preview = false, actor = null, settingId = null, resv = null } = o;
    await db.query(
      `INSERT INTO email_messages (workspace_owner_id, actor_user_id, id_email_setting, recipient_email, sender_email,
                                   subject, status, is_preview, sent_at, quota_reservation_id)
       SELECT $1::bigint, $2::bigint, $3::bigint, 'r'||g||'@example.com', 's@example.com', 'S', $4::text, $5::boolean,
              ${t.naive[at]}, $7::bigint
         FROM generate_series(1, $6::int) g`,
      [owner.id, actor, settingId, status, preview, n, resv]
    );
  };

  h.zalo = async (n, o = {}) => {
    const { channel = 'zalo_personal', at = 'now', status = 'sent', preview = false, actor = null, accountId = null, resv = null } = o;
    await db.query(
      `INSERT INTO zalo_messages (workspace_owner_id, actor_user_id, account_id, channel, status, tracking_metadata,
                                  is_preview, sent_at, tracking_token, quota_reservation_id)
       SELECT $1::bigint, $2::bigint, $3::bigint, $4::text, $5::text, jsonb_build_object('status', $5::text),
              $6::boolean, ${t.naive[at]}, 'qm_zm_'||gen_random_uuid(), $8::bigint
         FROM generate_series(1, $7::int) g`,
      [owner.id, actor, accountId, channel, status, preview, n, resv]
    );
  };

  h.usage = async (resourceType, n, o = {}) => {
    const { at = 'now', actor = null } = o;
    await db.query(
      `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
       SELECT $1::bigint, $2::bigint, $3::text, 1, NOW() - interval '10 days', NOW() + interval '20 days',
              CASE WHEN $2::bigint IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('actorUserId', $2::bigint) END,
              ${t.tz[at]}
         FROM generate_series(1, $4::int) g`,
      [owner.id, actor, resourceType, n]
    );
  };

  h.ccm = async (n, channel, o = {}) => {
    const { at = 'now', status = 'sent', preview = false, accountKey = null, resv = null } = o;
    await db.query(
      `INSERT INTO campaign_channel_messages (workspace_owner_id, channel, account_key, recipient_key, status, is_preview,
                                              sent_at, quota_reservation_id)
       SELECT $1::bigint, $2::text, $3::text, 'peer_'||g, $4::text, $5::boolean, ${t.tz[at]}, $7::bigint
         FROM generate_series(1, $6::int) g`,
      [owner.id, channel, accountKey, status, preview, n, resv]
    );
  };

  h.reservation = async (o = {}) => {
    const {
      status = 'reserved', channel, qty = 1, actor = null, day = 'today', metered = true,
      walletKey = null, walletQty = 0, ownerId = owner.id,
    } = o;
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(new Date());
    const shift = day === 'yesterday' ? -DAY_MS : 0;
    const cycle = await getBillingCycle(ownerId);
    const { rows } = await db.query(
      `INSERT INTO send_quota_reservations
         (reservation_key, request_fingerprint, billing_user_id, actor_user_id, channel, quantity, is_metered,
          wallet_item_key, wallet_quantity, source_type, status, vn_day_start, vn_day_end, cycle_start, cycle_end, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'direct_email', $10, $11, $12, $13, $14, NOW() + interval '1 hour')
       RETURNING id`,
      [`seed_${nextSeq()}_${Date.now()}`, FP, ownerId, actor, channel, qty, metered, walletKey, walletQty, status,
        new Date(vnDayStart.getTime() + shift), new Date(vnDayEnd.getTime() + shift),
        cycle.cycleStart, cycle.cycleEnd]
    );
    return rows[0].id;
  };

  h.grant = async (itemKey, qty) => {
    const orderCode = 9_000_000_000 + nextSeq();
    const { rows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 50000) RETURNING id`,
      [owner.id, orderCode]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1, $2, $3, $4, NULL)`,
      [owner.id, itemKey, qty, rows[0].id]
    );
  };

  h.debit = async (itemKey, qty) => {
    await db.query(
      `INSERT INTO topup_debits (user_id, item_key, qty, source_key) VALUES ($1, $2, $3, $4)`,
      [owner.id, itemKey, qty, `seed_debit_${nextSeq()}`]
    );
  };

  return h;
}

// ───────────────────────────── Chạy một tình huống qua cả ba cổng ─────────────────────────────

const normType = (t) => (t === 'subscription_expired' ? 'expired' : t);

function legacyParams(h, c, qty) {
  return {
    userId: h.actor.id,
    channel: c.channel,
    roleCode: h.roleCode,
    ownerContextId: h.ownerContextId,
    requiredCount: qty,
    actorUserId: h.actorUserId,
  };
}

async function runLegacy(h, c, qty) {
  _clearQuotaCache();
  const r = await checkSendQuota(legacyParams(h, c, qty));
  return r.allowed ? { allowed: true } : { allowed: false, type: normType(r.limitType), limit: r.limit, count: r.currentCount };
}

async function runAtomic(h, c, qty) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const billingUserId = h.roleCode === 'admin'
      ? (h.ownerContextId ? Number(h.ownerContextId) : h.actor.id)
      : await resolveBillingUserId(h.actor.id, { ownerContextId: h.ownerContextId }, client);
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(new Date());
    const cycle = await getBillingCycle(billingUserId, {}, client);
    try {
      const r = await evaluateReservationQuotaPolicy(client, {
        billingUserId,
        actorUserId: h.actorUserId,
        ownerContextId: h.ownerContextId,
        userId: h.actor.id,
        channel: c.channel,
        quantity: qty,
        isMetered: h.roleCode !== 'admin',
        vnDayStart,
        vnDayEnd,
        cycleStart: cycle?.cycleStart ?? null,
        cycleEnd: cycle?.cycleEnd ?? null,
      });
      return { allowed: Boolean(r.allowed), walletItemKey: r.walletItemKey, walletQuantity: r.walletQuantity };
    } catch (err) {
      if (err.status !== 403) throw err;
      return { allowed: false, type: normType(err.limitType), limit: err.limit, count: err.currentCount };
    }
  } finally {
    try { await client.query('ROLLBACK'); } catch (_) { /* đã đóng */ }
    client.release();
  }
}

async function countReservations(ownerId) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM send_quota_reservations WHERE billing_user_id = $1', [ownerId]);
  return rows[0].n;
}

function reserveParams(h, c, qty, tag) {
  const recipient = `qm_${tag}@example.com`;
  return {
    userId: h.actor.id,
    actorUserId: h.actorUserId,
    ownerContextId: h.ownerContextId,
    roleCode: h.roleCode,
    channel: c.channel,
    quantity: qty,
    sourceType: c.channel === 'email' ? 'direct_email' : 'quick_send',
    reservationKey: buildDirectReservationKey({
      channel: c.channel, billingUserId: h.owner.id, clientKey: `qm_${tag}`, recipient,
    }),
    requestPayload: { channel: c.channel, recipient, tag },
  };
}

async function runReserve(h, c, qty) {
  const before = await countReservations(h.owner.id);
  let outcome;
  try {
    const r = await reserveSendQuota(reserveParams(h, c, qty, `main_${nextSeq()}`), { modeOverride: 'enforce' });
    outcome = { allowed: Boolean(r.allowed), status: r.status, mode: r.mode, walletQuantity: r.wallet_quantity, walletItemKey: r.wallet_item_key, metered: r.is_metered, id: r.id };
  } catch (err) {
    if (err.status !== 403 || err.code !== 'RESOURCE_LIMIT_EXCEEDED') throw err;
    outcome = { allowed: false, type: normType(err.limitType), limit: err.limit, count: err.currentCount };
  }
  const after = await countReservations(h.owner.id);
  outcome.rowsAdded = after - before;
  return outcome;
}

const verdict = (r) => (r.allowed ? 'ALLOW' : `DENY:${r.type}`);

/** Chuẩn hoá `e` ('A' | 'D:daily' | {legacy, atomic, reserve, blind}) thành ba kỳ vọng. */
function expectations(e) {
  if (typeof e === 'string') return { legacy: e, atomic: e, reserve: e, blind: null };
  return { legacy: e.legacy ?? e.atomic, atomic: e.atomic, reserve: e.reserve ?? e.atomic, blind: e.blind ?? null };
}
const expText = (s) => (s === 'A' ? 'ALLOW' : `DENY:${s.slice(2)}`);

async function runCase(c) {
  const h = await buildHarness(c);
  if (c.seed) await c.seed(h);
  const qty = c.quantity ?? 1;
  const legacy = await runLegacy(h, c, qty);
  const atomic = await runAtomic(h, c, qty);
  const reserve = await runReserve(h, c, qty);
  const exp = expectations(c.e);

  records.push({
    id: c.id,
    channel: c.channel,
    qty,
    legacy: verdict(legacy),
    atomic: verdict(atomic),
    reserve: verdict(reserve),
    match: exp.blind ? `LỆCH CÓ CHỦ ĐÍCH (${exp.blind})` : (verdict(legacy) === verdict(atomic) && verdict(atomic) === verdict(reserve) ? 'KHỚP' : 'KHÔNG KHỚP'),
    name: c.name,
  });

  expect(verdict(legacy)).toBe(expText(exp.legacy));
  expect(verdict(atomic)).toBe(expText(exp.atomic));
  expect(verdict(reserve)).toBe(expText(exp.reserve));

  // Enforce: cho phép ⇒ đúng 1 dòng `reserved` đúng số lượng; chặn ⇒ không dòng nào.
  if (reserve.allowed) {
    expect(reserve.rowsAdded).toBe(1);
    expect(reserve.status).toBe('reserved');
    expect(reserve.mode).toBe('enforce');
    const { rows } = await db.query('SELECT quantity, is_metered, wallet_quantity, wallet_item_key FROM send_quota_reservations WHERE id = $1', [reserve.id]);
    expect(rows[0].quantity).toBe(qty);
    expect(rows[0].is_metered).toBe(h.roleCode !== 'admin');
    if (c.wallet) {
      expect(rows[0].wallet_quantity).toBe(c.wallet.qty);
      expect(rows[0].wallet_item_key).toBe(c.wallet.key);
      expect(atomic.walletQuantity).toBe(c.wallet.qty);
      expect(atomic.walletItemKey).toBe(c.wallet.key);
    } else {
      expect(rows[0].wallet_quantity).toBe(0);
    }
  } else {
    expect(reserve.rowsAdded).toBe(0);
  }
  return { h, legacy, atomic, reserve };
}

// ───────────────────────────── Danh sách ca ─────────────────────────────

const EMAIL_STATUSES_SENT = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed'];

const CASES = [
  // ── Email · hạn mức ngày của gói (daily_email_limit = 5) ──
  { id: 'E-D1', name: 'email/ngày: n−1 (4/5) → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: (h) => h.email(4), e: 'A' },
  { id: 'E-D2', name: 'email/ngày: đúng ngưỡng n (5/5) → chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: (h) => h.email(5), e: 'D:daily' },
  { id: 'E-D3', name: 'email/ngày: n+1 (6/5, đã vượt sẵn) → chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: (h) => h.email(6), e: 'D:daily' },
  { id: 'E-D4', name: 'email/ngày: gửi 2 khi còn 1 chỗ (4/5 + 2) → chặn', channel: 'email', plan: { dailyEmail: 5 }, quantity: 2, seed: (h) => h.email(4), e: 'D:daily' },
  { id: 'E-D5', name: 'email/ngày: gửi 2 khi còn đúng 2 chỗ (3/5 + 2 = 5) → cho phép', channel: 'email', plan: { dailyEmail: 5 }, quantity: 2, seed: (h) => h.email(3), e: 'A' },
  { id: 'E-D6', name: 'email/ngày: qua 00:00 VN — 5 thư lúc 23:59:59 hôm qua không tính hôm nay → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: (h) => h.email(5, { at: 'beforeToday' }), e: 'A' },
  { id: 'E-D7', name: 'email/ngày: đúng 00:00:00 hôm nay tính cho hôm nay (5 thư) → chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: (h) => h.email(5, { at: 'todayStart' }), e: 'D:daily' },
  { id: 'E-D8', name: 'email/ngày: 3 thư campaign + 2 gửi trực tiếp (usage_logs) = 5 → chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(3); await h.usage('email_direct_send', 2); }, e: 'D:daily' },
  { id: 'E-D9', name: 'email/ngày: thư đã mở/nhấp/hủy đăng ký vẫn tính (7 trạng thái, 5 thư) → chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (const s of ['opened', 'clicked', 'unsubscribed', 'delivered', 'sent']) await h.email(1, { status: s }); }, e: 'D:daily' },
  { id: 'E-D10', name: 'email/ngày: thư failed/pending/preview không tính (5 + 5 + 5 dòng) → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(5, { status: 'failed' }); await h.email(5, { status: 'pending' }); await h.email(5, { preview: true }); }, e: 'A' },
  { id: 'E-D11', name: 'email/ngày: hạn mức = 0 (gói không có kênh) → chặn disabled', channel: 'email', plan: { dailyEmail: 0 }, e: 'D:disabled' },
  { id: 'E-D12', name: 'email/ngày: Enterprise tất cả NULL, đã gửi 300 → không giới hạn', channel: 'email', plan: {}, seed: (h) => h.email(300), e: 'A' },
  { id: 'E-D13', name: 'email/ngày: dữ liệu workspace khác không tính (5 thư của chủ khác) → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { const other = await createUser({ username: `qm_other_${nextSeq()}` }); await db.query(`INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at) SELECT $1, 'x'||g||'@e.com', 's@e.com', 'S', 'sent', false, LOCALTIMESTAMP FROM generate_series(1,5) g`, [other.id]); }, e: 'A' },
  { id: 'E-D15', name: 'email/ngày: trần ngày KHÔNG có lối thoát bằng ví (5/5 hôm nay, ví emails 10) → chặn daily', channel: 'email', plan: { dailyEmail: 5, monthlyEmail: 100 }, seed: async (h) => { await h.email(5); await h.grant('emails', 10); }, e: 'D:daily' },
  { id: 'E-D14',name: 'email/ngày: có ownerContextId = chủ (đúng như middleware ngữ cảnh) — 5/5 → chặn', channel: 'email', plan: { dailyEmail: 5 }, ownerContext: true, seed: (h) => h.email(5), e: 'D:daily' },

  // ── Email · đặt chỗ (ledger) ──
  { id: 'E-R1', name: 'email/ngày + đặt chỗ treo: 3 đã gửi + 2 reserved (=5) → luật mới chặn, luật cũ không thấy chỗ đặt', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(3); await h.reservation({ channel: 'email', qty: 1 }); await h.reservation({ channel: 'email', qty: 1 }); }, e: { legacy: 'A', atomic: 'D:daily', blind: 'đặt chỗ treo' } },
  { id: 'E-R2', name: 'email/ngày + đặt chỗ treo: 3 đã gửi + 1 reserved (=4/5) → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(3); await h.reservation({ channel: 'email', qty: 1 }); }, e: 'A' },
  { id: 'E-R3', name: 'email/ngày: một đặt chỗ treo số lượng 2 (3 + 2 = 5) → luật mới chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(3); await h.reservation({ channel: 'email', qty: 2 }); }, e: { legacy: 'A', atomic: 'D:daily', blind: 'đặt chỗ treo' } },
  { id: 'E-R4', name: 'email/ngày: đặt chỗ ĐÃ NHẢ (released) ×5 không tính → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (let i = 0; i < 5; i += 1) await h.reservation({ status: 'released', channel: 'email' }); }, e: 'A' },
  { id: 'E-R5', name: 'email/ngày: 3 đặt chỗ consumed ĐÃ có dòng thư gắn reservation, gửi 2 (=5) → không đếm đôi → cho phép', channel: 'email', plan: { dailyEmail: 5 }, quantity: 2, seed: async (h) => { for (let i = 0; i < 3; i += 1) { const id = await h.reservation({ status: 'consumed', channel: 'email' }); await h.email(1, { resv: id }); } }, e: 'A' },
  { id: 'E-R6', name: 'email/ngày: 3 consumed + dòng thư gắn reservation, gửi 3 (=6) → chặn (cả hai luật cùng đếm 3)', channel: 'email', plan: { dailyEmail: 5 }, quantity: 3, seed: async (h) => { for (let i = 0; i < 3; i += 1) { const id = await h.reservation({ status: 'consumed', channel: 'email' }); await h.email(1, { resv: id }); } }, e: 'D:daily' },
  { id: 'E-R7', name: 'email/ngày: 4 đã gửi + 1 reservation đang sending (=5) → luật mới chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { await h.email(4); await h.reservation({ status: 'sending', channel: 'email' }); }, e: { legacy: 'A', atomic: 'D:daily', blind: 'đặt chỗ treo' } },
  { id: 'E-R8', name: 'email/ngày: 5 reservation uncertain (gửi chưa rõ kết quả) vẫn tính → luật mới chặn', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (let i = 0; i < 5; i += 1) await h.reservation({ status: 'uncertain', channel: 'email' }); }, e: { legacy: 'A', atomic: 'D:daily', blind: 'đặt chỗ treo' } },
  { id: 'E-R9', name: 'email/ngày: 5 đặt chỗ treo của HÔM QUA không tính vào hôm nay → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (let i = 0; i < 5; i += 1) await h.reservation({ channel: 'email', day: 'yesterday' }); }, e: 'A' },
  { id: 'E-R10', name: 'email/ngày: đặt chỗ không tính phí (is_metered=false) ×5 bị bỏ qua → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (let i = 0; i < 5; i += 1) await h.reservation({ channel: 'email', metered: false }); }, e: 'A' },
  { id: 'E-R11', name: 'email/ngày: đặt chỗ treo kênh khác (zalo ×5) không tính vào email → cho phép', channel: 'email', plan: { dailyEmail: 5 }, seed: async (h) => { for (let i = 0; i < 5; i += 1) await h.reservation({ channel: 'zalo' }); }, e: 'A' },

  // ── Email · hạn mức tháng/kỳ + ví nạp thêm (monthly_email_limit = 10) ──
  { id: 'E-M1', name: 'email/kỳ: n−1 (9/10) → cho phép', channel: 'email', plan: { monthlyEmail: 10 }, seed: (h) => h.email(9), e: 'A' },
  { id: 'E-M2', name: 'email/kỳ: đúng ngưỡng (10/10), ví rỗng → chặn', channel: 'email', plan: { monthlyEmail: 10 }, seed: (h) => h.email(10), e: 'D:monthly' },
  { id: 'E-M3', name: 'email/kỳ: n+1 (11/10), ví rỗng → chặn', channel: 'email', plan: { monthlyEmail: 10 }, seed: (h) => h.email(11), e: 'D:monthly' },
  { id: 'E-M4', name: 'email/kỳ: 10 thư nằm TRƯỚC chu kỳ (cycleStart−1s) không tính → cho phép', channel: 'email', plan: { monthlyEmail: 10 }, seed: (h) => h.email(10, { at: 'beforeCycle' }), e: 'A' },
  { id: 'E-M5', name: 'email/kỳ: 9 trong chu kỳ + 5 trước chu kỳ → đếm 9 → cho phép', channel: 'email', plan: { monthlyEmail: 10 }, seed: async (h) => { await h.email(9, { at: 'twoDaysAgo' }); await h.email(5, { at: 'beforeCycle' }); }, e: 'A' },
  { id: 'E-M6', name: 'email/kỳ: hết hạn mức gói, ví nạp thêm còn 1 → cho phép, giữ 1 ví', channel: 'email', plan: { monthlyEmail: 10 }, seed: async (h) => { await h.email(10); await h.grant('emails', 1); }, e: 'A', wallet: { key: 'emails', qty: 1 } },
  { id: 'E-M7', name: 'email/kỳ: hết hạn mức gói, ví nạp thêm đã trừ hết (grant 3, debit 3) → chặn', channel: 'email', plan: { monthlyEmail: 10 }, seed: async (h) => { await h.email(10); await h.grant('emails', 3); await h.debit('emails', 3); }, e: 'D:monthly' },
  { id: 'E-M8', name: 'email/kỳ: hết hạn mức gói, ví 1 nhưng đã bị đặt chỗ giữ → luật mới chặn, luật cũ không thấy giữ chỗ', channel: 'email', plan: { monthlyEmail: 10 }, seed: async (h) => { await h.email(10); await h.grant('emails', 1); await h.reservation({ channel: 'email', qty: 1, walletKey: 'emails', walletQty: 1 }); }, e: { legacy: 'A', atomic: 'D:monthly', blind: 'giữ chỗ ví' } },
  { id: 'E-M9', name: 'email/kỳ: còn 1 chỗ gói + gửi 3, ví 2 (phủ 1 + ví 2) → cho phép, giữ 2 ví', channel: 'email', plan: { monthlyEmail: 10 }, quantity: 3, seed: async (h) => { await h.email(9); await h.grant('emails', 2); }, e: 'A', wallet: { key: 'emails', qty: 2 } },
  { id: 'E-M10', name: 'email/kỳ: còn 1 chỗ gói + gửi 3, ví chỉ 1 (cần 2) → chặn', channel: 'email', plan: { monthlyEmail: 10 }, quantity: 3, seed: async (h) => { await h.email(9); await h.grant('emails', 1); }, e: 'D:monthly' },
  { id: 'E-M14', name: 'email/kỳ: còn 1 chỗ gói + gửi 2, ví đúng 1 (phủ 1 + ví 1) → cho phép, giữ 1 ví', channel: 'email', plan: { monthlyEmail: 10 }, quantity: 2, seed: async (h) => { await h.email(9); await h.grant('emails', 1); }, e: 'A', wallet: { key: 'emails', qty: 1 } },
  { id: 'E-M11',name: 'email/kỳ: hạn mức tháng = 0 → chặn disabled', channel: 'email', plan: { monthlyEmail: 0 }, e: 'D:disabled' },
  { id: 'E-M12', name: 'email/kỳ + ngày: ngày còn chỗ nhưng kỳ đầy và ví rỗng → chặn monthly (thứ tự: ngày qua, tháng chặn)', channel: 'email', plan: { dailyEmail: 50, monthlyEmail: 10 }, seed: async (h) => { await h.email(10, { at: 'twoDaysAgo' }); }, e: 'D:monthly' },
  { id: 'E-M13', name: 'email/kỳ: ví Zalo không cứu được email (grant zalo_messages 5, email hết kỳ) → chặn', channel: 'email', plan: { monthlyEmail: 10 }, seed: async (h) => { await h.email(10); await h.grant('zalo_messages', 5); }, e: 'D:monthly' },

  // ── Zalo (cá nhân / nhóm / kết bạn đều tính chung kênh zalo) · daily_zalo_limit = 5 ──
  { id: 'Z-D1', name: 'zalo cá nhân/ngày: n−1 (4/5) → cho phép', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(4), e: 'A' },
  { id: 'Z-D2', name: 'zalo cá nhân/ngày: đúng ngưỡng (5/5) → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(5), e: 'D:daily' },
  { id: 'Z-D3', name: 'zalo nhóm/ngày: 5 tin nhóm → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(5, { channel: 'zalo_group' }), e: 'D:daily' },
  { id: 'Z-D4', name: 'zalo kết bạn/ngày: 5 lời mời → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(5, { channel: 'zalo_friend_request' }), e: 'D:daily' },
  { id: 'Z-D5', name: 'zalo/ngày: 2 cá nhân + 2 nhóm + 1 kết bạn (=5) → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: async (h) => { await h.zalo(2); await h.zalo(2, { channel: 'zalo_group' }); await h.zalo(1, { channel: 'zalo_friend_request' }); }, e: 'D:daily' },
  { id: 'Z-D6', name: 'zalo/ngày: tin failed ×5 và preview ×5 không tính → cho phép', channel: 'zalo', plan: { dailyZalo: 5 }, seed: async (h) => { await h.zalo(5, { status: 'failed' }); await h.zalo(5, { preview: true }); }, e: 'A' },
  { id: 'Z-D7', name: 'zalo/ngày: 3 tin chiến dịch + 2 gửi trực tiếp (usage_logs) = 5 → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: async (h) => { await h.zalo(3); await h.usage('zalo_direct_send', 2); }, e: 'D:daily' },
  { id: 'Z-D8', name: 'zalo/ngày: qua 00:00 VN — 5 tin lúc 23:59:59 hôm qua → cho phép', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(5, { at: 'beforeToday' }), e: 'A' },
  { id: 'Z-D9', name: 'zalo/ngày: đúng 00:00:00 hôm nay (5 tin) → chặn', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.zalo(5, { at: 'todayStart' }), e: 'D:daily' },
  { id: 'Z-D10', name: 'zalo/ngày: tin email không tính vào Zalo (5 thư) → cho phép', channel: 'zalo', plan: { dailyZalo: 5 }, seed: (h) => h.email(5), e: 'A' },
  { id: 'Z-R1', name: 'zalo/ngày: 4 đã gửi + 1 reserved (=5) → luật mới chặn, luật cũ không thấy', channel: 'zalo', plan: { dailyZalo: 5 }, seed: async (h) => { await h.zalo(4); await h.reservation({ channel: 'zalo' }); }, e: { legacy: 'A', atomic: 'D:daily', blind: 'đặt chỗ treo' } },
  { id: 'Z-R2', name: 'zalo/ngày: 2 consumed có dòng tin gắn reservation, gửi 3 (=5) → không đếm đôi → cho phép', channel: 'zalo', plan: { dailyZalo: 5 }, quantity: 3, seed: async (h) => { for (let i = 0; i < 2; i += 1) { const id = await h.reservation({ status: 'consumed', channel: 'zalo' }); await h.zalo(1, { resv: id }); } }, e: 'A' },
  { id: 'Z-M1', name: 'zalo/kỳ: n−1 (9/10) → cho phép', channel: 'zalo', plan: { monthlyZalo: 10 }, seed: (h) => h.zalo(9), e: 'A' },
  { id: 'Z-M2', name: 'zalo/kỳ: đúng ngưỡng (10/10), ví rỗng → chặn', channel: 'zalo', plan: { monthlyZalo: 10 }, seed: (h) => h.zalo(10), e: 'D:monthly' },
  { id: 'Z-M3', name: 'zalo/kỳ: hết hạn mức gói, ví zalo_messages còn 1 → cho phép, giữ 1 ví', channel: 'zalo', plan: { monthlyZalo: 10 }, seed: async (h) => { await h.zalo(10); await h.grant('zalo_messages', 1); }, e: 'A', wallet: { key: 'zalo_messages', qty: 1 } },
  { id: 'Z-M4', name: 'zalo/kỳ: hết hạn mức gói, ví zalo_messages hết → chặn', channel: 'zalo', plan: { monthlyZalo: 10 }, seed: async (h) => { await h.zalo(10); await h.grant('zalo_messages', 2); await h.debit('zalo_messages', 2); }, e: 'D:monthly' },
  { id: 'Z-M5', name: 'zalo/kỳ: 10 tin trước chu kỳ không tính → cho phép', channel: 'zalo', plan: { monthlyZalo: 10 }, seed: (h) => h.zalo(10, { at: 'beforeCycle' }), e: 'A' },

  // ── Telegram / WhatsApp (kênh adapter, hạn mức tháng riêng, không có trần ngày) ──
  { id: 'T-M1', name: 'telegram/kỳ: n−1 (2/3) → cho phép', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: (h) => h.ccm(2, 'telegram'), e: 'A' },
  { id: 'T-M2', name: 'telegram/kỳ: đúng ngưỡng (3/3), ví rỗng → chặn', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: (h) => h.ccm(3, 'telegram'), e: 'D:monthly' },
  { id: 'T-M3', name: 'telegram/kỳ: tin queued/failed/preview không tính → cho phép', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: async (h) => { await h.ccm(3, 'telegram', { status: 'queued' }); await h.ccm(3, 'telegram', { status: 'failed' }); await h.ccm(3, 'telegram', { preview: true }); }, e: 'A' },
  { id: 'T-M4', name: 'telegram/kỳ: 2 tin chiến dịch + 1 gửi nhanh (usage_logs telegram_direct_send) = 3 → chặn', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: async (h) => { await h.ccm(2, 'telegram'); await h.usage('telegram_direct_send', 1); }, e: 'D:monthly' },
  { id: 'T-M5', name: 'telegram/kỳ: hết kỳ, ví telegram_messages còn 1 → cho phép, giữ 1 ví', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: async (h) => { await h.ccm(3, 'telegram'); await h.grant('telegram_messages', 1); }, e: 'A', wallet: { key: 'telegram_messages', qty: 1 } },
  { id: 'T-M6', name: 'telegram: trần Zalo/ngày thấp và đã vượt KHÔNG chặn Telegram (5 tin zalo, daily_zalo=1) → cho phép', channel: 'telegram', plan: { dailyZalo: 1, monthlyZalo: 1, monthlyTelegram: 3 }, seed: (h) => h.zalo(5), e: 'A' },
  { id: 'T-M7', name: 'telegram/kỳ: 3 tin trước chu kỳ không tính → cho phép', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: (h) => h.ccm(3, 'telegram', { at: 'beforeCycle' }), e: 'A' },
  { id: 'T-R1', name: 'telegram/kỳ: 2 đã gửi + 1 reserved (=3) → luật mới chặn, luật cũ không thấy', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: async (h) => { await h.ccm(2, 'telegram'); await h.reservation({ channel: 'telegram' }); }, e: { legacy: 'A', atomic: 'D:monthly', blind: 'đặt chỗ treo' } },
  { id: 'T-R2', name: 'telegram/kỳ: 3 consumed + dòng ccm gắn reservation → luật mới đếm 3 (chặn), luật cũ loại dòng gắn reservation nên thấy 0', channel: 'telegram', plan: { monthlyTelegram: 3 }, seed: async (h) => { for (let i = 0; i < 3; i += 1) { const id = await h.reservation({ status: 'consumed', channel: 'telegram' }); await h.ccm(1, 'telegram', { resv: id }); } }, e: { legacy: 'A', atomic: 'D:monthly', blind: 'ccm gắn reservation bị luật cũ loại' } },
  { id: 'W-M1', name: 'whatsapp/kỳ: hạn mức = 0 → chặn disabled', channel: 'whatsapp', plan: { monthlyWhatsapp: 0 }, e: 'D:disabled' },
  { id: 'W-M2', name: 'whatsapp độc lập telegram: telegram đầy (3/3), whatsapp 0/3 → cho phép', channel: 'whatsapp', plan: { monthlyTelegram: 3, monthlyWhatsapp: 3 }, seed: (h) => h.ccm(3, 'telegram'), e: 'A' },
  { id: 'W-M3', name: 'whatsapp/kỳ: đúng ngưỡng (3/3) → chặn', channel: 'whatsapp', plan: { monthlyWhatsapp: 3 }, seed: (h) => h.ccm(3, 'whatsapp'), e: 'D:monthly' },

  // ── Trần tổng theo kỳ (messages_per_period = 10, cộng email + zalo + adapter) ──
  { id: 'P-1', name: 'tổng kỳ: n−1 (6 email + 3 zalo = 9/10) → cho phép', channel: 'email', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(6); await h.zalo(3); }, e: 'A' },
  { id: 'P-2', name: 'tổng kỳ: đúng ngưỡng (6 email + 4 zalo = 10/10) → chặn period', channel: 'email', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(6); await h.zalo(4); }, e: 'D:period' },
  { id: 'P-3', name: 'tổng kỳ: cộng cả adapter (5 email + 5 telegram = 10/10), gửi zalo → chặn period', channel: 'zalo', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(5); await h.ccm(5, 'telegram'); }, e: 'D:period' },
  { id: 'P-4', name: 'tổng kỳ: n+1 (11/10), gửi telegram → chặn period', channel: 'telegram', plan: { perPeriod: 10, monthlyTelegram: 50 }, seed: async (h) => { await h.email(6); await h.zalo(5); }, e: 'D:period' },
  { id: 'P-5', name: 'tổng kỳ = 0 → chặn disabled', channel: 'email', plan: { perPeriod: 0 }, e: 'D:disabled' },
  { id: 'P-6', name: 'tổng kỳ + đặt chỗ treo: 9 đã gửi + 1 reserved (=10) → luật mới chặn period', channel: 'email', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(9); await h.reservation({ channel: 'email' }); }, e: { legacy: 'A', atomic: 'D:period', blind: 'đặt chỗ treo' } },
  { id: 'P-7', name: 'tổng kỳ: 10 tin trước chu kỳ không tính → cho phép', channel: 'email', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(6, { at: 'beforeCycle' }); await h.zalo(4, { at: 'beforeCycle' }); }, e: 'A' },
  { id: 'P-8', name: 'tổng kỳ: ví nạp thêm KHÔNG vượt được trần tổng (đầy 10/10, ví emails 5) → chặn period', channel: 'email', plan: { perPeriod: 10 }, seed: async (h) => { await h.email(10); await h.grant('emails', 5); }, e: 'D:period' },

  // ── Gói: hết hạn / ân hạn / không có gói / super admin ──
  { id: 'S-1', name: 'gói hết hạn 2 ngày, ân hạn 0 → chặn expired', channel: 'email', plan: { dailyEmail: 50 }, expiredDaysAgo: 2, graceDays: 0, e: 'D:expired' },
  { id: 'S-2', name: 'gói hết hạn 2 ngày nhưng ân hạn 3 ngày → cho phép', channel: 'email', plan: { dailyEmail: 50 }, expiredDaysAgo: 2, graceDays: 3, e: 'A' },
  { id: 'S-3', name: 'gói hết hạn 4 ngày, ân hạn 3 ngày (qua ân hạn) → chặn expired', channel: 'email', plan: { dailyEmail: 50 }, expiredDaysAgo: 4, graceDays: 3, e: 'D:expired' },
  { id: 'S-4', name: 'không có gói → chặn no_plan', channel: 'email', noPlan: true, e: 'D:no_plan' },
  { id: 'S-5', name: 'super admin (role admin) → bỏ qua hạn mức, đặt chỗ is_metered=false', channel: 'email', ownerRole: 'admin', seed: (h) => h.email(500), e: 'A' },
  { id: 'S-6', name: 'gói hết hạn: Zalo cũng chặn expired', channel: 'zalo', plan: { dailyZalo: 50 }, expiredDaysAgo: 2, graceDays: 0, e: 'D:expired' },
  { id: 'S-7', name: 'gói hết hạn: Telegram cũng chặn expired', channel: 'telegram', plan: { monthlyTelegram: 50 }, expiredDaysAgo: 2, graceDays: 0, e: 'D:expired' },

  // ── Nhân viên: trần riêng (user_members) + tính vào workspace của chủ ──
  { id: 'N-1', name: 'nhân viên/ngày email: n−1 (2/3) → cho phép', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } }, seed: (h) => h.email(2, { actor: h.staff.id }), e: 'A' },
  { id: 'N-2', name: 'nhân viên/ngày email: đúng ngưỡng (3/3) → chặn employee', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } }, seed: (h) => h.email(3, { actor: h.staff.id }), e: 'D:employee' },
  { id: 'N-3', name: 'nhân viên/ngày email: n+1 (4/3) → chặn employee', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } }, seed: (h) => h.email(4, { actor: h.staff.id }), e: 'D:employee' },
  { id: 'N-4', name: 'nhân viên/ngày email: thư của nhân viên KHÁC và của chủ không tính cho trần nhân viên này → cho phép', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } }, seed: async (h) => { const other = await h.makeStaff(); await h.email(5, { actor: other.id }); await h.email(5, { actor: h.owner.id }); await h.email(5); }, e: 'A' },
  { id: 'N-5', name: 'nhân viên/ngày email: trần = 0 → chặn employee', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 0 } }, e: 'D:employee' },
  { id: 'N-6', name: 'nhân viên bị khoá (inactive) → chặn employee_inactive', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: {}, status: 'inactive' }, e: 'D:employee_inactive' },
  { id: 'N-7', name: 'nhân viên/kỳ email: đúng ngưỡng (5/5) → chặn employee', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { monthlyEmail: 5 } }, seed: (h) => h.email(5, { actor: h.staff.id, at: 'twoDaysAgo' }), e: 'D:employee' },
  { id: 'N-8', name: 'nhân viên/kỳ email: n−1 (4/5) → cho phép', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { monthlyEmail: 5 } }, seed: (h) => h.email(4, { actor: h.staff.id, at: 'twoDaysAgo' }), e: 'A' },
  { id: 'N-9', name: 'nhân viên/ngày zalo: đúng ngưỡng (2/2) → chặn employee', channel: 'zalo', plan: { dailyZalo: 100 }, employee: { limits: { dailyZalo: 2 } }, seed: (h) => h.zalo(2, { actor: h.staff.id }), e: 'D:employee' },
  { id: 'N-10', name: 'nhân viên/kỳ zalo: đúng ngưỡng (3/3) → chặn employee', channel: 'zalo', plan: { dailyZalo: 100 }, employee: { limits: { monthlyZalo: 3 } }, seed: (h) => h.zalo(3, { actor: h.staff.id, at: 'twoDaysAgo' }), e: 'D:employee' },
  { id: 'N-11', name: 'nhân viên gửi tính vào hạn mức ngày của CHỦ workspace: 5 thư do nhân viên gửi, trần gói 5 → chặn daily', channel: 'email', plan: { dailyEmail: 5 }, employee: { limits: {} }, seed: (h) => h.email(5, { actor: h.staff.id }), e: 'D:daily' },
  { id: 'N-12', name: 'nhân viên: không có X-Owner-Context, suy ra chủ qua membership — 3/3 → chặn employee', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 }, noOwnerContext: true }, seed: (h) => h.email(3, { actor: h.staff.id }), e: 'D:employee' },
  { id: 'N-13', name: 'nhân viên/ngày: đặt chỗ treo của nhân viên (2 đã gửi + 1 reserved = 3/3) → luật mới chặn', channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } }, seed: async (h) => { await h.email(2, { actor: h.staff.id }); await h.reservation({ channel: 'email', actor: h.staff.id }); }, e: { legacy: 'A', atomic: 'D:employee', blind: 'đặt chỗ treo' } },
  { id: 'N-14', name: 'nhân viên + Telegram: trần Zalo/ngày = 0 của nhân viên KHÔNG áp cho Telegram → cho phép', channel: 'telegram', plan: { monthlyTelegram: 50 }, employee: { limits: { dailyZalo: 0, monthlyZalo: 0 } }, e: 'A' },
  { id: 'N-15', name: 'nhân viên: chủ đầy trần gói (email 5/5 do chủ gửi) → nhân viên cũng bị chặn daily', channel: 'email', plan: { dailyEmail: 5 }, employee: { limits: { dailyEmail: 100 } }, seed: (h) => h.email(5, { actor: h.owner.id }), e: 'D:daily' },
  { id: 'N-16', name: 'nhân viên + hạn mức kỳ của gói: nhân viên còn trần riêng nhưng kỳ gói đầy, ví rỗng → chặn monthly', channel: 'email', plan: { monthlyEmail: 10 }, employee: { limits: { dailyEmail: 100 } }, seed: (h) => h.email(10, { actor: h.owner.id, at: 'twoDaysAgo' }), e: 'D:monthly' },
  // THĂM DÒ (không caller thật nào truyền kiểu này — mọi caller đặt userId = người gửi và ownerContextId = chủ workspace, không ai truyền actorUserId):
  // userId = chủ, actorUserId = nhân viên, không ownerContextId. Luật cũ KHÔNG dùng actorUserId để nhận ra nhân viên (userSendLimit.util.js:650);
  // luật mới có (sendQuotaReservation.service.js:409-413).
  { id: 'N-17', name: 'thăm dò — userId=chủ + actorUserId=nhân viên (3/3), không ownerContextId: luật mới áp trần nhân viên, luật cũ không', channel: 'email', plan: { dailyEmail: 100 }, actorOnly: { limits: { dailyEmail: 3 } }, seed: (h) => h.email(3, { actor: h.staff.id }), e: { legacy: 'A', atomic: 'D:employee', blind: 'actorUserId không có caller thật' } },
];

// ───────────────────────────── Thực thi ─────────────────────────────

afterAll(() => {
  const lines = [
    '',
    '| Ca | Kênh | SL | Luật cũ | Luật mới | Enforce reserve | Khớp? | Mô tả |',
    '|---|---|---|---|---|---|---|---|',
    ...records.map((r) => `| ${r.id} | ${r.channel} | ${r.qty} | ${r.legacy} | ${r.atomic} | ${r.reserve} | ${r.match} | ${r.name} |`),
    '',
  ];
  // eslint-disable-next-line no-console
  console.log(`[sendQuotaEnforceBoundaryMatrix] BẢNG KẾT QUẢ (${records.length} ca)\n${lines.join('\n')}`);
});

describe('Ma trận ranh giới hạn mức gửi — luật cũ / luật mới / reserveSendQuota ở enforce', () => {
  beforeEach(async () => {
    await truncateAll();
    _clearQuotaCache();
  });

  it('thống kê danh sách ca: ≥ 24 ca và ≥ 20 ca chặn (deny)', () => {
    const denyCases = CASES.filter((c) => {
      const exp = expectations(c.e);
      return exp.atomic.startsWith('D:');
    });
    expect(CASES.length).toBeGreaterThanOrEqual(24);
    expect(denyCases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    // Phủ đủ kênh và đủ loại chặn.
    expect(new Set(CASES.map((c) => c.channel))).toEqual(new Set(['email', 'zalo', 'telegram', 'whatsapp']));
    const types = new Set(CASES.map((c) => expectations(c.e).atomic).filter((s) => s.startsWith('D:')));
    for (const t of ['D:daily', 'D:monthly', 'D:period', 'D:disabled', 'D:expired', 'D:no_plan', 'D:employee', 'D:employee_inactive']) {
      expect(types.has(t)).toBe(true);
    }
  });

  for (const c of CASES) {
    it(`[${c.id}] ${c.name}`, async () => {
      await runCase(c);
    });
  }
});

// ───────────────────────────── Giới hạn ngày tự đặt của tài khoản gửi ─────────────────────────────

describe('Giới hạn ngày tự đặt của TÀI KHOẢN gửi — trục độc lập với hạn mức gói, không bị enforce đổi', () => {
  beforeEach(async () => {
    await truncateAll();
    _clearQuotaCache();
  });

  const accountCases = [
    { id: 'A-1', sent: 2, limit: 3, qty: 1, allowed: true, label: 'n−1 (2/3)' },
    { id: 'A-2', sent: 3, limit: 3, qty: 1, allowed: false, label: 'đúng ngưỡng (3/3)' },
    { id: 'A-3', sent: 4, limit: 3, qty: 1, allowed: false, label: 'n+1 (4/3)' },
    { id: 'A-4', sent: 2, limit: 3, qty: 2, allowed: false, label: 'gửi 2 khi còn 1 chỗ' },
    { id: 'A-5', sent: 3, limit: null, qty: 1, allowed: true, label: 'không đặt giới hạn (null)' },
  ];

  for (const ac of accountCases) {
    it(`[${ac.id}] email: ${ac.label} → ${ac.allowed ? 'cho phép' : 'chặn'}, và gói (còn dư) vẫn cho phép ở enforce`, async () => {
      const h = await buildHarness({ channel: 'email', plan: { dailyEmail: 100 } });
      await h.email(ac.sent, { settingId: 777 });
      await h.email(10, { settingId: 888 }); // tài khoản gửi khác không tính
      const r = await checkAccountDailyLimit({ channel: 'email', accountId: 777, limit: ac.limit, quantity: ac.qty });
      expect(r.allowed).toBe(ac.allowed);
      const reserve = await runReserve(h, { channel: 'email' }, 1);
      expect(reserve.allowed).toBe(true); // trục gói độc lập: tài khoản chạm trần không làm hạn mức gói chặn
      records.push({ id: ac.id, channel: 'email', qty: ac.qty, legacy: 'n/a', atomic: 'n/a', reserve: reserve.allowed ? 'ALLOW' : 'DENY', match: `tài khoản: ${ac.allowed ? 'ALLOW' : 'DENY'}`, name: `tài khoản email, ${ac.label}` });
    });
  }

  it('[A-6] zalo: 3/3 tin của tài khoản zalo (account_id) → chặn; tin tài khoản khác & failed không tính', async () => {
    const h = await buildHarness({ channel: 'zalo', plan: { dailyZalo: 100 } });
    await h.zalo(3, { accountId: 555 });
    await h.zalo(7, { accountId: 556 });
    await h.zalo(5, { accountId: 555, status: 'failed' });
    expect((await checkAccountDailyLimit({ channel: 'zalo', accountId: 555, limit: 3 })).allowed).toBe(false);
    expect((await checkAccountDailyLimit({ channel: 'zalo', accountId: 555, limit: 4 })).allowed).toBe(true);
    expect((await runReserve(h, { channel: 'zalo' }, 1)).allowed).toBe(true);
  });

  it('[A-7] telegram: 3/3 tin của tài khoản (account_key) → chặn; qua 00:00 VN (hôm qua) không tính', async () => {
    const h = await buildHarness({ channel: 'telegram', plan: { monthlyTelegram: 100 } });
    await h.ccm(3, 'telegram', { accountKey: '42' });
    await h.ccm(5, 'telegram', { accountKey: '42', at: 'beforeToday' });
    expect((await checkAccountDailyLimit({ channel: 'telegram', accountId: 42, limit: 3 })).allowed).toBe(false);
    expect((await checkAccountDailyLimit({ channel: 'telegram', accountId: 42, limit: 4 })).allowed).toBe(true);
    expect((await runReserve(h, { channel: 'telegram' }, 1)).allowed).toBe(true);
  });
});

// ───────────────────────────── Đồng thời ─────────────────────────────

describe('Đồng thời ở enforce — N yêu cầu song song đúng ngưỡng: số được phép = đúng phần còn lại', () => {
  beforeEach(async () => {
    await truncateAll();
    _clearQuotaCache();
  });

  async function fire(h, c, n, qty = 1) {
    const results = await Promise.allSettled(
      Array.from({ length: n }, (_, i) => reserveSendQuota(reserveParams(h, c, qty, `conc_${i}_${nextSeq()}`), { modeOverride: 'enforce' }))
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const denied = results.filter((r) => r.status === 'rejected');
    for (const d of denied) {
      expect(d.reason.status).toBe(403);
      expect(d.reason.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    }
    return { ok, denied };
  }

  it('[C-1] 12 yêu cầu song song, hạn mức ngày email 5, đã gửi 2 → đúng 3 được phép, 9 bị chặn, ledger đúng 3 dòng', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 5 } };
    const h = await buildHarness(c);
    await h.email(2);
    const { ok, denied } = await fire(h, c, 12);
    expect(ok).toHaveLength(3);
    expect(denied).toHaveLength(9);
    for (const d of denied) expect(d.reason.limitType).toBe('daily');
    expect(await countReservations(h.owner.id)).toBe(3);
    // Sau đó cả hai luật cùng kết luận chặn (đủ 2 + 3 = 5).
    const legacyAfter = await runLegacy(h, c, 1);
    const atomicAfter = await runAtomic(h, c, 1);
    expect(legacyAfter.allowed).toBe(true); // luật cũ không thấy 3 chỗ đặt (blind), CHỈ luật mới + enforce là cổng thật
    expect(atomicAfter.allowed).toBe(false);
  });

  it('[C-2] 10 yêu cầu song song số lượng 2, còn 5 chỗ → đúng 2 được phép (4 ≤ 5), không vượt', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 5 } };
    const h = await buildHarness(c);
    const { ok, denied } = await fire(h, c, 10, 2);
    expect(ok).toHaveLength(2);
    expect(denied).toHaveLength(8);
    const { rows } = await db.query('SELECT COALESCE(SUM(quantity),0)::int AS q FROM send_quota_reservations WHERE billing_user_id = $1', [h.owner.id]);
    expect(rows[0].q).toBe(4);
  });

  it('[C-3] ví: hết hạn mức kỳ, ví 2, 8 yêu cầu song song → đúng 2 được phép, mỗi cái giữ 1 ví, available = 0', async () => {
    const c = { channel: 'email', plan: { monthlyEmail: 10 } };
    const h = await buildHarness(c);
    await h.email(10);
    await h.grant('emails', 2);
    const { ok, denied } = await fire(h, c, 8);
    expect(ok).toHaveLength(2);
    expect(denied).toHaveLength(6);
    for (const r of ok) expect(r.value.wallet_quantity).toBe(1);
    const wallet = await getWalletAvailableBalance(db, h.owner.id, 'emails');
    expect(wallet).toMatchObject({ granted: 2, debited: 0, activeHolds: 2, available: 0 });
  });

  it('[C-4] nhân viên: trần ngày riêng 3, 10 yêu cầu song song → đúng 3 được phép', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 100 }, employee: { limits: { dailyEmail: 3 } } };
    const h = await buildHarness(c);
    const { ok, denied } = await fire(h, c, 10);
    expect(ok).toHaveLength(3);
    expect(denied).toHaveLength(7);
    for (const d of denied) expect(d.reason.limitType).toBe('employee');
  });

  it('[C-5] trần tổng theo kỳ: còn 4 chỗ, 12 yêu cầu song song (email/zalo xen kẽ) → đúng 4 được phép', async () => {
    const c = { channel: 'email', plan: { perPeriod: 10 } };
    const h = await buildHarness(c);
    await h.email(3);
    await h.zalo(3);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => {
        const ch = i % 2 === 0 ? 'email' : 'zalo';
        return reserveSendQuota(reserveParams(h, { channel: ch }, 1, `mix_${i}_${nextSeq()}`), { modeOverride: 'enforce' });
      })
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect(r.reason.limitType).toBe('period');
    }
  });
});

// ───────────────────────────── Cache của luật cũ không làm lệch enforce ─────────────────────────────

describe('Giả thuyết #6 (cache hạn mức ~1s của luật cũ): enforce đọc CSDL trực tiếp nên không bao giờ dùng số đếm cũ', () => {
  beforeEach(async () => {
    await truncateAll();
    _clearQuotaCache();
  });

  it('[K-1] mồi cache luật cũ ở 4/5, thêm 1 thư (5/5), KHÔNG xoá cache → reserve ở enforce vẫn chặn ngay', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 5 } };
    const h = await buildHarness(c);
    await h.email(4);
    _clearQuotaCache();
    const primed = await checkSendQuota(legacyParams(h, c, 1));
    expect(primed.allowed).toBe(true); // mồi cache: số đếm = 4

    await h.email(1); // 5/5 — thay đổi xảy ra TRONG cửa sổ cache của luật cũ
    const t0 = Date.now();
    const legacyNoClear = await checkSendQuota(legacyParams(h, c, 1)); // KHÔNG _clearQuotaCache()
    const withinTtl = Date.now() - t0 < 800;

    await expect(reserveSendQuota(reserveParams(h, c, 1, 'k1'), { modeOverride: 'enforce' })).rejects.toMatchObject({ status: 403, limitType: 'daily' });
    records.push({
      id: 'K-1', channel: 'email', qty: 1,
      legacy: withinTtl ? (legacyNoClear.allowed ? 'ALLOW (kẹt cache)' : 'DENY:daily') : 'n/a (quá TTL)',
      atomic: 'DENY:daily', reserve: 'DENY:daily',
      match: 'LỆCH CÓ CHỦ ĐÍCH (cache luật cũ ≤ TTL; enforce không dùng cache)',
      name: 'mồi cache 4/5 → thêm thư lên 5/5 → luật mới/enforce chặn đúng',
    });
  });

  it('[K-2] mồi cache luật cũ khi hạn mức ngày = 100, hạ gói về 0 (admin đổi gói), KHÔNG xoá cache → reserve chặn disabled ngay', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 100 } };
    const h = await buildHarness(c);
    _clearQuotaCache();
    expect((await checkSendQuota(legacyParams(h, c, 1))).allowed).toBe(true);

    await db.query('UPDATE plans SET daily_email_limit = 0 WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)', [h.owner.id]);
    await expect(reserveSendQuota(reserveParams(h, c, 1, 'k2'), { modeOverride: 'enforce' })).rejects.toMatchObject({ status: 403, limitType: 'disabled' });
    expect((await runLegacy(h, c, 1)).type).toBe('disabled'); // sau khi cache hết/xoá, luật cũ cùng kết luận
  });
});

// ───────────────────────────── Vòng đời đặt chỗ + ví ─────────────────────────────

describe('Vòng đời đặt chỗ ở enforce — reserve → sending → consume/release: đếm và ví không đôi, không hụt', () => {
  beforeEach(async () => {
    await truncateAll();
    _clearQuotaCache();
  });

  it('[L-1] consume dùng ví: ví giữ chỗ → sang debit đúng 1 lần, available không đổi, đếm kỳ tăng đúng 1 (không đếm đôi)', async () => {
    const c = { channel: 'email', plan: { monthlyEmail: 10 } };
    const h = await buildHarness(c);
    await h.email(10);
    await h.grant('emails', 2);

    const r = await reserveSendQuota(reserveParams(h, c, 1, 'life_1'), { modeOverride: 'enforce' });
    expect(r.wallet_quantity).toBe(1);
    expect(await getWalletAvailableBalance(db, h.owner.id, 'emails')).toMatchObject({ granted: 2, debited: 0, activeHolds: 1, available: 1 });

    await markSendQuotaSending({ reservationId: r.id }, { modeOverride: 'enforce' });
    await consumeSendQuota({ reservationId: r.id }, { modeOverride: 'enforce' });
    expect(await getWalletAvailableBalance(db, h.owner.id, 'emails')).toMatchObject({ granted: 2, debited: 1, activeHolds: 0, available: 1 });
    const { rows } = await db.query('SELECT item_key, qty, source_key FROM topup_debits WHERE user_id = $1', [h.owner.id]);
    expect(rows).toEqual([{ item_key: 'emails', qty: 1, source_key: `quota_reservation:${r.id}` }]);

    // Còn 1 ví → một lượt nữa vẫn được; hết ví → chặn.
    const r2 = await reserveSendQuota(reserveParams(h, c, 1, 'life_1b'), { modeOverride: 'enforce' });
    expect(r2.wallet_quantity).toBe(1);
    await expect(reserveSendQuota(reserveParams(h, c, 1, 'life_1c'), { modeOverride: 'enforce' })).rejects.toMatchObject({ status: 403, limitType: 'monthly' });
  });

  it('[L-2] release nhả chỗ: sau release luật mới đếm lại như chưa đặt, ví nhả giữ chỗ', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 1, monthlyEmail: 10 } };
    const h = await buildHarness(c);
    await h.email(10, { at: 'twoDaysAgo' });
    await h.grant('emails', 1);

    const r = await reserveSendQuota(reserveParams(h, c, 1, 'life_2'), { modeOverride: 'enforce' });
    expect(r.wallet_quantity).toBe(1);
    // Đang giữ chỗ: lượt kế bị chặn (daily 1/1).
    await expect(reserveSendQuota(reserveParams(h, c, 1, 'life_2b'), { modeOverride: 'enforce' })).rejects.toMatchObject({ status: 403 });

    await releaseSendQuota({ reservationId: r.id, failureCode: 'provider_rejected' }, { modeOverride: 'enforce' });
    expect(await getWalletAvailableBalance(db, h.owner.id, 'emails')).toMatchObject({ debited: 0, activeHolds: 0, available: 1 });
    const again = await reserveSendQuota(reserveParams(h, c, 1, 'life_2c'), { modeOverride: 'enforce' });
    expect(again.allowed).toBe(true);
  });

  it('[L-3] sau consume + dòng thư gắn reservation: đếm ngày luật mới = đếm luật cũ (cùng 1, không 0 và không 2)', async () => {
    const c = { channel: 'email', plan: { dailyEmail: 5 } };
    const h = await buildHarness(c);
    const r = await reserveSendQuota(reserveParams(h, c, 1, 'life_3'), { modeOverride: 'enforce' });
    await markSendQuotaSending({ reservationId: r.id }, { modeOverride: 'enforce' });
    await consumeSendQuota({
      reservationId: r.id,
      persistSource: async (client) => {
        await client.query(
          `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at, quota_reservation_id)
           VALUES ($1, 'r@example.com', 's@example.com', 'S', 'sent', false, LOCALTIMESTAMP, $2)`,
          [h.owner.id, r.id]
        );
      },
    }, { modeOverride: 'enforce' });

    // Còn đúng 4 chỗ: gửi 4 được, gửi 5 bị chặn — cả hai luật cùng kết luận (mỗi bên đếm đúng 1 lượt đã gửi).
    for (const [qty, allowed] of [[4, true], [5, false]]) {
      const legacy = await runLegacy(h, c, qty);
      const atomic = await runAtomic(h, c, qty);
      expect(legacy.allowed).toBe(allowed);
      expect(atomic.allowed).toBe(allowed);
    }
  });
});
