import db from '../../config/database.js';
import { isSuperAdmin } from '../../utils/roleScope.util.js';
import {
  CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE,
  getAccessibleChannelAccountRefs,
  getAccessibleChannelScope,
} from '../user/memberChannelAccess.service.js';
import {
  TELEGRAM_CHANNEL,
  WHATSAPP_BAILEYS_CHANNEL,
} from '../../repositories/user/memberChannelAccount.repository.js';

/**
 * Kiểm quyền dùng tài khoản Telegram / WhatsApp (Baileys) CỦA CHIẾN DỊCH (PLAN_GIAO_TK_TG_WA, PR-H2) — khuôn
 * `campaignZaloAccess.service.js` của Zalo G3:
 *
 *  1. Có ngữ cảnh HTTP (`getWorkspaceContext(req.user)`): LƯU / nhân bản chiến dịch → `assertCampaignNodesChannelAccountsAccessible`.
 *  2. KHÔNG có ngữ cảnh HTTP — chạy nền, lịch, chạy liên tục, duyệt: chỉ kiểm theo NGƯỜI KÍCH HOẠT lượt chạy
 *     (`resolveRunTriggerUserId`), KHÔNG theo người tạo chiến dịch. Người kích hoạt là chủ / super admin → không lọc; là nhân
 *     viên → mọi tài khoản Telegram / WhatsApp của chiến dịch phải thuộc danh sách được giao của CHÍNH người đó TẠI THỜI ĐIỂM
 *     CHẠY. Nhân viên đã bị xoá → không còn hàng giao → coi như không có tài khoản nào.
 *
 * Hỏng thì chặn: lỗi đọc việc giao ra mảng rỗng (không bao giờ `null` = thấy hết).
 *
 * "Phạm vi" của một người = `{ telegram: string[]|null, whatsapp_baileys: string[]|null }` (`null` = thấy hết).
 */

/** subtype node → (kênh, khoá cấu hình chứa tài khoản). Node adapter chỉ có MỘT tài khoản. */
const NODE_ACCOUNT_FIELDS = {
  send_telegram: { channel: TELEGRAM_CHANNEL, field: 'telegramAccountId' },
  send_whatsapp: { channel: WHATSAPP_BAILEYS_CHANNEL, field: 'whatsappSessionKey' },
};

const CHANNEL_LABELS = {
  [TELEGRAM_CHANNEL]: 'Telegram',
  [WHATSAPP_BAILEYS_CHANNEL]: 'WhatsApp',
};

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readNodeConfig(node) {
  const raw = node?.config;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Phạm vi "thấy hết". */
export function unrestrictedChannelScope() {
  return { [TELEGRAM_CHANNEL]: null, [WHATSAPP_BAILEYS_CHANNEL]: null };
}

/** Phạm vi "không thấy gì" — giá trị mặc định cho tới khi engine tính xong (hỏng thì chặn). */
export function emptyChannelScope() {
  return { [TELEGRAM_CHANNEL]: [], [WHATSAPP_BAILEYS_CHANNEL]: [] };
}

/**
 * Lỗi 403 `CHANNEL_ACCOUNT_NOT_ASSIGNED` — cùng hình dạng với `assertChannelAccountInScope` (status + statusCode + code).
 *
 * @param {string} message
 * @param {object} [extra]
 */
export function createChannelNotAssignedError(message, extra = {}) {
  const error = new Error(message);
  error.status = 403;
  error.statusCode = 403;
  error.code = CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE;
  return Object.assign(error, extra);
}

/**
 * Tài khoản Telegram / WhatsApp mà các node của chiến dịch nhắc tới (bảo thủ: mọi node adapter, kể cả node cấu hình dở).
 *
 * @param {Array<object>} nodes hàng `campaign_nodes` hoặc node từ body (camelCase / snake_case)
 * @returns {{ telegram: string[], whatsapp_baileys: string[] }}
 */
export function collectCampaignChannelAccountRefs(nodes) {
  const refs = { [TELEGRAM_CHANNEL]: new Set(), [WHATSAPP_BAILEYS_CHANNEL]: new Set() };
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const subtype = String(node?.node_subtype ?? node?.nodeSubtype ?? '').trim();
    const spec = NODE_ACCOUNT_FIELDS[subtype];
    if (!spec) continue;
    const value = readNodeConfig(node)[spec.field];
    const ref = String(value ?? '').trim();
    if (ref) refs[spec.channel].add(ref);
  }
  return {
    [TELEGRAM_CHANNEL]: [...refs[TELEGRAM_CHANNEL]],
    [WHATSAPP_BAILEYS_CHANNEL]: [...refs[WHATSAPP_BAILEYS_CHANNEL]],
  };
}

/**
 * Phạm vi của MỘT người theo id (không có ngữ cảnh HTTP):
 *  - chính chủ không gian → thấy hết; super admin (`users.role`) → thấy hết;
 *  - còn lại → danh sách được giao (rỗng nếu không còn là nhân viên của chủ, hoặc đọc lỗi).
 *
 * @param {{ ownerId: number|string, userId: number|string|null }} input
 * @returns {Promise<{ telegram: string[]|null, whatsapp_baileys: string[]|null }>}
 */
export async function getChannelScopeForUser({ ownerId, userId }) {
  const owner = toPositiveInt(ownerId);
  const user = toPositiveInt(userId);
  if (!owner || !user) return emptyChannelScope();
  if (owner === user) return unrestrictedChannelScope();
  try {
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [user]);
    if (rows[0] && isSuperAdmin(rows[0].role)) return unrestrictedChannelScope();
  } catch (error) {
    // Không tra được vai → coi như KHÔNG phải super admin và đi tiếp tới việc giao (chặn nếu không có hàng giao).
    console.error('[campaignChannelAccess] Không tra được vai người dùng — kiểm theo việc giao:', error?.message || error);
  }
  const ctx = { actorUserId: user, workspaceOwnerId: owner, contextType: 'employee', isSuperAdmin: false };
  const [telegram, whatsapp] = await Promise.all([
    getAccessibleChannelAccountRefs(ctx, TELEGRAM_CHANNEL),
    getAccessibleChannelAccountRefs(ctx, WHATSAPP_BAILEYS_CHANNEL),
  ]);
  return { [TELEGRAM_CHANNEL]: telegram, [WHATSAPP_BAILEYS_CHANNEL]: whatsapp };
}

/**
 * Phạm vi của một lượt chạy: giao của các NGƯỜI được truyền (engine / preflight chỉ truyền NGƯỜI KÍCH HOẠT), không phải chủ.
 *
 * @param {{ ownerId: number|string, actorUserIds?: Array<number|string|null|undefined> }} input
 * @returns {Promise<{ scope: { telegram: string[]|null, whatsapp_baileys: string[]|null },
 *   restrictedActors: Array<{ userId: number, scope: object }> }>} `scope` null ở một kênh = không ai bị lọc kênh đó
 */
export async function resolveChannelAccessScope({ ownerId, actorUserIds = [] }) {
  const owner = toPositiveInt(ownerId);
  const unique = [...new Set((Array.isArray(actorUserIds) ? actorUserIds : []).map(toPositiveInt).filter(Boolean))];
  // `owner` thiếu → mọi người đều bị coi là khác chủ → bị chặn (hỏng thì chặn).
  const others = unique.filter((id) => id !== owner);
  if (others.length === 0) return { scope: unrestrictedChannelScope(), restrictedActors: [] };

  const restrictedActors = [];
  for (const userId of others) {
    // eslint-disable-next-line no-await-in-loop
    const scope = await getChannelScopeForUser({ ownerId: owner, userId });
    if (scope[TELEGRAM_CHANNEL] !== null || scope[WHATSAPP_BAILEYS_CHANNEL] !== null) restrictedActors.push({ userId, scope });
  }
  const merged = unrestrictedChannelScope();
  for (const channel of [TELEGRAM_CHANNEL, WHATSAPP_BAILEYS_CHANNEL]) {
    for (const actor of restrictedActors) {
      const list = actor.scope[channel];
      if (list === null) continue;
      merged[channel] = merged[channel] === null ? [...list] : merged[channel].filter((ref) => list.includes(ref));
    }
  }
  return { scope: merged, restrictedActors };
}

async function loadChannelAccountLabels(refs) {
  const labels = new Map();
  try {
    if (refs[TELEGRAM_CHANNEL].length) {
      const ids = refs[TELEGRAM_CHANNEL].map(toPositiveInt).filter(Boolean);
      if (ids.length) {
        const { rows } = await db.query(
          'SELECT id, first_name, last_name, username FROM telegram_accounts WHERE id = ANY($1::bigint[])',
          [ids]
        );
        for (const row of rows) {
          const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
          labels.set(`${TELEGRAM_CHANNEL}:${row.id}`, name || row.username || `#${row.id}`);
        }
      }
    }
  } catch (error) {
    console.error('[campaignChannelAccess] Không đọc được tên tài khoản Telegram:', error?.message || error);
  }
  return labels;
}

async function loadUserNames(userIds) {
  const names = new Map();
  if (!userIds.length) return names;
  try {
    const { rows } = await db.query('SELECT id, full_name, username FROM users WHERE id = ANY($1::bigint[])', [userIds]);
    for (const row of rows) names.set(Number(row.id), String(row.full_name || row.username || '').trim());
  } catch (error) {
    console.error('[campaignChannelAccess] Không đọc được tên nhân viên:', error?.message || error);
  }
  return names;
}

/**
 * Cặp (nhân viên, kênh, ref) mà nhân viên chưa được giao.
 *
 * @returns {Array<{ userId: number, channel: string, ref: string }>}
 */
export function findUnassignedChannelPairs(restrictedActors, refs) {
  const pairs = [];
  for (const actor of restrictedActors || []) {
    for (const channel of [TELEGRAM_CHANNEL, WHATSAPP_BAILEYS_CHANNEL]) {
      const allowed = actor.scope?.[channel];
      if (allowed === null) continue;
      for (const ref of refs[channel] || []) {
        if (!Array.isArray(allowed) || !allowed.map(String).includes(String(ref))) {
          pairs.push({ userId: actor.userId, channel, ref });
        }
      }
    }
  }
  return pairs;
}

/**
 * Chặn LƯỢT CHẠY khi chiến dịch dùng tài khoản Telegram / WhatsApp mà một nhân viên liên quan chưa được giao. Ném 403
 * `CHANNEL_ACCOUNT_NOT_ASSIGNED` kèm câu tiếng Việt — chạy trong preflight (trước khi tạo run) và ở đầu engine nên TIN KHÔNG
 * BAO GIỜ đi ra.
 *
 * @param {{ ownerId: number|string, actorUserIds?: Array<number|string|null|undefined>, nodes: Array<object> }} input
 * @returns {Promise<{ scope: { telegram: string[]|null, whatsapp_baileys: string[]|null } }>} phạm vi dùng tiếp cho engine
 */
export async function assertRunChannelAccountsAssigned({ ownerId, actorUserIds = [], nodes = [] }) {
  const refs = collectCampaignChannelAccountRefs(nodes);
  const resolved = await resolveChannelAccessScope({ ownerId, actorUserIds });
  const pairs = findUnassignedChannelPairs(resolved.restrictedActors, refs);
  if (pairs.length === 0) return { scope: resolved.scope };

  const [labels, userNames] = await Promise.all([
    loadChannelAccountLabels(refs),
    loadUserNames([...new Set(pairs.map((pair) => pair.userId))]),
  ]);
  const first = pairs[0];
  const channelLabel = CHANNEL_LABELS[first.channel];
  const accountLabel = first.channel === TELEGRAM_CHANNEL
    ? (labels.get(`${TELEGRAM_CHANNEL}:${first.ref}`) || `#${first.ref}`)
    : String(first.ref).replace(/^\d+-/, '');
  const userLabel = userNames.get(first.userId) || `#${first.userId}`;
  const more = pairs.length > 1 ? ` (và ${pairs.length - 1} trường hợp khác)` : '';
  throw createChannelNotAssignedError(
    `Tài khoản ${channelLabel} "${accountLabel}" chưa được giao cho nhân viên "${userLabel}"${more}. `
    + 'Chủ tài khoản vào Cài đặt › Nhân viên › Tài khoản kênh để giao, hoặc chọn tài khoản khác cho chiến dịch.',
    { blockedPairs: pairs }
  );
}

/**
 * Chặn LƯU / nhân bản chiến dịch của nhân viên khi node nhắc tới tài khoản Telegram / WhatsApp chưa được giao. Chủ / super
 * admin luôn qua. Câu báo lỗi KHÔNG nêu tên tài khoản: tài khoản chưa giao không được lộ tên cho nhân viên.
 *
 * @param {object} ctx `getWorkspaceContext(req.user)`
 * @param {Array<object>} nodes
 * @returns {Promise<void>}
 */
export async function assertCampaignNodesChannelAccountsAccessible(ctx, nodes) {
  const refs = collectCampaignChannelAccountRefs(nodes);
  for (const channel of [TELEGRAM_CHANNEL, WHATSAPP_BAILEYS_CHANNEL]) {
    if (refs[channel].length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const accessible = await getAccessibleChannelAccountRefs(ctx, channel);
    if (accessible === null) continue;
    const blocked = refs[channel].filter((ref) => !accessible.map(String).includes(String(ref)));
    if (blocked.length === 0) continue;
    throw createChannelNotAssignedError(
      `Chiến dịch dùng tài khoản ${CHANNEL_LABELS[channel]} chưa được giao cho bạn. Hãy chọn tài khoản ${CHANNEL_LABELS[channel]} bạn được giao, `
      + 'hoặc nhờ chủ tài khoản giao thêm trong Cài đặt › Nhân viên › Tài khoản kênh.',
      { channel, accountRefs: blocked }
    );
  }
}

/**
 * Phạm vi tài khoản Telegram / WhatsApp của NHÂN VIÊN đang chat với trợ lý AI (không có ngữ cảnh HTTP, chỉ có `actor` + `owner`) —
 * khuôn `resolveActorZaloAccessibleIds`. Actor khác chủ ⇔ đang ở ngữ cảnh nhân viên (`resolveOwnerUserId` chỉ đổi sang id chủ khi
 * `activeContext.type === 'employee'`). Trả:
 *  - `null`  → không lọc (chủ tự chat, hoặc không có người thao tác = gọi nội bộ);
 *  - `{ telegram: string[]|null, whatsapp_baileys: string[]|null }` → nhân viên (lỗi đọc việc giao → mảng rỗng, KHÔNG bao giờ null);
 *  - có người thao tác mà không biết chủ → phạm vi RỖNG (hỏng thì chặn).
 * KHÔNG tra vai super admin (như bản Zalo): super admin đứng ở ngữ cảnh nhân viên của một chủ (hiếm) bị lọc như nhân viên.
 *
 * @param {{ actorUserId?: number|string|null, ownerUserId?: number|string|null }} input
 * @returns {Promise<{ telegram: string[]|null, whatsapp_baileys: string[]|null }|null>}
 */
export async function resolveActorChannelAccessibleRefs({ actorUserId = null, ownerUserId = null } = {}) {
  const actor = toPositiveInt(actorUserId);
  const owner = toPositiveInt(ownerUserId);
  if (!actor) return null;
  if (!owner) return emptyChannelScope();
  if (actor === owner) return null;
  return getAccessibleChannelScope({ actorUserId: actor, workspaceOwnerId: owner, contextType: 'employee', isSuperAdmin: false });
}

/** Sau tối đa từng này ms thì engine kiểm lại việc giao (chủ gỡ giao giữa chừng → lượt chạy dừng). */
export const CHANNEL_ACCESS_RECHECK_MS = 5 * 60 * 1000;

/**
 * Bộ gác tài khoản Telegram / WhatsApp của MỘT lượt chạy (engine `campaignRun.service`). Tách ra để kiểm bằng đồng hồ giả:
 *  - `enforce()`: kiểm theo NGƯỜI KÍCH HOẠT (`getActorUserIds()`); sai → `onBlocked(lỗi)` đóng sổ run 'failed' rồi ném `RUN_STOPPED`
 *    (`channelAccessBlocked = true`). Gọi ở đầu MỖI chu kỳ chạy;
 *  - `ensureFresh()`: chỉ kiểm lại khi đã quá `recheckMs` kể từ lần kiểm trước — gọi trước mỗi node gửi;
 *  - `getScope()`: phạm vi truyền xuống adapter. Mặc định RỖNG tới khi tính xong (hỏng thì chặn); bị chặn → về rỗng.
 * Chiến dịch không có node Telegram / WhatsApp → mọi hàm là no-op (không truy vấn gì).
 *
 * @param {{ ownerId: number|string, nodes: Array<object>, getActorUserIds: () => Array<number|string|null|undefined>,
 *   onBlocked: (error: Error) => Promise<void>, recheckMs?: number, now?: () => number }} input
 */
export function createRunChannelAccessGuard({
  ownerId,
  nodes,
  getActorUserIds,
  onBlocked,
  recheckMs = CHANNEL_ACCESS_RECHECK_MS,
  now = () => Date.now(),
}) {
  const refs = collectCampaignChannelAccountRefs(nodes);
  const hasChannelAccountNodes = refs[TELEGRAM_CHANNEL].length > 0 || refs[WHATSAPP_BAILEYS_CHANNEL].length > 0;
  let scope = emptyChannelScope();
  let checkedAtMs = 0;

  const enforce = async () => {
    if (!hasChannelAccountNodes) return;
    try {
      const result = await assertRunChannelAccountsAssigned({ ownerId, actorUserIds: getActorUserIds(), nodes });
      scope = result.scope;
      checkedAtMs = now();
    } catch (accessError) {
      if (accessError?.code !== CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE) throw accessError;
      scope = emptyChannelScope();
      // Đóng sổ TRƯỚC khi ném (cùng khuôn Zalo): nhánh RUN_STOPPED ở catch tổng của engine chỉ log + return.
      await onBlocked(accessError);
      const stopError = new Error(accessError.message);
      stopError.code = 'RUN_STOPPED';
      stopError.channelAccessBlocked = true;
      throw stopError;
    }
  };

  const ensureFresh = async () => {
    if (!hasChannelAccountNodes) return;
    if (now() - checkedAtMs > recheckMs) await enforce();
  };

  return { enforce, ensureFresh, getScope: () => scope, hasChannelAccountNodes };
}

export default {
  assertCampaignNodesChannelAccountsAccessible,
  assertRunChannelAccountsAssigned,
  collectCampaignChannelAccountRefs,
  createChannelNotAssignedError,
  createRunChannelAccessGuard,
  emptyChannelScope,
  findUnassignedChannelPairs,
  getChannelScopeForUser,
  resolveActorChannelAccessibleRefs,
  resolveChannelAccessScope,
  unrestrictedChannelScope,
};
