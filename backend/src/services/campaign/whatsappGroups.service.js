/**
 * P8b (PLAN_TG_WA_DAY_DU) — danh sách nhóm WhatsApp của một phiên để người dựng chiến dịch/gửi nhanh chọn nhóm.
 * Khuôn `telegramGroups.service.js`: đọc TRỰC TIẾP từ WhatsApp mỗi lần, không lưu CSDL. Phiên phải thuộc CHỦ workspace
 * (tiền tố `<chủ>-`), nếu không luôn 404 — không lộ phiên đó có tồn tại hay không.
 */

export const WHATSAPP_GROUPS_TIMEOUT_MS = 20_000;

export const WHATSAPP_SESSION_NOT_READY_MESSAGE =
  'Tài khoản WhatsApp chưa kết nối — quét lại QR trong Quản lý kênh gửi.';

const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NOT_CONNECTED_SUBSTRINGS = [
  'is not connected',
  'Connection Closed',
  'Connection Terminated',
  'Connection was lost',
  'Intentional Logout',
  'logged out',
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function defaultLoadWhatsAppService() {
  // Import trễ: whatsappBaileys.service chạy hydrateProfileCache() (đọc DB) ngay khi import.
  return import('../chatbot/whatsappBaileys.service.js');
}

/**
 * @param {{ownerUserId: number, sessionKey: string}} input `ownerUserId` = chủ workspace.
 * @param {{loadService?: Function, timeoutMs?: number}} [deps]
 * @returns {Promise<Array<{recipientKey: string, title: string, membersCount: number|null}>>}
 * @throws Error có `.status`: 404 không thuộc workspace, 409 phiên chưa kết nối, 504 quá thời gian, 502 lỗi khác.
 */
export async function listWhatsAppGroupsForSession(
  { ownerUserId, sessionKey },
  { loadService = defaultLoadWhatsAppService, timeoutMs = WHATSAPP_GROUPS_TIMEOUT_MS } = {}
) {
  const key = String(sessionKey ?? '').trim();
  const owner = Number(ownerUserId);
  if (!Number.isInteger(owner) || owner <= 0 || !SESSION_KEY_PATTERN.test(key) || !key.startsWith(`${owner}-`)) {
    throw httpError(404, 'Không tìm thấy tài khoản WhatsApp');
  }
  const service = await loadService();
  const session = service.getSession(key);
  if (!session || session.status !== 'open') {
    throw httpError(409, WHATSAPP_SESSION_NOT_READY_MESSAGE);
  }

  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('WHATSAPP_GROUPS_TIMEOUT');
        err.isTimeout = true;
        reject(err);
      }, timeoutMs);
    });
    const groups = await Promise.race([service.listGroups(key), timeout]);
    return Array.isArray(groups) ? groups : [];
  } catch (err) {
    if (err?.isTimeout) {
      throw httpError(504, 'WhatsApp phản hồi quá chậm khi tải danh sách nhóm — thử lại sau.');
    }
    const message = String(err?.message ?? '');
    if (NOT_CONNECTED_SUBSTRINGS.some((s) => message.includes(s))) {
      throw httpError(409, WHATSAPP_SESSION_NOT_READY_MESSAGE);
    }
    console.error('[whatsappGroups] listGroups failed:', message);
    throw httpError(502, 'Không tải được danh sách nhóm WhatsApp — thử lại sau.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default { listWhatsAppGroupsForSession };
