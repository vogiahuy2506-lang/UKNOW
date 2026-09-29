/**
 * PLAN_TELEGRAM_TRANG_THAI_PHIEN_VA_NHOM_2026-09-29 PR-E2 — danh sách nhóm Telegram của một tài khoản
 * để người dựng chiến dịch `telegram_group` chọn nhóm. Đọc TRỰC TIẾP từ Telegram mỗi lần (không lưu CSDL).
 */
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import telegramGateway from '../chatbot/telegramGateway.client.js';

export const TELEGRAM_GROUPS_TIMEOUT_MS = 20_000;

export const SESSION_EXPIRED_MESSAGE =
  'Phiên Telegram hết hiệu lực — đăng nhập lại trong Quản lý kênh gửi.';

const SESSION_ERROR_SUBSTRINGS = [
  'No active session',
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
  'USER_DEACTIVATED_BAN',
  'called before connect()',
  'DataView constructor',
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function hasPermanentKey(session) {
  const keys = session?.authKeys?.permanent;
  return Boolean(keys && typeof keys === 'object' && Object.keys(keys).length > 0);
}

/**
 * @param {{ownerUserId: number, accountId: number|string}} input `ownerUserId` = chủ workspace.
 * @param {{repo?: object, gateway?: object, timeoutMs?: number}} [deps]
 * @returns {Promise<Array<{chatId: number, title: string, type: string, membersCount: number|null}>>}
 * @throws Error có `.status`: 404 không thuộc workspace, 409 phiên không dùng được, 504 quá thời gian, 502 lỗi khác.
 */
export async function listTelegramGroupsForAccount(
  { ownerUserId, accountId },
  { repo = chatbotTelegramRepository, gateway = telegramGateway, timeoutMs = TELEGRAM_GROUPS_TIMEOUT_MS } = {}
) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0 || !ownerUserId) {
    throw httpError(404, 'Không tìm thấy tài khoản Telegram');
  }
  // Lọc theo CHỦ workspace — tài khoản workspace khác luôn 404 (không lộ sự tồn tại).
  const account = await repo.getAccountById(id, { userId: ownerUserId });
  if (!account) throw httpError(404, 'Không tìm thấy tài khoản Telegram');
  if (account.is_active === false) throw httpError(409, SESSION_EXPIRED_MESSAGE);

  // Chỉ đọc CSDL — không dựng client chỉ để kiểm phiên.
  const session = await repo.getSessionString(account.telegram_user_id);
  if (!hasPermanentKey(session)) throw httpError(409, SESSION_EXPIRED_MESSAGE);

  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('TELEGRAM_GROUPS_TIMEOUT');
        err.isTimeout = true;
        reject(err);
      }, timeoutMs);
    });
    const groups = await Promise.race([gateway.listGroups(account.telegram_user_id), timeout]);
    return Array.isArray(groups) ? groups : [];
  } catch (err) {
    if (err?.isTimeout) {
      throw httpError(504, 'Telegram phản hồi quá chậm khi tải danh sách nhóm — thử lại sau.');
    }
    const message = String(err?.message ?? '');
    if (SESSION_ERROR_SUBSTRINGS.some((s) => message.includes(s))) {
      throw httpError(409, SESSION_EXPIRED_MESSAGE);
    }
    console.error('[telegramGroups] listGroups failed:', message);
    throw httpError(502, 'Không tải được danh sách nhóm Telegram — thử lại sau.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default { listTelegramGroupsForAccount };
