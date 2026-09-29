/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-6 — Adapter Telegram tham chiếu cho chiến dịch.
 *
 * Kênh 'adapter' đầu tiên có build THẬT (Telegram/WhatsApp trước đó chỉ có mock ở test). Đăng ký
 * qua `campaignChannelRegistry.service.js`, sau cờ `CAMPAIGN_CHANNEL_TELEGRAM_ENABLED` (TẮT mặc
 * định — xem mục "CHỐT PR-6" trong plan). Không làm FE/AI/bán kênh/tra peer theo SĐT-username —
 * node tạo qua API/SQL, người nhận CHỈ lấy từ hội thoại đã mở (`telegram_personal_conversations`).
 *
 * **Lỗi Telegram bị bọc** — `MtProtoTelegramClient.sendMessage` (mtProtoTelegramClient.js:636-641)
 * bọc MỌI lỗi (kể cả stub) thành `TelegramTransportError` status 503, message
 * `MtProtoTelegramClient.sendMessage failed: <lỗi gốc>`; sau đó `telegramGateway.client.js`'s
 * `wrap()` bọc THÊM một lớp nữa thành `sendMessage: <message trên>`. Vì status LUÔN là 503 dù lỗi
 * là FLOOD_WAIT hay stub hay mạng, KHÔNG được classify theo `.status`/`instanceof` — phải parse
 * CHUỖI message (đã kiểm — status 503 dùng chung cho mọi loại lỗi transport).
 *
 * **Dạng chuỗi lỗi RPC gốc — ĐÃ KIỂM trong node_modules/@mtcute/core (không còn là giả định)**:
 * `RpcError` (tl/inner-tl.js) dựng `message = "Telegram API error " + code + ": " + text` — `text`
 * là chuỗi gốc Telegram trả (vd "FLOOD_WAIT_1800"). Với các lỗi có số nhúng trong tên (FLOOD_WAIT_X,
 * SLOWMODE_WAIT_X, FLOOD_PREMIUM_WAIT_X, FILE_MIGRATE_X, ...), `RpcError.fromTl` sau đó GHI ĐÈ
 * `err.text` thành template "FLOOD_WAIT_%d" (không phải `.message`) — `.message` (đã set ở
 * constructor bằng `super()`) giữ nguyên số thật, không bị mất. Chuỗi cuối cùng lộ ra ở `sendOne`
 * của adapter này (đã bọc đủ 2 lớp) có dạng:
 *   "sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram API error 420: FLOOD_WAIT_1800"
 * KHÔNG phải 2 dạng đoán trong plan ("FLOOD_WAIT_1800" trần hay "420: FLOOD_WAIT_1800 …") — dài hơn
 * cả hai vì có thêm 2 lớp bọc + tiền tố "Telegram API error ". Regex bên dưới KHÔNG neo đầu chuỗi
 * (`\b...\b` không dùng `^`) nên khớp đúng bất kể bọc bao nhiêu lớp/tiền tố gì đứng trước.
 * mtcute tự ngủ (retry nội bộ, không ném lỗi ra ngoài) khi FLOOD_WAIT ≤ 10s
 * (network/middlewares/flood-waiter.js: `maxWait = 1e4`) — chỉ khi dài hơn 10s mtcute mới trả lỗi
 * lên tầng RPC, tới lượt chúng ta thấy.
 */

import { ChannelSendError } from '../campaignChannelRegistry.service.js';
import telegramGateway from '../../chatbot/telegramGateway.client.js';
import { isStubOnly } from '../../chatbot/inProcChannelGateway/stubCheck.js';
import chatbotTelegramRepository from '../../../repositories/chatbot/chatbotTelegram.repository.js';

/** Chỉ nhận chat id Telegram dạng số (âm cho group/channel) — không tra theo SĐT/username. */
const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

/** vd "FLOOD_WAIT_1800", "SLOWMODE_WAIT_30", "FLOOD_PREMIUM_WAIT_60" — nhóm 2 là số giây. */
const FLOOD_WAIT_PATTERN = /\b(FLOOD_WAIT|SLOWMODE_WAIT|FLOOD_PREMIUM_WAIT)_(\d+)\b/;

const AUTH_ERROR_SUBSTRINGS = [
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
  'USER_DEACTIVATED_BAN',
  'called before connect()',
  // Phiên lưu hỏng (Buffer thành object, vd sự cố 28-29/09) — lỗi của TÀI KHOẢN gửi, không phải của từng người nhận.
  'DataView constructor',
];

const HARD_ERROR_SUBSTRINGS = [
  'PEER_ID_INVALID',
  'USER_IS_BLOCKED',
  'INPUT_USER_DEACTIVATED',
  'CHAT_WRITE_FORBIDDEN',
  'USER_PRIVACY_RESTRICTED',
  'USER_BANNED_IN_CHANNEL',
];

const TRANSIENT_ERROR_SUBSTRINGS = ['sendText timeout', 'ECONNRESET', 'ETIMEDOUT'];

// stub ('Telegram transport not implemented') VÀ guard 'chưa cấu hình' của telegramGateway.client.js
// đều thuộc nhóm này — cả hai đều là "hạ tầng gửi chưa sẵn sàng", không phải lỗi của người nhận.
const NOT_CONFIGURED_ERROR_SUBSTRINGS = [
  'Telegram transport not implemented',
  'gateway is not configured',
  'No active session for telegram_user_id',
];

/**
 * Phân loại lỗi gửi Telegram từ chuỗi message (KHÔNG dùng `.status`/`instanceof` — xem ghi chú đầu
 * file). Dùng chung cho `sendOne` (gắn `retryAfterMs`) và `classifyError` (hợp đồng adapter).
 *
 * @param {Error|string} err
 * @returns {'hard'|'transient'|'rate_limit'|'auth'|'not_configured'}
 */
export function classifyTelegramSendError(err) {
  if (err instanceof ChannelSendError) return err.category;
  const message = String(err?.message ?? err ?? '');
  if (FLOOD_WAIT_PATTERN.test(message)) return 'rate_limit';
  if (AUTH_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'auth';
  if (HARD_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'hard';
  if (TRANSIENT_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'transient';
  if (NOT_CONFIGURED_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'not_configured';
  return 'hard';
}

/** Policy đọc env MỖI LẦN gọi (không cache ở import) — số mặc định BẢO THỦ, CHƯA có dữ liệu ngưỡng
 * Telegram thật (khác Zalo, nơi đã đo ~14k lượt gửi thật). Sếp cần tinh chỉnh khi có số liệu. */
// Review PR-6 — giờ 0 (nửa đêm) là giờ hợp lệ (vd khung 22→0): `|| mặc định` nuốt mất 0. Giờ đọc theo
// khoảng 0..23; ngoài khoảng/không phải số → mặc định. Delay/trần giữ `|| mặc định` (0 là tắt nhịp — bảo thủ, bỏ qua).
function parseHourEnv(raw, fallback) {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

export function buildTelegramPolicyFromEnv() {
  return {
    minDelayMs: Number.parseInt(process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS, 10) || 5000,
    maxDelayMs: Number.parseInt(process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS, 10) || 10000,
    perHourLimit: Number.parseInt(process.env.TELEGRAM_OUTBOUND_PER_HOUR_LIMIT, 10) || 100,
    quietHours: {
      startHour: parseHourEnv(process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START, 23),
      endHour: parseHourEnv(process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END, 6),
    },
  };
}

// Review PR-6 — chatbotTelegram.repository.getAccountById BỎ lọc chủ khi userId rỗng (`if (userId)`). Ở đây
// quyền dùng tài khoản gửi tin dựa hoàn toàn vào lọc đó → không có chủ thì từ chối, không tra.
function assertOwnerPresent(ownerId, nodeId) {
  if (ownerId == null || String(ownerId).trim() === '' || Number(ownerId) <= 0) {
    const err = new Error(`Không xác định được chủ chiến dịch để kiểm tài khoản Telegram (node ${nodeId ?? '?'}).`);
    err.code = 'TELEGRAM_ACCOUNT_NOT_READY';
    throw err;
  }
}

/**
 * Preflight — throw SỚM (400 ở campaignPreflight.service.js) thay vì để lộ 503 lúc gửi.
 * @param {{userId: number, node: object}} input `userId` = chủ workspace (preflight truyền vậy).
 */
async function checkReadiness({ userId, node }) {
  if (isStubOnly({ channel: 'telegram' })) {
    const err = new Error(
      'Kênh Telegram đang chạy transport thử nghiệm (stub) — chưa cấu hình TELEGRAM_GATEWAY_TRANSPORT trên máy chủ.'
    );
    err.code = 'TELEGRAM_STUB_TRANSPORT';
    throw err;
  }
  if (!telegramGateway.isConfigured()) {
    const err = new Error('Cổng Telegram chưa được cấu hình (thiếu TELEGRAM_GATEWAY_SECRET).');
    err.code = 'TELEGRAM_GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  assertOwnerPresent(userId, node?.id);
  const accountId = node?.config?.telegramAccountId;
  const account = accountId
    ? await chatbotTelegramRepository.getAccountById(accountId, { userId })
    : null;
  if (!account || account.is_active === false) {
    const err = new Error(
      `Chưa chọn tài khoản Telegram hợp lệ, hoặc tài khoản đã ngắt kết nối (node ${node?.id}).`
    );
    err.code = 'TELEGRAM_ACCOUNT_NOT_READY';
    throw err;
  }
  // Phiên phải còn khoá đăng nhập (chỉ đọc CSDL — không dựng client/kết nối). Không log/không trả nội dung khoá.
  const session = await chatbotTelegramRepository.getSessionString(account.telegram_user_id);
  const permanentKeys = session?.authKeys?.permanent;
  const hasPermanentKey =
    permanentKeys && typeof permanentKeys === 'object' && Object.keys(permanentKeys).length > 0;
  if (!hasPermanentKey) {
    const err = new Error(
      'Phiên Telegram của tài khoản đã hết hiệu lực — vui lòng đăng nhập lại Telegram trong Cài đặt.'
    );
    err.code = 'TELEGRAM_ACCOUNT_NOT_READY';
    throw err;
  }
}

/**
 * @param {{workspaceOwnerId: number, config: object}} input
 * @returns {Promise<{accountKey: string, accountId: number, telegramUserId: number, display: string}>}
 */
async function resolveAccount({ workspaceOwnerId, config, node }) {
  assertOwnerPresent(workspaceOwnerId, node?.id);
  const accountId = config?.telegramAccountId;
  const account = await chatbotTelegramRepository.getAccountById(accountId, {
    userId: workspaceOwnerId,
  });
  if (!account) {
    const err = new Error(`Tài khoản Telegram (id=${accountId}) không tồn tại hoặc không thuộc không gian làm việc này.`);
    err.code = 'TELEGRAM_ACCOUNT_NOT_READY';
    throw err;
  }
  return {
    accountKey: String(account.id),
    accountId: account.id,
    telegramUserId: account.telegram_user_id,
    display: account.username || account.first_name || account.phone || `Telegram #${account.id}`,
  };
}

/**
 * Nguồn 'telegram_conversations' đọc thêm hội thoại ĐANG MỞ của account (kênh duy nhất cần đọc DB
 * ngoài `rows` — Telegram không gửi được người lạ theo SĐT/username, facade ép Number). Nguồn khác
 * dùng thẳng `rows` do runner đã gom theo `config.recipientSource` (manual/node/output trước).
 *
 * @param {{rows: object[], config: object, account: {accountId: number}}} input
 */
async function resolveRecipients({ rows, config, account }) {
  let candidates;
  if (config?.recipientSource === 'telegram_conversations') {
    const conversations = await chatbotTelegramRepository.listOpenConversationsForAccount(
      account.accountId
    );
    candidates = conversations.map((c) => ({
      recipientKey: String(c.external_id ?? '').trim(),
      display: c.display_name || c.external_id,
      // PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 3 — không có MỘT tên biến "tên khách"
      // cố định nào đang dùng trong mẫu tin Zalo (nội dung Zalo là văn bản tự do, tên biến do
      // người dùng/AI tự đặt; bộ dò ngữ nghĩa templateVariableAutoMap.js chấp nhận nhiều biến thể
      // ngang nhau: ten/name/ho_ten/full_name/Họ Tên...). Dùng `ten` — nằm trong danh sách biến
      // thể được bộ dò đó công nhận.
      vars: { ten: c.display_name || '' },
    }));
  } else {
    candidates = (rows || []).map((row) => {
      const recipientKey = String(row.telegramChatId ?? row.chatId ?? row.recipientKey ?? '').trim();
      return { recipientKey, display: row.display || recipientKey, vars: row.vars || {} };
    });
  }
  return candidates.filter((r) => TELEGRAM_CHAT_ID_PATTERN.test(r.recipientKey));
}

/**
 * @param {{account: {telegramUserId: number}, recipientKey: string, text: string}} input
 * @returns {Promise<{messageId: string|null}>}
 */
async function sendOne({ account, recipientKey, text }) {
  let result;
  try {
    result = await telegramGateway.sendMessage(
      account.telegramUserId,
      Number(recipientKey),
      String(text ?? '').slice(0, 4000)
    );
  } catch (err) {
    const message = String(err?.message ?? err ?? '');
    // classifyTelegramSendError là NGUỒN DUY NHẤT quyết định category (kể cả rate_limit) — sendOne
    // chỉ làm thêm một việc: khi category LÀ rate_limit, đào thêm retryAfterMs từ chuỗi. Tránh 2 nơi
    // tự phán đoán rate_limit lệch nhau (trước có 1 nhánh regex riêng ở đây, không đi qua
    // classifyTelegramSendError — một lỗi phân loại sai ở đó không lộ ra qua category cuối cùng).
    const category = classifyTelegramSendError(err);
    if (category === 'rate_limit') {
      const floodMatch = message.match(FLOOD_WAIT_PATTERN);
      const seconds = floodMatch ? Number.parseInt(floodMatch[2], 10) : NaN;
      throw new ChannelSendError('rate_limit', message, {
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
      });
    }
    throw new ChannelSendError(category, message);
  }
  return { messageId: result?.data?.messageId ?? result?.messageId ?? null };
}

/** Hợp đồng adapter yêu cầu — sendOne LUÔN ném ChannelSendError sẵn nên nhánh còn lại (lỗi từ
 * checkReadiness, hoặc lỗi lạ chưa kịp bọc) mới thật sự chạy qua bảng phân loại. */
function classifyError(err) {
  return classifyTelegramSendError(err);
}

export const telegramChannelAdapter = {
  checkReadiness,
  resolveAccount,
  resolveRecipients,
  sendOne,
  classifyError,
};

export default telegramChannelAdapter;
