import db from '../config/database.js';
import { isAdminRole } from './roleScope.util.js';
import { getSubscriptionStatus } from './subscriptionStatus.util.js';
import {
  EFFECTIVE_PLAN_ID_SQL,
  resolveBillingUserId,
  getBillingCycle,
} from './billingCycle.util.js';
import {
  getWalletSnapshot,
  maybeDebitWalletForSend,
  WALLET_ITEM_BY_CHANNEL,
} from '../services/payment/topupWallet.service.js';
import usageTrackingRepository from '../repositories/payment/usageTracking.repository.js';

// is_fup_enabled: FUP behavior intentionally deferred (cờ chưa có hành vi).

const SUBSCRIPTION_EXPIRED_MSG =
  'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.';

const NO_PLAN_MSG =
  'Tài khoản chưa có gói dịch vụ. Vui lòng đăng ký gói để tiếp tục gửi.';

const PERIOD_LIMIT_MSG = (count, limit) =>
  `Đã đạt tổng hạn mức tin nhắn trong kỳ (${count}/${limit}). Hạn mức reset khi sang kỳ mới.`;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
// TTL thấp để giảm vượt hạn mức do check-then-act (P1-12). Override bằng env nếu cần.
const QUOTA_COUNT_CACHE_TTL_MS = Number.parseInt(process.env.QUOTA_COUNT_CACHE_TTL_MS, 10) || 1_000;

/** @type {Map<string, { value: any, expiresAt: number }>} */
const quotaCache = new Map();

export function _clearQuotaCache() {
  quotaCache.clear();
}

async function cached(key, fn) {
  const hit = quotaCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await fn();
  quotaCache.set(key, { value, expiresAt: Date.now() + QUOTA_COUNT_CACHE_TTL_MS });
  return value;
}

/**
 * Nửa đêm VN kế tiếp (00:00 Asia/Ho_Chi_Minh) tính từ `now`.
 * @param {Date} [now]
 * @returns {Date}
 */
export function nextVnMidnight(now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - VN_OFFSET_MS);
}

/**
 * 00:00 VN ngày 1 tháng sau.
 * @param {Date} [now]
 * @returns {Date}
 */
export function nextVnMonthStart(now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 1) - VN_OFFSET_MS);
}

const toInt = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toCount = (v) => Number.parseInt(v ?? 0, 10) || 0;

/** Scope campaigns theo billing owner (owner + employee active). */
const CAMPAIGN_OWNER_PREDICATE = `(c.id_user = $1 OR c.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

/** Scope zalo_personal_messages theo billing owner. */
const ZPM_OWNER_PREDICATE = `(zpm.id_user = $1 OR zpm.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

/**
 * Lấy giới hạn gửi tin từ effective plan của billing user.
 * Top-up consumable KHÔNG cộng vào trần — tiêu qua ví (topup_debits).
 * @param {number|string} billingUserId
 */
async function getUserPlanSendLimits(billingUserId) {
  return cached(`${billingUserId}:limits`, async () => {
    const { rows } = await db.query(
      `SELECT p.daily_email_limit, p.monthly_email_limit,
              p.daily_zalo_limit,  p.monthly_zalo_limit,
              p.messages_per_period
       FROM users u
       JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
       WHERE u.id = $1
       LIMIT 1`,
      [billingUserId]
    );
    const row = rows[0];
    if (!row) return null;

    return {
      daily_email_limit: row.daily_email_limit,
      daily_zalo_limit: row.daily_zalo_limit,
      messages_per_period: row.messages_per_period,
      monthly_email_limit: toInt(row.monthly_email_limit),
      monthly_zalo_limit: toInt(row.monthly_zalo_limit),
    };
  });
}

async function countEmailSentToday(billingUserId) {
  return cached(`${billingUserId}:email_today`, async () => {
    const { rows } = await db.query(
      `SELECT (
         (SELECT COUNT(*) FROM email_messages em
          INNER JOIN campaigns c ON c.id = em.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND em.sent_at >= CURRENT_DATE)
         + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
            WHERE ul.id_user = $1
              AND ul.resource_type = 'email_direct_send'
              AND ul.created_at >= CURRENT_DATE)
       )::int AS total`,
      [billingUserId]
    );
    return toCount(rows[0]?.total);
  });
}

export async function countEmailSentInCycle(billingUserId, cycleStart, cycleEnd, queryable = db) {
  const startIso = cycleStart instanceof Date ? cycleStart.toISOString() : String(cycleStart);
  const endIso = cycleEnd instanceof Date ? cycleEnd.toISOString() : String(cycleEnd);
  return cached(`${billingUserId}:email_cycle:${startIso}:${endIso}`, async () => {
    const { rows } = await queryable.query(
      `SELECT (
         (SELECT COUNT(*) FROM email_messages em
          INNER JOIN campaigns c ON c.id = em.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND em.sent_at >= $2 AND em.sent_at < $3)
         + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
            WHERE ul.id_user = $1
              AND ul.resource_type = 'email_direct_send'
              AND ul.created_at >= $2 AND ul.created_at < $3)
       )::int AS total`,
      [billingUserId, startIso, endIso]
    );
    return toCount(rows[0]?.total);
  });
}

export async function countEmailSentThisMonth(billingUserId, cycleStart = null, cycleEnd = null, queryable = db) {
  if (cycleStart && cycleEnd) {
    return countEmailSentInCycle(billingUserId, cycleStart, cycleEnd, queryable);
  }
  return cached(`${billingUserId}:email_month`, async () => {
    const { rows } = await queryable.query(
      `SELECT (
         (SELECT COUNT(*) FROM email_messages em
          INNER JOIN campaigns c ON c.id = em.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND em.sent_at >= DATE_TRUNC('month', NOW()))
         + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
            WHERE ul.id_user = $1
              AND ul.resource_type = 'email_direct_send'
              AND ul.created_at >= DATE_TRUNC('month', NOW()))
       )::int AS total`,
      [billingUserId]
    );
    return toCount(rows[0]?.total);
  });
}

async function countZaloSentToday(billingUserId) {
  return cached(`${billingUserId}:zalo_today`, async () => {
    const { rows } = await db.query(
      `SELECT (
         (SELECT COUNT(*) FROM zalo_messages zm
          JOIN campaigns c ON c.id = zm.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND zm.tracking_metadata->>'status' = 'sent'
            AND zm.sent_at >= CURRENT_DATE)
       + (SELECT COUNT(*) FROM zalo_personal_messages zpm
          WHERE ${ZPM_OWNER_PREDICATE}
            AND zpm.role = 'agent'
            AND zpm.metadata->>'source' = 'manual_inbox'
            AND zpm.created_at >= CURRENT_DATE)
       + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
          WHERE ul.id_user = $1
            AND ul.resource_type = 'zalo_direct_send'
            AND ul.created_at >= CURRENT_DATE)
       )::int AS total`,
      [billingUserId]
    );
    return toCount(rows[0]?.total);
  });
}

export async function countZaloSentInCycle(billingUserId, cycleStart, cycleEnd, queryable = db) {
  const startIso = cycleStart instanceof Date ? cycleStart.toISOString() : String(cycleStart);
  const endIso = cycleEnd instanceof Date ? cycleEnd.toISOString() : String(cycleEnd);
  return cached(`${billingUserId}:zalo_cycle:${startIso}:${endIso}`, async () => {
    const { rows } = await queryable.query(
      `SELECT (
         (SELECT COUNT(*) FROM zalo_messages zm
          JOIN campaigns c ON c.id = zm.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND zm.tracking_metadata->>'status' = 'sent'
            AND zm.sent_at >= $2 AND zm.sent_at < $3)
       + (SELECT COUNT(*) FROM zalo_personal_messages zpm
          WHERE ${ZPM_OWNER_PREDICATE}
            AND zpm.role = 'agent'
            AND zpm.metadata->>'source' = 'manual_inbox'
            AND zpm.created_at >= $2 AND zpm.created_at < $3)
       + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
          WHERE ul.id_user = $1
            AND ul.resource_type = 'zalo_direct_send'
            AND ul.created_at >= $2 AND ul.created_at < $3)
       )::int AS total`,
      [billingUserId, startIso, endIso]
    );
    return toCount(rows[0]?.total);
  });
}

export async function countZaloSentThisMonth(billingUserId, cycleStart = null, cycleEnd = null, queryable = db) {
  if (cycleStart && cycleEnd) {
    return countZaloSentInCycle(billingUserId, cycleStart, cycleEnd, queryable);
  }
  return cached(`${billingUserId}:zalo_month`, async () => {
    const { rows } = await queryable.query(
      `SELECT (
         (SELECT COUNT(*) FROM zalo_messages zm
          JOIN campaigns c ON c.id = zm.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND zm.tracking_metadata->>'status' = 'sent'
            AND zm.sent_at >= DATE_TRUNC('month', NOW()))
       + (SELECT COUNT(*) FROM zalo_personal_messages zpm
          WHERE ${ZPM_OWNER_PREDICATE}
            AND zpm.role = 'agent'
            AND zpm.metadata->>'source' = 'manual_inbox'
            AND zpm.created_at >= DATE_TRUNC('month', NOW()))
       + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
          WHERE ul.id_user = $1
            AND ul.resource_type = 'zalo_direct_send'
            AND ul.created_at >= DATE_TRUNC('month', NOW()))
       )::int AS total`,
      [billingUserId]
    );
    return toCount(rows[0]?.total);
  });
}

/**
 * Tổng email + zalo campaign + inbox manual trong chu kỳ billing [cycleStart, cycleEnd).
 */
export async function countCombinedSentInCycle(billingUserId, cycleStart, cycleEnd) {
  const startIso = cycleStart instanceof Date ? cycleStart.toISOString() : String(cycleStart);
  const endIso = cycleEnd instanceof Date ? cycleEnd.toISOString() : String(cycleEnd);
  return cached(`${billingUserId}:combined:${startIso}:${endIso}`, async () => {
    const { rows } = await db.query(
      `SELECT (
         (SELECT COUNT(*) FROM email_messages em
          JOIN campaigns c ON c.id = em.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND em.sent_at >= $2 AND em.sent_at < $3)
       + (SELECT COUNT(*) FROM zalo_messages zm
          JOIN campaigns c ON c.id = zm.id_campaign
          WHERE ${CAMPAIGN_OWNER_PREDICATE}
            AND zm.tracking_metadata->>'status' = 'sent'
            AND zm.sent_at >= $2 AND zm.sent_at < $3)
       + (SELECT COUNT(*) FROM zalo_personal_messages zpm
          WHERE ${ZPM_OWNER_PREDICATE}
            AND zpm.role = 'agent'
            AND zpm.metadata->>'source' = 'manual_inbox'
            AND zpm.created_at >= $2 AND zpm.created_at < $3)
       + (SELECT COALESCE(SUM(ul.delta), 0) FROM usage_logs ul
          WHERE ul.id_user = $1
            AND ul.resource_type IN ('email_direct_send', 'zalo_direct_send')
            AND ul.created_at >= $2 AND ul.created_at < $3)
       )::int AS total`,
      [billingUserId, startIso, endIso]
    );
    return toCount(rows[0]?.total);
  });
}

const okResult = (billingUserId = null) => ({
  allowed: true,
  limitType: null,
  limit: null,
  currentCount: 0,
  resetAt: null,
  message: null,
  billingUserId,
});

const denyResult = ({
  limitType,
  limit,
  currentCount,
  resetAt,
  message,
  billingUserId,
}) => ({
  allowed: false,
  limitType,
  limit,
  currentCount,
  resetAt,
  message,
  billingUserId,
});

/**
 * Entry point hợp nhất kiểm tra hạn mức gửi.
 *
 * @param {{ userId: number|string, channel: 'email'|'zalo', roleCode?: string, ownerContextId?: number|string|null, requiredCount?: number }} input
 * @returns {Promise<{allowed: boolean, limitType: null|string, limit: number|null, currentCount: number, resetAt: Date|null, message: string|null, billingUserId: *}>}
 */
export async function checkSendQuota({
  userId,
  channel,
  roleCode,
  ownerContextId,
  requiredCount = 1,
} = {}) {
  if (isAdminRole(roleCode)) {
    return okResult(null);
  }

  // Cache cùng TTL với các COUNT — resolveBillingUserId/subscription/cycle đều
  // là query lặp lại y hệt trên hot path gửi từng recipient.
  const billingUserId = await cached(
    `resolve:${userId}:${ownerContextId ?? ''}`,
    () => resolveBillingUserId(userId, { ownerContextId })
  );
  if (!billingUserId) {
    return okResult(null);
  }

  const subscription = await cached(
    `${billingUserId}:subscription`,
    () => getSubscriptionStatus(billingUserId)
  );
  if (subscription.hasPlan && subscription.isExpired) {
    return denyResult({
      limitType: 'expired',
      limit: null,
      currentCount: 0,
      resetAt: null,
      message: SUBSCRIPTION_EXPIRED_MSG,
      billingUserId,
    });
  }

  const limits = await getUserPlanSendLimits(billingUserId);
  if (!limits) {
    // Không có plan join được → không cho gửi (defense-in-depth sau requireActivePlan).
    return denyResult({
      limitType: 'no_plan',
      limit: null,
      currentCount: 0,
      resetAt: null,
      message: NO_PLAN_MSG,
      billingUserId,
    });
  }

  const isEmail = channel === 'email';
  const requestedCount = Math.max(1, Number.parseInt(requiredCount, 10) || 1);
  const dailyLimit = toInt(isEmail ? limits.daily_email_limit : limits.daily_zalo_limit);
  const monthlyLimit = toInt(isEmail ? limits.monthly_email_limit : limits.monthly_zalo_limit);
  const channelLabel = isEmail ? 'email' : 'Zalo';
  const unitLabel = isEmail ? 'email' : 'tin';

  if (dailyLimit !== null) {
    if (dailyLimit === 0) {
      return denyResult({
        limitType: 'disabled',
        limit: 0,
        currentCount: 0,
        resetAt: null,
        message: `Tính năng gửi ${channelLabel} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.`,
        billingUserId,
      });
    }
    const count = isEmail
      ? await countEmailSentToday(billingUserId)
      : await countZaloSentToday(billingUserId);
    if (count + requestedCount > dailyLimit) {
      return denyResult({
        limitType: 'daily',
        limit: dailyLimit,
        currentCount: count,
        resetAt: nextVnMidnight(),
        message: `Đã đạt giới hạn gửi ${channelLabel} trong ngày (${count}/${dailyLimit} ${unitLabel}). Hạn mức sẽ reset vào 00:00 ngày mai.`,
        billingUserId,
      });
    }
  }

  if (monthlyLimit !== null) {
    if (monthlyLimit === 0) {
      return denyResult({
        limitType: 'disabled',
        limit: 0,
        currentCount: 0,
        resetAt: null,
        message: `Tính năng gửi ${channelLabel} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.`,
        billingUserId,
      });
    }
    const cycle = await cached(
      `${billingUserId}:cycle`,
      () => getBillingCycle(billingUserId)
    );
    const cycleStart = cycle?.hasPlan ? cycle.cycleStart : null;
    const cycleEnd = cycle?.hasPlan ? cycle.cycleEnd : null;

    const count = isEmail
      ? await countEmailSentThisMonth(billingUserId, cycleStart, cycleEnd)
      : await countZaloSentThisMonth(billingUserId, cycleStart, cycleEnd);
    if (count + requestedCount > monthlyLimit) {
      // Hết hạn mức gói — còn ví thì vẫn cho gửi (trừ lúc ghi tin). Đọc ví không qua cache.
      const walletItemKey = WALLET_ITEM_BY_CHANNEL[isEmail ? 'email' : 'zalo'];
      const coveredByPlan = Math.max(0, monthlyLimit - count);
      const requiredTopup = Math.max(0, requestedCount - coveredByPlan);
      const wallet = walletItemKey
        ? await getWalletSnapshot(billingUserId, walletItemKey, db)
        : null;
      const walletOk = Boolean(wallet && wallet.remaining >= requiredTopup);
      if (!walletOk) {
        return denyResult({
          limitType: 'monthly',
          limit: monthlyLimit,
          currentCount: count,
          resetAt: cycleEnd instanceof Date ? cycleEnd : (cycleEnd ? new Date(cycleEnd) : nextVnMonthStart()),
          message: `Đã đạt giới hạn gửi ${channelLabel} trong tháng (${count}/${monthlyLimit} ${unitLabel}). Vui lòng mua thêm hoặc liên hệ admin để nâng gói.`,
          billingUserId,
        });
      }
    }
  }

  const periodLimit = toInt(limits.messages_per_period);
  if (periodLimit !== null) {
    if (periodLimit === 0) {
      return denyResult({
        limitType: 'disabled',
        limit: 0,
        currentCount: 0,
        resetAt: null,
        message: 'Tính năng gửi tin nhắn không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.',
        billingUserId,
      });
    }
    const cycle = await cached(
      `${billingUserId}:cycle`,
      () => getBillingCycle(billingUserId)
    );
    if (cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd) {
      const count = await countCombinedSentInCycle(billingUserId, cycle.cycleStart, cycle.cycleEnd);
      if (count + requestedCount > periodLimit) {
        return denyResult({
          limitType: 'period',
          limit: periodLimit,
          currentCount: count,
          resetAt: cycle.cycleEnd instanceof Date ? cycle.cycleEnd : new Date(cycle.cycleEnd),
          message: PERIOD_LIMIT_MSG(count, periodLimit),
          billingUserId,
        });
      }
    }
  }

  return okResult(billingUserId);
}

/**
 * Persist direct/preview sends so future quota checks and top-up debits include
 * them. The external provider has already accepted the send when this runs.
 */
export async function recordDirectSendUsage({
  billingUserId,
  channel,
  amount = 1,
  actorUserId = null,
  source,
} = {}) {
  const quantity = Math.max(1, Number.parseInt(amount, 10) || 1);
  if (!billingUserId || !['email', 'zalo'].includes(channel)) return null;

  const resourceType = channel === 'email' ? 'email_direct_send' : 'zalo_direct_send';
  const walletItemKey = WALLET_ITEM_BY_CHANNEL[channel];
  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    const record = await usageTrackingRepository.trackUsage(
      billingUserId,
      resourceType,
      quantity,
      { actorUserId, source: source || 'direct_send' },
      client
    );

    // The preceding preflight populated cached counts. Clear them before the
    // post-send count that determines whether this send consumes top-up credit.
    _clearQuotaCache();
    const limits = await getUserPlanSendLimits(billingUserId);
    const cycle = await getBillingCycle(billingUserId, {}, client);
    const cycleStart = cycle?.hasPlan ? cycle.cycleStart : null;
    const cycleEnd = cycle?.hasPlan ? cycle.cycleEnd : null;
    const usageAfter = channel === 'email'
      ? await countEmailSentThisMonth(billingUserId, cycleStart, cycleEnd, client)
      : await countZaloSentThisMonth(billingUserId, cycleStart, cycleEnd, client);
    const planLimit = toInt(channel === 'email' ? limits?.monthly_email_limit : limits?.monthly_zalo_limit);
    const usageBefore = Math.max(0, usageAfter - quantity);
    const coveredByPlan = planLimit === null ? quantity : Math.max(0, planLimit - usageBefore);
    const debitQuantity = Math.max(0, quantity - coveredByPlan);

    if (debitQuantity > 0 && planLimit !== null) {
      await maybeDebitWalletForSend(client, {
        billingUserId,
        itemKey: walletItemKey,
        sourceKey: `usage_log:${record.id}`,
        planLimit,
        usageCountAfterSend: usageAfter,
        qty: debitQuantity,
      });
    }

    await client.query('COMMIT');
    _clearQuotaCache();
    return record;
  } catch (error) {
    await client.query('ROLLBACK');
    _clearQuotaCache();
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Wrapper mỏng — giữ shape cũ + thêm resetAt/limitType.
 * @param {{ userId: number|string, roleCode?: string, ownerContextId?: * }} input
 */
export async function checkUserEmailSendLimit({ userId, roleCode, ownerContextId } = {}) {
  const quota = await checkSendQuota({
    userId,
    channel: 'email',
    roleCode,
    ownerContextId,
  });
  return {
    allowed: quota.allowed,
    limit: quota.limit,
    currentCount: quota.currentCount,
    period: quota.limitType === 'daily' || quota.limitType === 'monthly' ? quota.limitType : null,
    message: quota.message,
    resetAt: quota.resetAt,
    limitType: quota.limitType,
  };
}

/**
 * Wrapper mỏng — giữ shape cũ + thêm resetAt/limitType.
 * @param {{ userId: number|string, roleCode?: string, ownerContextId?: * }} input
 */
export async function checkUserZaloSendLimit({ userId, roleCode, ownerContextId } = {}) {
  const quota = await checkSendQuota({
    userId,
    channel: 'zalo',
    roleCode,
    ownerContextId,
  });
  return {
    allowed: quota.allowed,
    limit: quota.limit,
    currentCount: quota.currentCount,
    period: quota.limitType === 'daily' || quota.limitType === 'monthly' ? quota.limitType : null,
    message: quota.message,
    resetAt: quota.resetAt,
    limitType: quota.limitType,
  };
}
