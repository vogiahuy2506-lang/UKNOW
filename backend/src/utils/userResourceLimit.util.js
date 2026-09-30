import db from '../config/database.js';
import { isAdminRole } from './roleScope.util.js';
import { sumActiveTopupGrants } from '../repositories/payment/topup.repository.js';
import { TOPUP_GRANT_KEY_BY_RESOURCE } from './topupPricing.util.js';

const RESOURCE_LIMIT_MAP = {
  campaigns: {
    column: 'max_campaigns',
    table: 'campaigns',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
    label: 'số chiến dịch',
  },
  zaloCampaigns: {
    column: 'max_zalo_campaigns',
    table: null,
    label: 'số chiến dịch Zalo cá nhân',
    campaignType: 'zalo',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
  },
  zaloGroupCampaigns: {
    column: 'max_zalo_group_campaigns',
    table: null,
    label: 'số chiến dịch Zalo nhóm',
    campaignType: 'zalo_group',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
  },
  emailCampaigns: {
    column: 'max_email_campaigns',
    table: null,
    label: 'số chiến dịch Email',
    campaignType: 'email',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
  },
  zaloAccounts: {
    column: 'max_zalo_accounts',
    table: 'zalo_settings',
    label: 'số tài khoản Zalo quản lý',
  },
  whatsappAccounts: {
    column: 'max_whatsapp_accounts',
    table: 'whatsapp_baileys_session_creds',
    // Phiên WhatsApp không có cột id_user — chủ nằm trong session_key = "<userId>-<shortKey>".
    ownerExpression: "split_part(session_key, '-', 1)::bigint",
    label: 'số tài khoản WhatsApp',
  },
  telegramAccounts: {
    column: 'max_telegram_accounts',
    table: 'telegram_accounts',
    label: 'số tài khoản Telegram',
  },

  emailAccounts: {
    column: 'max_email_accounts',
    table: 'email_settings',
    label: 'số tài khoản Email quản lý',
  },
  emailTemplates: {
    column: 'max_email_templates',
    table: 'email_templates',
    label: 'số Email template',
  },
  zaloTemplates: {
    column: 'max_zalo_templates',
    table: 'zalo_templates',
    label: 'số Zalo template',
  },
  landingPages: {
    column: 'max_landing_pages',
    table: 'landing_pages',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
    label: 'số landing page',
  },
  // KHÔNG có mục `chatbots` ở đây (gỡ 30/09/2026): mục cũ đọc cột `users.max_chatbots` không tồn tại (trần luôn
  // null = không giới hạn), đếm cả chatbot đã xoá mềm và không cộng slot mua thêm → clone/mua Marketplace lọt trần.
  // Trần chatbot đi qua services/ai/chatbotSlot.service.js (assertChatbotSlotAvailable), dùng chung cổng tạo.
};

const isMissingLimitColumnsError = (error) => error?.code === '42703';

function resolveResourceConfig(resourceKey) {
  const resourceConfig = RESOURCE_LIMIT_MAP[resourceKey];
  if (!resourceConfig) {
    throw new Error(`Resource key không hợp lệ: ${resourceKey}`);
  }
  return resourceConfig;
}

function normalizeLimitValue(rawValue) {
  const normalized = Number.isFinite(Number(rawValue))
    ? Number.parseInt(rawValue, 10)
    : null;
  return Number.isFinite(normalized) ? normalized : null;
}

async function resolveEffectiveLimit(queryable, userId, resourceKey, baseLimit) {
  if (!Number.isFinite(baseLimit) || baseLimit === null) return baseLimit;
  const grantKey = TOPUP_GRANT_KEY_BY_RESOURCE[resourceKey];
  if (!grantKey) return baseLimit;
  const grants = await sumActiveTopupGrants(userId, grantKey, queryable);
  return baseLimit + Math.max(0, Number(grants) || 0);
}

function buildLimitExceededMessage(resourceConfig, normalizedLimit) {
  if (normalizedLimit === 0) {
    return `Tính năng ${resourceConfig.label} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng cấp gói.`;
  }
  return `Tài khoản đã đạt giới hạn ${resourceConfig.label} (${normalizedLimit}). Vui lòng liên hệ admin để nâng giới hạn.`;
}

export function createResourceLimitExceededError(message, resourceKey) {
  const err = new Error(message);
  // 400 + limitReached để nhất quán với contract cũ (checkUserResourceLimit) và
  // các flow tạo tài nguyên khác (campaign/email setting...). Tránh đổi status (403)
  // làm vỡ test/contract khi atomic-enforce thay cho check-then-act.
  err.statusCode = 400;
  err.code = 'RESOURCE_LIMIT_EXCEEDED';
  err.resource = resourceKey;
  err.limitReached = true;
  return err;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} userId
 */
async function getUserLimitRow(queryable, userId) {
  try {
    const result = await queryable.query(
      `SELECT
         max_campaigns,
         max_zalo_campaigns,
         max_zalo_group_campaigns,
         max_email_campaigns,
         max_zalo_accounts,
         max_whatsapp_accounts,
         max_telegram_accounts,
         max_email_accounts,
         max_email_templates,
         max_zalo_templates,
         max_landing_pages
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (isMissingLimitColumnsError(error)) return null;
    throw error;
  }
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} userId
 * @param {object} resourceConfig
 */
async function countResourceForUser(queryable, userId, resourceConfig) {
  let countResult;
  if (resourceConfig.campaignType) {
    countResult = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM campaigns
       WHERE ${resourceConfig.ownerExpression || 'id_user'} = $1 AND campaign_type = $2`,
      [userId, resourceConfig.campaignType]
    );
  } else {
    countResult = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM ${resourceConfig.table}
       WHERE ${resourceConfig.ownerExpression || 'id_user'} = $1`,
      [userId]
    );
  }
  return Number.parseInt(countResult.rows[0]?.total || 0, 10);
}

async function acquireResourceLimitLock(client, userId, resourceKey) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
    [`user:${userId}`, String(resourceKey)]
  );
}

/**
 * Enforce giới hạn tài nguyên trong transaction (advisory lock + re-count).
 * Phải gọi sau BEGIN trên cùng client; insert phải nằm trong cùng tx.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ userId: number|string, roleCode?: string, resourceKey: keyof typeof RESOURCE_LIMIT_MAP }} input
 */
export async function enforceResourceLimitTx(client, input) {
  const { userId, roleCode, resourceKey } = input || {};
  const resourceConfig = resolveResourceConfig(resourceKey);

  if (isAdminRole(roleCode)) return;

  await acquireResourceLimitLock(client, userId, resourceKey);

  const userLimitRow = await getUserLimitRow(client, userId);
  const baseLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);
  const normalizedLimit = await resolveEffectiveLimit(client, userId, resourceKey, baseLimit);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit === null) return;

  if (normalizedLimit === 0) {
    throw createResourceLimitExceededError(
      buildLimitExceededMessage(resourceConfig, 0),
      resourceKey
    );
  }

  const currentCount = await countResourceForUser(client, userId, resourceConfig);
  if (currentCount >= normalizedLimit) {
    throw createResourceLimitExceededError(
      buildLimitExceededMessage(resourceConfig, normalizedLimit),
      resourceKey
    );
  }
}

/**
 * Kiểm tra user có vượt giới hạn tạo tài nguyên hay chưa (fast-path, không atomic).
 *
 * @param {{ userId: number|string, roleCode?: string, resourceKey: keyof typeof RESOURCE_LIMIT_MAP }} input
 * @returns {Promise<{allowed: boolean, limit: number|null, currentCount: number, message: string|null}>}
 */
export async function checkUserResourceLimit(input) {
  const { userId, roleCode, resourceKey } = input || {};
  const resourceConfig = resolveResourceConfig(resourceKey);

  if (isAdminRole(roleCode)) {
    return {
      allowed: true,
      limit: null,
      currentCount: 0,
      message: null,
    };
  }

  const userLimitRow = await getUserLimitRow(db, userId);
  const baseLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);
  const normalizedLimit = await resolveEffectiveLimit(db, userId, resourceKey, baseLimit);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit === null) {
    return {
      allowed: true,
      limit: null,
      currentCount: 0,
      message: null,
    };
  }

  if (normalizedLimit === 0) {
    return {
      allowed: false,
      limit: 0,
      currentCount: 0,
      message: buildLimitExceededMessage(resourceConfig, 0),
    };
  }

  const currentCount = await countResourceForUser(db, userId, resourceConfig);
  const isAllowed = currentCount < normalizedLimit;

  return {
    allowed: isAllowed,
    limit: normalizedLimit,
    currentCount,
    message: isAllowed ? null : buildLimitExceededMessage(resourceConfig, normalizedLimit),
  };
}

/**
 * ĐỌC-KHÔNG-KHOÁ "đã dùng / trần" của các tài nguyên trong RESOURCE_LIMIT_MAP, cho trang Thanh toán
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3). Số khách thấy phải BẰNG số cổng tạo mới dùng để chặn, nên hàm
 * này gọi ĐÚNG các hàm của cổng: `getUserLimitRow` (trần gốc ở cột `users.max_*`) + `resolveEffectiveLimit`
 * (cộng slot mua thêm còn hạn) + `countResourceForUser` (đếm). Khác cổng ở đúng một điểm: KHÔNG lấy advisory
 * lock và KHÔNG ném lỗi khi đạt trần — chỉ trả số.
 *
 * - `limit` = trần hiệu lực (gốc + mua thêm); `null` = không giới hạn (cột NULL: cổng cho tạo không trần);
 *   `0` = gói không hỗ trợ tài nguyên này.
 * - Một tài nguyên lỗi → `null` cho ĐÚNG tài nguyên đó (kèm console.error ghi tên), các tài nguyên khác vẫn có
 *   số. KHÔNG trả 0 giả: trang hiện "—" thay vì "0 / N".
 * - Khoá không có trong RESOURCE_LIMIT_MAP là lỗi lập trình → ném ngay, không nuốt.
 * - KHÔNG dùng cho `chatbots`: bản đồ này không còn mục `chatbots` (30/09/2026) — cổng tạo/clone/Marketplace đi qua
 *   services/ai/chatbotSlot.service.js (đếm dòng `is_active`, trần `plans.max_chatbots` + slot mua thêm); xem
 *   thêm services/user/profileUsage.service.js.
 *
 * @param {number|string} userId chủ tài khoản (billing user)
 * @param {Array<keyof typeof RESOURCE_LIMIT_MAP>} resourceKeys
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<Record<string, {used: number, limit: number|null}|null>>}
 */
export async function getResourceUsageSnapshot(userId, resourceKeys, queryable = db) {
  const configs = resourceKeys.map((resourceKey) => [resourceKey, resolveResourceConfig(resourceKey)]);

  // Trần gốc nằm ở MỘT hàng `users` — đọc một lần cho mọi khoá (cổng cũng đọc đúng hàng này).
  let userLimitRow = null;
  let limitRowError = null;
  try {
    userLimitRow = await getUserLimitRow(queryable, userId);
  } catch (error) {
    limitRowError = error;
  }

  const snapshot = {};
  await Promise.all(configs.map(async ([resourceKey, resourceConfig]) => {
    try {
      if (limitRowError) throw limitRowError;
      const baseLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);
      const effectiveLimit = await resolveEffectiveLimit(queryable, userId, resourceKey, baseLimit);
      const used = await countResourceForUser(queryable, userId, resourceConfig);
      snapshot[resourceKey] = {
        used,
        limit: Number.isFinite(effectiveLimit) ? effectiveLimit : null,
      };
    } catch (error) {
      console.error('[ResourceUsage] đồng hồ lỗi, trả null', { resource: resourceKey, userId, message: error?.message });
      snapshot[resourceKey] = null;
    }
  }));
  return snapshot;
}
