/**
 * P9 (PLAN_TG_WA_DAY_DU mục 16) — quyền dùng kênh Telegram/WhatsApp THEO GÓI của chủ workspace.
 *
 * "Có quyền" = trần số tài khoản kênh (tính cả slot mua lẻ, `resolveEffectiveLimit`) là `null` (không giới hạn) hoặc
 * `> 0`. Trần `0` (gói tuỳ chỉnh để 0, gói hết hạn -> `expireUserPlan` ghi 0) = không có kênh. Admin luôn có.
 *
 * BẪY: dùng `limit`, KHÔNG dùng `allowed` của `checkUserResourceLimit` (allowed=false cũng khi đã DÙNG ĐỦ số tài khoản
 * — lúc đó vẫn có quyền, chỉ hết chỗ kết nối thêm).
 *
 * Fail-open khi đọc trần lỗi (giống `topupLockGate`): đây là chốt doanh thu/giao diện, không phải rào bảo mật; hạn mức
 * tạo tài khoản vẫn chặn ở `enforceResourceLimitTx`.
 */
import db from '../../config/database.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';
import { buildChannelNotInPlanMessage } from './campaignChannelFlags.util.js';

const CHANNEL_RESOURCE_KEY = Object.freeze({
  telegram: 'telegramAccounts',
  whatsapp: 'whatsappAccounts',
  // P12 — tài khoản Zalo CÁ NHÂN (`users.max_zalo_accounts` + slot mua lẻ). Zalo OA (chatbot) là resource khác, không thuộc đây.
  zalo: 'zaloAccounts',
});

export const ENTITLEMENT_CHANNELS = Object.freeze(Object.keys(CHANNEL_RESOURCE_KEY));

export { buildChannelNotInPlanMessage };

/** @param {number|null} limit */
export function limitGrantsChannel(limit) {
  return limit === null || (Number.isFinite(limit) && limit > 0);
}

async function lookupRoleCode(userId) {
  try {
    const result = await db.query('SELECT role FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.role || null;
  } catch (err) {
    console.error('[ChannelEntitlement] role lookup failed:', err.message);
    return null;
  }
}

/**
 * Trần kênh của MỘT chủ workspace.
 * @param {number|string} ownerUserId
 * @param {'telegram'|'whatsapp'|'zalo'} channel
 * @param {string|null} [roleCode] bỏ trống -> tra role của chủ (nhánh chiến dịch chỉ biết id chủ).
 * @returns {Promise<{entitled: boolean, limit: number|null}>}
 */
export async function getChannelLimitForOwner(ownerUserId, channel, roleCode) {
  const resourceKey = CHANNEL_RESOURCE_KEY[channel];
  if (!resourceKey) return { entitled: true, limit: null };
  try {
    const role = roleCode === undefined ? await lookupRoleCode(ownerUserId) : roleCode;
    const result = await checkUserResourceLimit({ userId: ownerUserId, roleCode: role, resourceKey });
    const limit = result?.limit ?? null;
    return { entitled: limitGrantsChannel(limit), limit };
  } catch (err) {
    console.error(`[ChannelEntitlement] ${channel} limit read failed (fail-open):`, err.message);
    return { entitled: true, limit: null };
  }
}

/**
 * @param {object} authUser `req.user`
 * @returns {Promise<{telegram: boolean, whatsapp: boolean, zalo: boolean, limits: {telegram: number|null, whatsapp: number|null, zalo: number|null}}>}
 */
export async function getChannelEntitlements(authUser) {
  const { workspaceOwnerId, contextType, roleCode } = getWorkspaceContext(authUser);
  // Nhân viên: role của CHÍNH nhân viên không nói gì về chủ -> để trống cho hàm tự tra role chủ.
  const ownerRole = contextType === 'self' ? roleCode : undefined;
  const [telegram, whatsapp, zalo] = await Promise.all([
    getChannelLimitForOwner(workspaceOwnerId, 'telegram', ownerRole),
    getChannelLimitForOwner(workspaceOwnerId, 'whatsapp', ownerRole),
    getChannelLimitForOwner(workspaceOwnerId, 'zalo', ownerRole),
  ]);
  return {
    telegram: telegram.entitled,
    whatsapp: whatsapp.entitled,
    zalo: zalo.entitled,
    limits: { telegram: telegram.limit, whatsapp: whatsapp.limit, zalo: zalo.limit },
  };
}

/**
 * Chặn (403 CHANNEL_NOT_IN_PLAN) khi gói của chủ workspace không có kênh.
 * @param {{channel: 'telegram'|'whatsapp'|'zalo', ownerUserId: number|string, roleCode?: string|null}} input
 */
export async function assertChannelEntitled({ channel, ownerUserId, roleCode }) {
  const { entitled } = await getChannelLimitForOwner(ownerUserId, channel, roleCode);
  if (entitled) return;
  const err = new Error(buildChannelNotInPlanMessage(channel));
  err.status = 403;
  err.statusCode = 403;
  err.code = 'CHANNEL_NOT_IN_PLAN';
  throw err;
}

/** Lọc danh sách kênh builder ({key,...}) chỉ giữ kênh có quyền (kênh không thuộc bảng quyền giữ nguyên). */
export function filterChannelsByEntitlement(channels, entitlements) {
  return (channels || []).filter((c) => entitlements?.[c?.key] !== false);
}

export default {
  getChannelEntitlements,
  getChannelLimitForOwner,
  assertChannelEntitled,
  filterChannelsByEntitlement,
  limitGrantsChannel,
};
