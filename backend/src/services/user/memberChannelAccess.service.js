import {
  findAssignedTelegramAccountRefs,
  findAssignedWhatsAppSessionKeys,
  findAssignedZaloAccountIds,
  listOwnerTelegramAccountsWithAssignment,
  listOwnerWhatsAppSessionsWithAssignment,
  listOwnerZaloAccountsWithAssignment,
  replaceChannelAssignments,
  replaceZaloAccountAssignments,
  TELEGRAM_CHANNEL,
  WHATSAPP_BAILEYS_CHANNEL,
} from '../../repositories/user/memberChannelAccount.repository.js';

/**
 * Một nguồn duy nhất cho câu hỏi "người thao tác này dùng được tài khoản kênh nào?" (PLAN_GIAO_TAI_KHOAN_
 * ZALO_CHO_NHAN_VIEN_2026-10-04). Zalo cá nhân + (PR-H1) Telegram, WhatsApp Baileys — hàm `*Channel*` bên dưới.
 *
 * Quy tắc:
 *  - Chủ (contextType 'self') và super admin thấy TẤT CẢ → trả `null` (= không lọc).
 *  - Nhân viên (contextType 'employee') chỉ thấy tài khoản được giao → trả mảng id (có thể rỗng).
 *  - HỎNG THÌ CHẶN: ngữ cảnh thiếu / đọc bảng giao lỗi → mảng rỗng, KHÔNG BAO GIỜ `null`. Đây là phân quyền;
 *    khác khuôn `topupLockGate` (khuôn đó cố ý cho qua khi lỗi, dùng cho khoá tài nguyên, không phải quyền).
 *
 * `ctx` lấy từ `getWorkspaceContext(req.user)` (utils/workspaceContext.util.js).
 */

export const ZALO_ACCOUNT_NOT_ASSIGNED_CODE = 'ZALO_ACCOUNT_NOT_ASSIGNED';
export const ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE = 'Tài khoản Zalo này chưa được giao cho bạn.';
export const OWNER_ONLY_CODE = 'WORKSPACE_OWNER_ONLY';

/**
 * Người thao tác có bị lọc theo việc giao không (nhân viên, không phải super admin).
 *
 * @param {{ contextType?: string, isSuperAdmin?: boolean }} ctx
 * @returns {boolean}
 */
export function isAssignmentScopedContext(ctx) {
  if (!ctx) return true; // thiếu ngữ cảnh → coi như bị lọc (hỏng thì chặn)
  if (ctx.isSuperAdmin === true) return false;
  return ctx.contextType === 'employee';
}

/**
 * @param {{ actorUserId?: number, workspaceOwnerId?: number, contextType?: string, isSuperAdmin?: boolean }} ctx
 * @returns {Promise<number[]|null>} `null` = thấy tất cả (chủ / super admin); mảng = chỉ các id này (lỗi → `[]`)
 */
export async function getAccessibleZaloAccountIds(ctx) {
  if (!isAssignmentScopedContext(ctx)) return null;
  try {
    const ownerId = Number(ctx?.workspaceOwnerId);
    const employeeId = Number(ctx?.actorUserId);
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return [];
    }
    return await findAssignedZaloAccountIds(ownerId, employeeId);
  } catch (error) {
    console.error('[memberChannelAccess] Không đọc được việc giao tài khoản Zalo — chặn:', error?.message || error);
    return [];
  }
}

/**
 * @param {number|string} accountId
 * @param {number[]|null} accessibleIds kết quả `getAccessibleZaloAccountIds`
 * @returns {boolean}
 */
export function isZaloAccountAccessible(accountId, accessibleIds) {
  if (accessibleIds === null) return true;
  if (!Array.isArray(accessibleIds)) return false;
  const id = Number(accountId);
  return Number.isSafeInteger(id) && accessibleIds.includes(id);
}

/**
 * Bản ĐỒNG BỘ của `assertZaloAccountAccess` cho chỗ đã có sẵn `accessibleIds` (kết quả `getAccessibleZaloAccountIds`):
 * ném 403 `ZALO_ACCOUNT_NOT_ASSIGNED` nếu tài khoản không nằm trong phạm vi. `null` (chủ / super admin) luôn qua; mọi giá trị
 * khác mảng (kể cả `undefined` — chỗ gọi quên truyền) bị chặn.
 *
 * @param {number|string|null|undefined} accountId
 * @param {number[]|null|undefined} accessibleIds
 * @returns {void}
 */
export function assertZaloAccountInScope(accountId, accessibleIds) {
  if (isZaloAccountAccessible(accountId, accessibleIds)) return;
  const error = new Error(ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE);
  error.status = 403;
  error.statusCode = 403;
  error.code = ZALO_ACCOUNT_NOT_ASSIGNED_CODE;
  throw error;
}

/**
 * Ném 403 `ZALO_ACCOUNT_NOT_ASSIGNED` nếu nhân viên không được giao tài khoản này.
 * Chủ / super admin luôn qua.
 *
 * @param {object} ctx
 * @param {number|string} accountId
 * @returns {Promise<void>}
 */
export async function assertZaloAccountAccess(ctx, accountId) {
  assertZaloAccountInScope(accountId, await getAccessibleZaloAccountIds(ctx));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloAccountNotAssignedError(error) {
  return error?.code === ZALO_ACCOUNT_NOT_ASSIGNED_CODE;
}

/**
 * Danh sách tài khoản Zalo của chủ + cờ đã giao cho nhân viên (màn Quản lý nhân viên).
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @returns {Promise<Array<{ id: number, displayName: string, zaloName: string, zaloPhone: string, status: string, isActive: boolean, isDefault: boolean, assigned: boolean, source: string|null }>>}
 */
export async function listZaloAssignmentsForOwner(ownerId, employeeId) {
  const rows = await listOwnerZaloAccountsWithAssignment(ownerId, employeeId);
  return rows.map((row) => ({
    id: Number(row.id),
    displayName: row.display_name || '',
    zaloName: row.zalo_name || '',
    zaloPhone: row.zalo_phone || '',
    status: row.status,
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    assigned: row.assignment_source != null,
    source: row.assignment_source || null,
  }));
}

/**
 * Thay toàn bộ việc giao Zalo cá nhân cho nhân viên. Id không thuộc chủ bị loại.
 *
 * @param {{ ownerId: number, employeeId: number, accountIds: Array<number|string>, actorUserId: number }} input
 * @returns {Promise<{ before: number[], after: number[] }>}
 */
export async function setZaloAssignmentsForEmployee({ ownerId, employeeId, accountIds, actorUserId }) {
  return replaceZaloAccountAssignments({ ownerId, employeeId, accountIds, actorUserId });
}

// ─── Telegram + WhatsApp Baileys (PR-H1) ────────────────────────────────────────────────────────────────────────────
// `account_ref`: Telegram = telegram_accounts.id (chuỗi); WhatsApp Baileys = session_key đầy đủ "<idChủ>-<khoáNgắn>".
// WhatsApp Cloud API KHÔNG nằm trong phạm vi (tài nguyên của cả workspace, chủ quản lý).
// H1 chưa dùng các hàm đọc/kiểm này để LỌC danh sách (đó là H2-H4) — chỉ để nạp / giao / chặn nối lại phiên WhatsApp.

export const CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE = 'CHANNEL_ACCOUNT_NOT_ASSIGNED';
const CHANNEL_NOT_ASSIGNED_MESSAGES = {
  [TELEGRAM_CHANNEL]: 'Tài khoản Telegram này chưa được giao cho bạn.',
  [WHATSAPP_BAILEYS_CHANNEL]: 'Tài khoản WhatsApp này chưa được giao cho bạn.',
};

/**
 * Tài khoản Telegram / WhatsApp (ref chuỗi) mà người thao tác dùng được. `null` = chủ / super admin (thấy tất cả); mảng =
 * nhân viên; HỎNG THÌ CHẶN (ngữ cảnh thiếu / lỗi đọc bảng → `[]`, không bao giờ `null`).
 *
 * @param {object} ctx `getWorkspaceContext(req.user)`
 * @param {'telegram'|'whatsapp_baileys'} channel
 * @returns {Promise<string[]|null>}
 */
export async function getAccessibleChannelAccountRefs(ctx, channel) {
  if (!isAssignmentScopedContext(ctx)) return null;
  try {
    const ownerId = Number(ctx?.workspaceOwnerId);
    const employeeId = Number(ctx?.actorUserId);
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return [];
    }
    if (channel === TELEGRAM_CHANNEL) return await findAssignedTelegramAccountRefs(ownerId, employeeId);
    if (channel === WHATSAPP_BAILEYS_CHANNEL) return await findAssignedWhatsAppSessionKeys(ownerId, employeeId);
    return [];
  } catch (error) {
    console.error(`[memberChannelAccess] Không đọc được việc giao tài khoản ${channel} — chặn:`, error?.message || error);
    return [];
  }
}

/**
 * Ném 403 `CHANNEL_ACCOUNT_NOT_ASSIGNED` nếu `ref` không nằm trong phạm vi. `null` (chủ / super admin) luôn qua; mọi giá trị
 * khác mảng (kể cả `undefined`) bị chặn.
 *
 * @param {'telegram'|'whatsapp_baileys'} channel
 * @param {string|number} ref
 * @param {string[]|null|undefined} accessibleRefs
 */
export function assertChannelAccountInScope(channel, ref, accessibleRefs) {
  if (accessibleRefs === null) return;
  if (Array.isArray(accessibleRefs) && accessibleRefs.map(String).includes(String(ref))) return;
  const error = new Error(CHANNEL_NOT_ASSIGNED_MESSAGES[channel] || 'Tài khoản này chưa được giao cho bạn.');
  error.status = 403;
  error.statusCode = 403;
  error.code = CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE;
  error.channel = channel;
  throw error;
}

/**
 * @param {object} ctx
 * @param {'telegram'|'whatsapp_baileys'} channel
 * @param {string|number} ref
 * @returns {Promise<void>}
 */
export async function assertChannelAccountAccess(ctx, channel, ref) {
  assertChannelAccountInScope(channel, ref, await getAccessibleChannelAccountRefs(ctx, channel));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isChannelAccountNotAssignedError(error) {
  return error?.code === CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE;
}

function telegramDisplayName(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || (row.username ? `@${row.username}` : '') || `Telegram #${row.id}`;
}

/**
 * Tài khoản Telegram của chủ + cờ đã giao cho nhân viên (màn Quản lý nhân viên).
 */
export async function listTelegramAssignmentsForOwner(ownerId, employeeId) {
  const rows = await listOwnerTelegramAccountsWithAssignment(ownerId, employeeId);
  return rows.map((row) => ({
    id: Number(row.id),
    displayName: telegramDisplayName(row),
    username: row.username || '',
    phone: row.phone || '',
    isActive: row.is_active !== false,
    assigned: row.assignment_source != null,
    source: row.assignment_source || null,
  }));
}

/**
 * Phiên WhatsApp (Baileys) của chủ + cờ đã giao. Tên / SĐT / trạng thái lấy từ phiên đang sống (không có thì chỉ khoá ngắn).
 */
export async function listWhatsAppAssignmentsForOwner(ownerId, employeeId) {
  const rows = await listOwnerWhatsAppSessionsWithAssignment(ownerId, employeeId);
  let getSession = () => null;
  try {
    ({ getSession } = await import('../chatbot/whatsappBaileys.service.js'));
  } catch (error) {
    console.warn('[memberChannelAccess] Không nạp được dịch vụ WhatsApp — chỉ hiện khoá phiên:', error?.message || error);
  }
  const prefix = `${ownerId}-`;
  return rows.map((row) => {
    const sessionKey = String(row.session_key);
    const shortKey = sessionKey.startsWith(prefix) ? sessionKey.slice(prefix.length) : sessionKey;
    let session = null;
    try {
      session = getSession(sessionKey);
    } catch {
      session = null;
    }
    return {
      sessionKey,
      shortKey,
      displayName: session?.userName || shortKey,
      phone: String(session?.userId || '').split('@')[0].split(':')[0],
      status: session?.status || 'offline',
      assigned: row.assignment_source != null,
      source: row.assignment_source || null,
    };
  });
}

/**
 * Đổi việc giao nhiều kênh một lần (một giao dịch). Khoá `undefined` = giữ nguyên kênh đó.
 *
 * @param {{ ownerId: number, employeeId: number, actorUserId: number, zaloAccountIds?: Array<number|string>,
 *           telegramAccountIds?: Array<number|string>, whatsappSessionKeys?: string[] }} input
 * @returns {Promise<{ zalo: object|null, telegram: object|null, whatsapp: object|null }>} trước / sau từng kênh có đổi
 */
export async function setChannelAssignmentsForEmployee(input) {
  return replaceChannelAssignments(input);
}
