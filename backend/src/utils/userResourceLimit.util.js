import db from '../config/database.js';
import { isAdminRole } from './roleScope.util.js';
import { sumActiveTopupGrants } from '../repositories/payment/topup.repository.js';
import { TOPUP_GRANT_KEY_BY_RESOURCE } from './topupPricing.util.js';
import { resolveCampaignTypeLimitKey } from './campaignTypeInference.util.js';

/**
 * ĐỊNH NGHĨA "CHIẾM SUẤT CHIẾN DỊCH" (23/10/2026, PLAN_MOT_NUT_GUI) — MỘT chỗ, dùng chung cho bốn khoá chiến dịch
 * (`campaigns`, `zaloCampaigns`, `zaloGroupCampaigns`, `emailCampaigns`) ở cổng tạo, cổng kích hoạt lại, và màn mức dùng.
 *
 * Một chiến dịch chiếm suất khi (a) chưa có lượt chạy nào, HOẶC (b) đang có lượt `status = 'running'`, HOẶC
 * (c) có lịch `enabled = TRUE`. Chiến dịch đã chạy xong (completed/failed/stopped, không lịch bật) thì TRẢ suất.
 *
 * Về (b): `campaign_runs.status` chỉ nhận running/completed/failed/stopped (CHECK ở schema) — không có trạng thái
 * "đang chờ/xếp hàng/tạm dừng" nào khác chưa kết thúc. Lượt continuous còn người đến hạn gửi giữ `running`
 * (`finalizeRun` đặt lại `running`), nên đã nằm trong (b).
 * Chỉ mục có sẵn: idx_campaign_runs_campaign, idx_campaign_schedules_campaign.
 *
 * `c` là bí danh bảng `campaigns` của câu truy vấn gọi.
 */
const CAMPAIGN_OCCUPIES_SLOT_SQL = `(
  NOT EXISTS (SELECT 1 FROM campaign_runs cr_any WHERE cr_any.id_campaign = c.id)
  OR EXISTS (SELECT 1 FROM campaign_runs cr_run WHERE cr_run.id_campaign = c.id AND cr_run.status = 'running')
  OR EXISTS (SELECT 1 FROM campaign_schedules cs_on WHERE cs_on.id_campaign = c.id AND cs_on.enabled = TRUE)
)`;

const RESOURCE_LIMIT_MAP = {
  campaigns: {
    column: 'max_campaigns',
    table: 'campaigns',
    occupiesSlot: true,
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
    label: 'số chiến dịch',
  },
  zaloCampaigns: {
    column: 'max_zalo_campaigns',
    table: null,
    label: 'số chiến dịch Zalo cá nhân',
    occupiesSlot: true,
    campaignType: 'zalo',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
  },
  zaloGroupCampaigns: {
    column: 'max_zalo_group_campaigns',
    table: null,
    label: 'số chiến dịch Zalo nhóm',
    occupiesSlot: true,
    campaignType: 'zalo_group',
    ownerExpression: 'COALESCE(workspace_owner_id, id_user)',
  },
  emailCampaigns: {
    column: 'max_email_campaigns',
    table: null,
    label: 'số chiến dịch Email',
    occupiesSlot: true,
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

function buildLimitExceededMessage(resourceConfig, normalizedLimit, { adding = 1, currentCount = null } = {}) {
  if (normalizedLimit === 0) {
    return `Tính năng ${resourceConfig.label} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng cấp gói.`;
  }
  if (adding > 1 && Number.isFinite(currentCount)) {
    // Tạo nhiều bản ghi một lượt (vd mua chiến dịch Marketplace kèm nhiều mẫu): nói rõ cần bao nhiêu, còn chỗ bao nhiêu.
    const remaining = Math.max(0, normalizedLimit - currentCount);
    return `Thao tác này cần tạo thêm ${adding} ${resourceConfig.label} nhưng gói chỉ còn chỗ cho ${remaining} (giới hạn ${normalizedLimit}, đang có ${currentCount}). Vui lòng xoá bớt hoặc liên hệ admin để nâng giới hạn.`;
  }
  if (resourceConfig.occupiesSlot) {
    // Suất chiến dịch "chạy xong thì trả": nói rõ cách giải phóng thay vì chỉ bảo liên hệ admin.
    const used = Number.isFinite(currentCount) ? `, đang dùng ${currentCount}` : '';
    return `Tài khoản đã đạt giới hạn ${resourceConfig.label} (${normalizedLimit}${used}). Chiến dịch đã chạy xong không tính vào suất. Chờ một chiến dịch chạy xong, tắt lịch hẹn, xoá bản nháp chưa dùng, hoặc nâng gói.`;
  }
  return `Tài khoản đã đạt giới hạn ${resourceConfig.label} (${normalizedLimit}). Vui lòng liên hệ admin để nâng giới hạn.`;
}

/** Số bản ghi sắp tạo: số nguyên ≥ 1 (mặc định 1). */
function normalizeAdding(adding) {
  const n = Math.floor(Number(adding));
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
 * Đếm tài nguyên của chủ. Bốn khoá chiến dịch (`occupiesSlot`) chỉ đếm chiến dịch ĐANG CHIẾM SUẤT — xem
 * CAMPAIGN_OCCUPIES_SLOT_SQL: chưa chạy lần nào, hoặc đang có lượt `running`, hoặc có lịch bật. Chiến dịch đã chạy
 * xong không tính. Các tài nguyên khác đếm mọi dòng như cũ.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} userId
 * @param {object} resourceConfig
 * @param {{ excludeCampaignId?: number|string|null }} [options] bỏ một chiến dịch khỏi phép đếm (cổng kích hoạt lại)
 */
async function countResourceForUser(queryable, userId, resourceConfig, { excludeCampaignId = null } = {}) {
  let countResult;
  if (resourceConfig.occupiesSlot) {
    const ownerExpression = (resourceConfig.ownerExpression || 'id_user')
      .replace(/\bworkspace_owner_id\b/g, 'c.workspace_owner_id')
      .replace(/\bid_user\b/g, 'c.id_user');
    const params = [userId];
    let where = `${ownerExpression} = $1 AND ${CAMPAIGN_OCCUPIES_SLOT_SQL}`;
    if (resourceConfig.campaignType) {
      params.push(resourceConfig.campaignType);
      where += ` AND c.campaign_type = $${params.length}`;
    }
    if (excludeCampaignId !== null && excludeCampaignId !== undefined) {
      params.push(excludeCampaignId);
      where += ` AND c.id <> $${params.length}`;
    }
    countResult = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM campaigns c
       WHERE ${where}`,
      params
    );
  } else if (resourceConfig.campaignType) {
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
 * @param {{ userId: number|string, roleCode?: string, resourceKey: keyof typeof RESOURCE_LIMIT_MAP, adding?: number }} input
 *   `adding`: số bản ghi SẮP tạo trong cùng transaction (mặc định 1). Mua chiến dịch Marketplace tạo nhiều bản sao mẫu một lượt nên truyền số mẫu.
 */
export async function enforceResourceLimitTx(client, input) {
  const { userId, roleCode, resourceKey } = input || {};
  const adding = normalizeAdding(input?.adding);
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
  if (currentCount + adding > normalizedLimit) {
    throw createResourceLimitExceededError(
      buildLimitExceededMessage(resourceConfig, normalizedLimit, { adding, currentCount }),
      resourceKey
    );
  }
}

/**
 * Chiến dịch này đang chiếm suất không (cùng định nghĩa CAMPAIGN_OCCUPIES_SLOT_SQL).
 * @returns {Promise<{ found: boolean, occupies: boolean, campaignType: string|null }>}
 */
async function readCampaignOccupancy(queryable, campaignId) {
  const result = await queryable.query(
    `SELECT c.campaign_type, ${CAMPAIGN_OCCUPIES_SLOT_SQL} AS occupies
     FROM campaigns c
     WHERE c.id = $1`,
    [campaignId]
  );
  const row = result.rows[0];
  if (!row) return { found: false, occupies: false, campaignType: null };
  return { found: true, occupies: row.occupies === true, campaignType: row.campaign_type ?? null };
}

/**
 * CỔNG KÍCH HOẠT LẠI suất chiến dịch (PLAN_MOT_NUT_GUI PR-1). Chiến dịch đã chạy xong KHÔNG chiếm suất; khi NGƯỜI DÙNG
 * làm nó chiếm suất trở lại (Chạy ngay, chạy tiếp lượt continuous, duyệt chiến dịch chờ duyệt, tạo/bật lại lịch) thì
 * phải còn chỗ: `số đang chiếm (không tính chính nó) + 1 ≤ trần`, cho cả khoá chung `campaigns` lẫn khoá theo loại.
 *
 * - Chiến dịch ĐANG chiếm suất (chưa chạy lần nào, đang chạy, hoặc có lịch bật) → không chặn: đã được tính rồi.
 * - Phải gọi sau BEGIN trên cùng client và việc tạo run / ghi lịch phải nằm trong CÙNG transaction: advisory lock
 *   (cùng khoá với `enforceResourceLimitTx`, lấy theo thứ tự campaigns → khoá loại, giống cổng tạo) giữ tới COMMIT nên
 *   hai thao tác song song không cùng lọt qua trần.
 * - CHỈ đặt ở thao tác người dùng. KHÔNG gọi từ scheduler / worker liên tục / khởi động lại sau deploy: lượt hẹn giờ đã qua
 *   cổng lúc tạo/bật lịch; lúc cron bắn, lịch có thể đã tắt trong DB (cron trong bộ nhớ chỉ nạp lại theo chu kỳ) nên chiến
 *   dịch trông như không chiếm suất — chặn ở đó là chặn oan lịch khách đã đặt hợp lệ.
 * - Admin bỏ qua như cổng cũ.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ userId: number|string, roleCode?: string, campaignId: number|string }} input `userId` = chủ workspace (billing)
 * @throws {Error} RESOURCE_LIMIT_EXCEEDED (400, limitReached) khi hết suất
 */
export async function enforceCampaignSlotOnActivationTx(client, input) {
  const { userId, roleCode, campaignId } = input || {};
  if (isAdminRole(roleCode)) return;

  // Khoá trước, đọc sau: hai request song song kích hoạt hai chiến dịch khác nhau phải xếp hàng ở đây.
  await acquireResourceLimitLock(client, userId, 'campaigns');
  const occupancy = await readCampaignOccupancy(client, campaignId);
  if (!occupancy.found || occupancy.occupies) return;
  const typeResourceKey = resolveCampaignTypeLimitKey(occupancy.campaignType);
  if (typeResourceKey) await acquireResourceLimitLock(client, userId, typeResourceKey);

  const userLimitRow = await getUserLimitRow(client, userId);
  for (const resourceKey of ['campaigns', typeResourceKey].filter(Boolean)) {
    const resourceConfig = resolveResourceConfig(resourceKey);
    const baseLimit = normalizeLimitValue(userLimitRow?.[resourceConfig.column] ?? null);
    const normalizedLimit = await resolveEffectiveLimit(client, userId, resourceKey, baseLimit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit === null) continue;
    if (normalizedLimit === 0) {
      throw createResourceLimitExceededError(buildLimitExceededMessage(resourceConfig, 0), resourceKey);
    }
    const currentCount = await countResourceForUser(client, userId, resourceConfig, { excludeCampaignId: campaignId });
    if (currentCount + 1 > normalizedLimit) {
      throw createResourceLimitExceededError(
        buildLimitExceededMessage(resourceConfig, normalizedLimit, { adding: 1, currentCount }),
        resourceKey
      );
    }
  }
}

/**
 * Kiểm tra user có vượt giới hạn tạo tài nguyên hay chưa (fast-path, không atomic).
 *
 * @param {{ userId: number|string, roleCode?: string, resourceKey: keyof typeof RESOURCE_LIMIT_MAP, adding?: number }} input
 *   `adding`: số bản ghi SẮP tạo (mặc định 1); cho phép khi `đang có + adding ≤ trần`.
 * @returns {Promise<{allowed: boolean, limit: number|null, currentCount: number, message: string|null}>}
 */
export async function checkUserResourceLimit(input) {
  const { userId, roleCode, resourceKey } = input || {};
  const adding = normalizeAdding(input?.adding);
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
  const isAllowed = currentCount + adding <= normalizedLimit;

  return {
    allowed: isAllowed,
    limit: normalizedLimit,
    currentCount,
    message: isAllowed ? null : buildLimitExceededMessage(resourceConfig, normalizedLimit, { adding, currentCount }),
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
 * - `used` của bốn khoá chiến dịch (`campaigns`, `zaloCampaigns`, `zaloGroupCampaigns`, `emailCampaigns`) = số chiến
 *   dịch ĐANG CHIẾM SUẤT (chưa chạy lần nào, hoặc đang có lượt `running`, hoặc có lịch bật) — "chạy xong thì trả suất",
 *   định nghĩa ở CAMPAIGN_OCCUPIES_SLOT_SQL, cùng một phép đếm với cổng tạo và cổng kích hoạt lại.
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
