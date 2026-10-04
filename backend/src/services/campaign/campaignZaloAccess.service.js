import db from '../../config/database.js';
import { isSuperAdmin } from '../../utils/roleScope.util.js';
import {
  getAccessibleZaloAccountIds,
  isZaloAccountAccessible,
  ZALO_ACCOUNT_NOT_ASSIGNED_CODE,
  ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE,
} from '../user/memberChannelAccess.service.js';
import {
  collectReferencedZaloAccountIds,
  resolveZaloAccountEntries,
} from '../../utils/campaignZaloAccountResolve.util.js';

/**
 * Kiểm quyền dùng tài khoản Zalo CỦA CHIẾN DỊCH (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN, PR-G3). Hai tình huống:
 *
 *  1. Có ngữ cảnh HTTP (`getWorkspaceContext(req.user)`): lưu / nhân bản chiến dịch, gửi thử, preview →
 *     `getAccessibleZaloAccountIds(ctx)` của G1 (null = chủ / super admin; mảng = nhân viên; lỗi → []).
 *  2. KHÔNG có ngữ cảnh HTTP — chạy nền, lịch, chạy liên tục, duyệt: chỉ kiểm theo NGƯỜI KÍCH HOẠT lượt chạy
 *     (`resolveRunTriggerUserId`: người bấm chạy / người tạo-bật lịch / người chạy tiếp / người duyệt), KHÔNG theo người tạo
 *     chiến dịch — việc giao tài khoản bảo vệ tài khoản của chủ khỏi nhân viên, chủ tự chạy thì luôn được, kể cả chiến dịch do
 *     nhân viên tạo. Người kích hoạt là chủ / super admin → không lọc; là nhân viên → mọi tài khoản Zalo của chiến dịch phải
 *     thuộc danh sách được giao của CHÍNH người đó TẠI THỜI ĐIỂM CHẠY (không lấy giao nhau với người tạo). Nhân viên đã bị
 *     xoá → không còn hàng giao → coi như không có tài khoản nào.
 *
 * Hỏng thì chặn: mọi lỗi đọc việc giao đều ra mảng rỗng (không bao giờ `null` = thấy hết).
 */

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Lỗi 403 `ZALO_ACCOUNT_NOT_ASSIGNED` — cùng hình dạng với `assertZaloAccountAccess` của G1 (status + statusCode + code)
 * để mọi `catch` đang có (`error.statusCode === 403` → trả code + message) xử lý được mà không phải sửa thêm.
 *
 * @param {string} [message]
 * @param {object} [extra]
 * @returns {Error & { status: number, statusCode: number, code: string }}
 */
export function createZaloNotAssignedError(message = ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE, extra = {}) {
  const error = new Error(message);
  error.status = 403;
  error.statusCode = 403;
  error.code = ZALO_ACCOUNT_NOT_ASSIGNED_CODE;
  return Object.assign(error, extra);
}

/**
 * Danh sách tài khoản Zalo dùng được của MỘT người theo id (không có ngữ cảnh HTTP).
 *
 * - chính chủ không gian → `null` (thấy hết);
 * - super admin (vai `admin` / `super_admin` trong `users.role`) → `null`: chạy hộ khách là việc có sẵn của họ;
 * - còn lại → danh sách được giao (rỗng nếu không còn là nhân viên của chủ, hoặc đọc lỗi).
 *
 * @param {{ ownerId: number|string, userId: number|string|null }} input
 * @returns {Promise<number[]|null>}
 */
export async function getAccessibleZaloAccountIdsForUser({ ownerId, userId }) {
  const owner = toPositiveInt(ownerId);
  const user = toPositiveInt(userId);
  if (!owner || !user) return [];
  if (owner === user) return null;
  try {
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [user]);
    if (rows[0] && isSuperAdmin(rows[0].role)) return null;
  } catch (error) {
    // Không tra được vai → coi như KHÔNG phải super admin và đi tiếp tới việc giao (chặn nếu không có hàng giao).
    console.error('[campaignZaloAccess] Không tra được vai người dùng — kiểm theo việc giao:', error?.message || error);
  }
  return getAccessibleZaloAccountIds({
    actorUserId: user,
    workspaceOwnerId: owner,
    contextType: 'employee',
    isSuperAdmin: false,
  });
}

/**
 * NGƯỜI KÍCH HOẠT lượt chạy — người mà việc giao tài khoản được kiểm theo. Thứ tự:
 *  1. `run_metadata.triggeredBy`: người bấm chạy; lượt từ lịch ghi người TẠO LỊCH vào đây; chạy tiếp (continuous) ghi người bấm
 *     chạy tiếp; duyệt ghi người duyệt; phục hồi sau deploy đọc lại đúng giá trị đã ghi lúc tạo run;
 *  2. cột `campaign_runs.triggered_by` (người bấm chạy; lượt lịch thì NULL);
 *  3. `campaign_schedules.created_by` của lịch sinh ra lượt chạy;
 *  4. CHỈ khi cả ba đều thiếu (run cũ thiếu dữ liệu) mới rơi về `campaigns.created_by`.
 * Không có ai → null (không xác định, không lọc — chiến dịch cũ của chủ không có người tạo).
 *
 * @param {{ metadataTriggeredBy?: any, triggeredBy?: any, scheduleCreatedBy?: any, campaignCreatedBy?: any }} input
 * @returns {number|null}
 */
export function resolveRunTriggerUserId({
  metadataTriggeredBy = null,
  triggeredBy = null,
  scheduleCreatedBy = null,
  campaignCreatedBy = null,
} = {}) {
  for (const candidate of [metadataTriggeredBy, triggeredBy, scheduleCreatedBy, campaignCreatedBy]) {
    const id = toPositiveInt(candidate);
    if (id) return id;
  }
  return null;
}

/**
 * Phạm vi tài khoản Zalo của một lượt chạy: giao của các NGƯỜI được truyền (engine / preflight chỉ truyền NGƯỜI KÍCH HOẠT)
 * không phải chủ.
 *
 * @param {{ ownerId: number|string, actorUserIds?: Array<number|string|null|undefined> }} input
 * @returns {Promise<{
 *   accessibleIds: number[]|null,
 *   restrictedActors: Array<{ userId: number, accessibleIds: number[] }>,
 * }>} `accessibleIds` null = không ai bị lọc (chủ tự tạo + tự chạy); mảng = giao nhau của các nhân viên liên quan
 */
export async function resolveZaloAccessScope({ ownerId, actorUserIds = [] }) {
  const owner = toPositiveInt(ownerId);
  const unique = [...new Set((Array.isArray(actorUserIds) ? actorUserIds : [])
    .map(toPositiveInt)
    .filter(Boolean))];
  // Người liên quan không phải chủ. `owner` thiếu → mọi người đều bị coi là khác chủ → bị chặn (hỏng thì chặn).
  const others = unique.filter((id) => id !== owner);
  if (others.length === 0) return { accessibleIds: null, restrictedActors: [] };

  const restrictedActors = [];
  for (const userId of others) {
    // eslint-disable-next-line no-await-in-loop
    const accessibleIds = await getAccessibleZaloAccountIdsForUser({ ownerId: owner, userId });
    if (accessibleIds !== null) restrictedActors.push({ userId, accessibleIds });
  }
  if (restrictedActors.length === 0) return { accessibleIds: null, restrictedActors: [] };

  let intersection = restrictedActors[0].accessibleIds;
  for (const actor of restrictedActors.slice(1)) {
    const allowed = new Set(actor.accessibleIds);
    intersection = intersection.filter((id) => allowed.has(id));
  }
  return { accessibleIds: intersection, restrictedActors };
}

/**
 * Id tài khoản Zalo mà preflight / engine THẬT SỰ dùng cho các node (mô phỏng engine, mọi id trong pool đều tính).
 *
 * @param {Array<object>} nodes hàng `campaign_nodes` (node_subtype, config)
 * @returns {number[]}
 */
export function collectEffectiveZaloAccountIds(nodes) {
  const ids = new Set();
  for (const entry of resolveZaloAccountEntries(nodes)) {
    for (const raw of entry.ids) {
      const id = toPositiveInt(raw);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function loadZaloAccountNames(accountIds) {
  const names = new Map();
  if (!accountIds.length) return names;
  try {
    const { rows } = await db.query(
      `SELECT id, display_name, zalo_name FROM zalo_settings WHERE id = ANY($1::bigint[])`,
      [accountIds]
    );
    for (const row of rows) {
      names.set(Number(row.id), String(row.display_name || row.zalo_name || '').trim());
    }
  } catch (error) {
    console.error('[campaignZaloAccess] Không đọc được tên tài khoản Zalo:', error?.message || error);
  }
  return names;
}

async function loadUserNames(userIds) {
  const names = new Map();
  if (!userIds.length) return names;
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, username FROM users WHERE id = ANY($1::bigint[])`,
      [userIds]
    );
    for (const row of rows) {
      names.set(Number(row.id), String(row.full_name || row.username || '').trim());
    }
  } catch (error) {
    console.error('[campaignZaloAccess] Không đọc được tên nhân viên:', error?.message || error);
  }
  return names;
}

/**
 * Tìm các cặp (nhân viên, tài khoản) mà nhân viên chưa được giao.
 *
 * @param {{ restrictedActors: Array<{ userId: number, accessibleIds: number[] }> }} scope
 * @param {number[]} accountIds
 * @returns {Array<{ userId: number, accountId: number }>}
 */
export function findUnassignedPairs(scope, accountIds) {
  const pairs = [];
  for (const actor of scope?.restrictedActors || []) {
    for (const accountId of accountIds) {
      if (!isZaloAccountAccessible(accountId, actor.accessibleIds)) {
        pairs.push({ userId: actor.userId, accountId });
      }
    }
  }
  return pairs;
}

/**
 * Chặn LƯỢT CHẠY khi chiến dịch dùng tài khoản Zalo mà một nhân viên liên quan chưa được giao. Ném 403
 * `ZALO_ACCOUNT_NOT_ASSIGNED` kèm câu tiếng Việt "Tài khoản Zalo "…" chưa được giao cho nhân viên "…"." — chạy trong
 * preflight (trước khi tạo run) và ở đầu engine (mọi đường chạy nền) nên TIN KHÔNG BAO GIỜ đi ra.
 *
 * @param {{ ownerId: number|string, actorUserIds?: Array<number|string|null|undefined>, accountIds: number[] }} input
 * @returns {Promise<{ accessibleIds: number[]|null }>} phạm vi dùng tiếp cho engine khi qua
 */
export async function assertRunZaloAccountsAssigned({ ownerId, actorUserIds = [], accountIds = [] }) {
  const scope = await resolveZaloAccessScope({ ownerId, actorUserIds });
  if (scope.accessibleIds === null) return scope;

  const unique = [...new Set(accountIds.map(toPositiveInt).filter(Boolean))];
  const pairs = findUnassignedPairs(scope, unique);
  if (pairs.length === 0) return scope;

  const [accountNames, userNames] = await Promise.all([
    loadZaloAccountNames([...new Set(pairs.map((pair) => pair.accountId))]),
    loadUserNames([...new Set(pairs.map((pair) => pair.userId))]),
  ]);
  const first = pairs[0];
  const accountLabel = accountNames.get(first.accountId) || `#${first.accountId}`;
  const userLabel = userNames.get(first.userId) || `#${first.userId}`;
  const more = pairs.length > 1 ? ` (và ${pairs.length - 1} trường hợp khác)` : '';
  throw createZaloNotAssignedError(
    `Tài khoản Zalo "${accountLabel}" chưa được giao cho nhân viên "${userLabel}"${more}. `
    + 'Chủ tài khoản vào Cài đặt › Nhân viên › Tài khoản Zalo để giao, hoặc chọn tài khoản khác cho chiến dịch.',
    { accountIds: unique, blockedPairs: pairs }
  );
}

/**
 * Chặn LƯU / nhân bản chiến dịch của nhân viên khi node nhắc tới tài khoản Zalo chưa được giao. Chủ / super admin luôn
 * qua (`getAccessibleZaloAccountIds` → null). Bảo thủ: tính MỌI id các node Zalo nhắc tới (kể cả `get_all_*` và id sót
 * lại), không chỉ id engine dùng thật — xem `collectReferencedZaloAccountIds`.
 *
 * Câu báo lỗi KHÔNG nêu tên tài khoản: tài khoản chưa giao không được lộ tên cho nhân viên.
 *
 * @param {object} ctx `getWorkspaceContext(req.user)`
 * @param {Array<object>} nodes node chiến dịch (camelCase hoặc snake_case)
 * @returns {Promise<void>}
 */
export async function assertCampaignNodesZaloAccountsAccessible(ctx, nodes) {
  const referenced = collectReferencedZaloAccountIds(nodes);
  if (referenced.length === 0) return;
  const accessibleIds = await getAccessibleZaloAccountIds(ctx);
  if (accessibleIds === null) return;
  const blocked = referenced.filter((id) => !isZaloAccountAccessible(id, accessibleIds));
  if (blocked.length === 0) return;
  throw createZaloNotAssignedError(
    'Chiến dịch dùng tài khoản Zalo chưa được giao cho bạn. Hãy chọn tài khoản Zalo bạn được giao, '
    + 'hoặc nhờ chủ tài khoản giao thêm trong Cài đặt › Nhân viên › Tài khoản Zalo.',
    { accountIds: blocked }
  );
}

/**
 * Giao của nhân viên đang thao tác khi trợ lý AI chỉ có `actor` + `owner` (không có ngữ cảnh HTTP): actor khác chủ ⇔ đang ở
 * ngữ cảnh nhân viên (`resolveOwnerUserId` chỉ đổi sang id chủ khi `activeContext.type === 'employee'`).
 * Chủ (actor === owner) hoặc không có người thao tác → null (không lọc). KHÔNG tra vai super admin như
 * `getAccessibleZaloAccountIdsForUser`: super admin đứng ở ngữ cảnh nhân viên của một chủ (hiếm) bị lọc như nhân viên — chặt
 * hơn các đường HTTP, an toàn hơn, và bớt một truy vấn ở mỗi lượt chat.
 *
 * @param {{ actorUserId?: number|string|null, ownerUserId?: number|string|null }} input
 * @returns {Promise<number[]|null>}
 */
export async function resolveActorZaloAccessibleIds({ actorUserId = null, ownerUserId = null } = {}) {
  const actor = toPositiveInt(actorUserId);
  const owner = toPositiveInt(ownerUserId);
  if (!actor) return null; // không có người thao tác (gọi nội bộ) → không có ai để lọc
  if (!owner) return []; // có người thao tác mà không biết chủ → không xác định được → chặn
  if (actor === owner) return null;
  return getAccessibleZaloAccountIds({
    actorUserId: actor,
    workspaceOwnerId: owner,
    contextType: 'employee',
    isSuperAdmin: false,
  });
}

export default {
  createZaloNotAssignedError,
  getAccessibleZaloAccountIdsForUser,
  resolveZaloAccessScope,
  resolveRunTriggerUserId,
  collectEffectiveZaloAccountIds,
  findUnassignedPairs,
  assertRunZaloAccountsAssigned,
  assertCampaignNodesZaloAccountsAccessible,
  resolveActorZaloAccessibleIds,
};
