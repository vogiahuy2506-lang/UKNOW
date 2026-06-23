import db from '../config/database.js';
import { isAdminRole } from './roleScope.util.js';

const RESOURCE_LIMIT_MAP = {
  campaigns: {
    column: 'max_campaigns',
    table: 'campaigns',
    label: 'số chiến dịch',
  },
  zaloCampaigns: {
    column: 'max_zalo_campaigns',
    table: null,
    label: 'số chiến dịch Zalo cá nhân',
    campaignType: 'zalo',
  },
  zaloGroupCampaigns: {
    column: 'max_zalo_group_campaigns',
    table: null,
    label: 'số chiến dịch Zalo nhóm',
    campaignType: 'zalo_group',
  },
  emailCampaigns: {
    column: 'max_email_campaigns',
    table: null,
    label: 'số chiến dịch Email',
    campaignType: 'email',
  },
  zaloAccounts: {
    column: 'max_zalo_accounts',
    table: 'zalo_settings',
    label: 'số tài khoản Zalo quản lý',
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
    label: 'số landing page',
  },
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
       WHERE id_user = $1 AND campaign_type = $2`,
      [userId, resourceConfig.campaignType]
    );
  } else {
    countResult = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM ${resourceConfig.table}
       WHERE id_user = $1`,
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
  const normalizedLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);

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
  const normalizedLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);

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
