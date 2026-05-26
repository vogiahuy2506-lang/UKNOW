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
    table: null, // đếm theo campaign_type — xử lý riêng
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

/**
 * Đọc giới hạn tài nguyên của user từ bảng users.
 *
 * Luồng hoạt động:
 * 1. Truy vấn đúng 5 cột giới hạn đã migration.
 * 2. Nếu DB chưa chạy migration giới hạn, trả null để hệ thống fallback "không giới hạn".
 * 3. Trả object row để các hàm kiểm tra sử dụng lại.
 *
 * @param {number|string} userId id user cần lấy giới hạn
 * @returns {Promise<Record<string, any>|null>} row users hoặc null khi chưa có cột giới hạn
 */
async function getUserLimitRow(userId) {
  try {
    const result = await db.query(
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
 * Kiểm tra user có vượt giới hạn tạo tài nguyên hay chưa.
 *
 * Luồng hoạt động:
 * 1. Admin luôn bypass giới hạn.
 * 2. Đọc limit từ bảng users; null nghĩa là không giới hạn.
 * 3. Đếm số tài nguyên hiện tại theo `id_user`, nếu count >= limit thì chặn.
 *
 * @param {{ userId: number|string, roleCode?: string, resourceKey: keyof typeof RESOURCE_LIMIT_MAP }} input
 * @returns {Promise<{allowed: boolean, limit: number|null, currentCount: number, message: string|null}>}
 */
export async function checkUserResourceLimit(input) {
  const { userId, roleCode, resourceKey } = input || {};
  const resourceConfig = RESOURCE_LIMIT_MAP[resourceKey];
  if (!resourceConfig) {
    throw new Error(`Resource key không hợp lệ: ${resourceKey}`);
  }

  if (isAdminRole(roleCode)) {
    return {
      allowed: true,
      limit: null,
      currentCount: 0,
      message: null,
    };
  }

  const userLimitRow = await getUserLimitRow(userId);
  const limitRawValue = userLimitRow?.[resourceConfig.column] ?? null;
  const normalizedLimit = Number.isFinite(Number(limitRawValue))
    ? Number.parseInt(limitRawValue, 10)
    : null;

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
      message: `Tính năng ${resourceConfig.label} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.`,
    };
  }

  let countResult;
  if (resourceConfig.campaignType) {
    countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM campaigns
       WHERE id_user = $1 AND campaign_type = $2`,
      [userId, resourceConfig.campaignType]
    );
  } else {
    countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM ${resourceConfig.table}
       WHERE id_user = $1`,
      [userId]
    );
  }
  const currentCount = Number.parseInt(countResult.rows[0]?.total || 0, 10);
  const isAllowed = currentCount < normalizedLimit;

  return {
    allowed: isAllowed,
    limit: normalizedLimit,
    currentCount,
    message: isAllowed
      ? null
      : `Tài khoản đã đạt giới hạn ${resourceConfig.label} (${normalizedLimit}). Vui lòng liên hệ admin để nâng giới hạn.`,
  };
}

