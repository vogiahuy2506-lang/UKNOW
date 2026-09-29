/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4a — Adapter WhatsApp (Baileys QR) cho chiến dịch.
 *
 * Khuôn `telegram.campaignChannel.js`; đăng ký qua `campaignChannelRegistry.service.js` sau cờ
 * `CAMPAIGN_CHANNEL_WHATSAPP_ENABLED` (TẮT mặc định).
 *
 * **Khác Telegram**: WhatsApp gửi được SỐ LẠ (không cần hội thoại mở) nên người nhận có 3 nguồn:
 * `whatsapp_conversations` (khách đã nhắn tới phiên), `manual` (nhập SĐT), `node` (cột SĐT của khối dữ liệu).
 *
 * **Không có lớp `{data}`** như `telegramGateway.client.js wrap` — gọi thẳng `whatsappBaileys.service`
 * (dynamic import: service đó chạy `hydrateProfileCache()` (đọc DB) ngay khi import, không được kéo vào
 * chuỗi import của registry/preflight).
 *
 * **Baileys (đã đọc node_modules/@whiskeysockets/baileys 6.7.x)**:
 * - `sock.onWhatsApp(...jids)` (Socket/chats.js:148-159) trả `[{jid, exists, lid}]` nhưng đã lọc
 *   `.filter(a => !!a.contact)` → số KHÔNG dùng WhatsApp = mảng rỗng (không có `{exists:false}`).
 * - Lỗi là `Boom`: mất kết nối `Connection Closed` (428, Socket/socket.js:56,84,269), `Connection Terminated`,
 *   `Connection was lost` (408), đăng xuất `Intentional Logout`/401 (:349), `Connection Failure` (statusCode = mã
 *   lý do, vd 403 khoá số; :515), `Timed Out` (408, Utils/generics.js:131); lỗi IQ dạng
 *   `Boom(text, {data: +code})` (WABinary/generic-utils.js:46) với text `rate-overlimit`(429)/`not-authorized`/
 *   `item-not-found`(404)/`forbidden`(403) — mã nằm ở `err.data` (số), KHÔNG ở statusCode.
 *   `whatsappBaileys.sendMessage` tự ném `WhatsApp session X is not connected` khi phiên không mở.
 */

import { ChannelSendError } from '../campaignChannelRegistry.service.js';
import whatsappCampaignConversationRepository, {
  extractPhoneFromExternalId,
} from '../../../repositories/chatbot/whatsappCampaignConversation.repository.js';
import { isPhoneHeader } from '../../../utils/columnHeaderMatch.util.js';
import channelAccountSettingsRepository from '../../../repositories/campaign/channelAccountSettings.repository.js';
import {
  CHANNEL_MEDIA_LIMIT_ERROR_CODE,
  WHATSAPP_IMAGE_EXTENSIONS,
  assertAttachmentListWithinLimits,
  extractStepAttachments,
  prepareChannelAttachmentSources,
  resolveAttachmentsForSend,
} from '../../../utils/channelMediaSend.util.js';

/** SĐT hợp lệ sau chuẩn hoá: chỉ chữ số, 8-15 ký tự — CÙNG quy tắc với FE (hợp đồng W4a/W4b mục 4). */
const WHATSAPP_PHONE_PATTERN = /^\d{8,15}$/;
const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TEXT_LENGTH = 4096;

/** Tên cột SĐT quen thuộc — cùng bộ khối Zalo cá nhân dò (campaignRun.service.js ~5446-5452). */
const KNOWN_PHONE_FIELDS = [
  'phone', 'sdt', 'phoneNumber', 'phone_number', 'zaloPhone', 'zalo_phone', 'mobile',
  'mobilePhone', 'mobile_phone', 'phoneNo', 'phone_no', 'contactPhone', 'contact_phone',
  'so_dien_thoai',
];

const AUTH_ERROR_SUBSTRINGS = [
  'is not connected',
  'Connection Closed',
  'Connection Terminated',
  'Connection was lost',
  'Connection Failure',
  'logged out',
  'Intentional Logout',
  'Not authenticated',
];
const RATE_LIMIT_SUBSTRINGS = ['rate-overlimit', 'rate limit', 'too many'];
const HARD_ERROR_SUBSTRINGS = ['not-authorized', 'forbidden', 'item-not-found', 'Số không dùng WhatsApp'];
const TRANSIENT_ERROR_SUBSTRINGS = ['Timed Out', 'timeout', 'ECONNRESET', 'ETIMEDOUT'];

const DEFAULT_RATE_LIMIT_RETRY_MS = 15 * 60 * 1000;

function numericStatusOf(err) {
  const candidates = [err?.output?.statusCode, err?.statusCode, err?.status, err?.data];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

/**
 * Chuẩn hoá SĐT: chỉ chữ số; `0…` (VN) → `84…`. Trả null nếu không hợp lệ `/^\d{8,15}$/`.
 * KHÔNG dùng normalizePhoneForZaloCampaign (đổi 84→0, ngược chiều).
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeWhatsAppPhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('0') ? `84${digits.slice(1)}` : digits;
  return WHATSAPP_PHONE_PATTERN.test(normalized) ? normalized : null;
}

/** jid nhóm WhatsApp: `<id>@g.us` (id mới toàn số ~18 chữ số, id cũ dạng `<sđt>-<thời gian>`). */
const WHATSAPP_GROUP_JID_PATTERN = /^\d+(?:-\d+)*@g\.us$/;

/**
 * P8b — người nhận là NHÓM (jid `@g.us`). Nhóm KHÔNG đi qua `normalizeWhatsAppPhone` (jid 18 chữ số sẽ bị loại vì >15)
 * và KHÔNG được đưa vào `checkNumberExists` (`onWhatsApp` chỉ dò số điện thoại).
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isWhatsAppGroupJid(raw) {
  return WHATSAPP_GROUP_JID_PATTERN.test(String(raw ?? '').trim());
}

/** Phần tử nhóm đã chọn (`{recipientKey, display}` hoặc chuỗi jid) -> jid hợp lệ, hoặc null. */
function pickGroupJid(item) {
  const raw = item && typeof item === 'object' ? item.recipientKey : item;
  const jid = String(raw ?? '').trim();
  return isWhatsAppGroupJid(jid) ? jid : null;
}

/**
 * Phân loại lỗi gửi WhatsApp (Baileys/Boom) — chuỗi message + mã số (`output.statusCode`/`statusCode`/`data`).
 * @param {Error|string} err
 * @returns {'hard'|'transient'|'rate_limit'|'auth'|'not_configured'}
 */
export function classifyWhatsAppSendError(err) {
  if (err instanceof ChannelSendError) return err.category;
  const message = String(err?.message ?? err ?? '');
  const status = numericStatusOf(err);
  if (status === 429 || RATE_LIMIT_SUBSTRINGS.some((s) => message.includes(s))) return 'rate_limit';
  if (AUTH_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'auth';
  if (HARD_ERROR_SUBSTRINGS.some((s) => message.includes(s))) return 'hard';
  if (TRANSIENT_ERROR_SUBSTRINGS.some((s) => message.includes(s)) || status === 408) return 'transient';
  if (status === 401 || status === 428 || status === 440) return 'auth';
  if (status === 403 || status === 404) return 'hard';
  return 'hard';
}

function parseHourEnv(raw, fallback) {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

/** Policy đọc env MỖI LẦN gọi. BẢO THỦ — WhatsApp khoá số rất nhanh khi gửi số lạ hàng loạt, CHƯA có số liệu thật. */
export function buildWhatsAppPolicyFromEnv() {
  return {
    minDelayMs: Number.parseInt(process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MIN_MS, 10) || 8000,
    maxDelayMs: Number.parseInt(process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MAX_MS, 10) || 20000,
    perHourLimit: Number.parseInt(process.env.WHATSAPP_OUTBOUND_PER_HOUR_LIMIT, 10) || 60,
    quietHours: {
      startHour: parseHourEnv(process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_START, 23),
      endHour: parseHourEnv(process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_END, 6),
    },
  };
}

function notReady(message) {
  const err = new Error(message);
  err.code = 'WHATSAPP_ACCOUNT_NOT_READY';
  return err;
}

function noRecipients(message) {
  const err = new Error(message);
  err.code = 'WHATSAPP_NO_RECIPIENTS';
  return err;
}

function assertOwnerPresent(ownerId, nodeId) {
  if (ownerId == null || String(ownerId).trim() === '' || Number(ownerId) <= 0) {
    throw notReady(`Không xác định được chủ chiến dịch để kiểm tài khoản WhatsApp (node ${nodeId ?? '?'}).`);
  }
}

/**
 * Phiên phải thuộc chủ workspace: session_key = "<userId>-<shortKey>" (chủ = tiền tố). Khác chủ → cùng
 * thông báo với "không có phiên" — không lộ phiên đó có tồn tại hay không.
 */
function assertSessionOwnedBy(ownerId, sessionKey) {
  const key = String(sessionKey ?? '').trim();
  if (!key || !SESSION_KEY_PATTERN.test(key) || !key.startsWith(`${Number(ownerId)}-`)) {
    throw notReady('Chưa chọn tài khoản WhatsApp hợp lệ cho khối gửi này.');
  }
  return key;
}

/**
 * P6 (PLAN_TG_WA_DAY_DU) — phiên bị khoá do vượt hạn mức gói (hạ gói / slot mua thêm hết hạn) thì không dùng để gửi.
 * Dùng ở CẢ preflight lẫn lúc chạy (`resolveAccount`), nên chặn cả chiến dịch lẫn gửi nhanh.
 */
async function assertSessionNotLocked(sessionKey) {
  const { whatsappSessionIsLocked, CHANNEL_ACCOUNT_LOCKED_MESSAGE } = await import('../../../utils/topupLockGate.util.js');
  if (await whatsappSessionIsLocked(sessionKey)) {
    const err = new Error(CHANNEL_ACCOUNT_LOCKED_MESSAGE);
    err.code = 'WHATSAPP_ACCOUNT_LOCKED';
    throw err;
  }
}

async function loadWhatsAppService() {
  return import('../../chatbot/whatsappBaileys.service.js');
}

/** Lấy SĐT từ một dòng dữ liệu: cột người dùng chọn → recipientKey → tên cột quen thuộc → cột nhận diện theo tiêu đề. */
function pickPhoneFromRow(row, config) {
  if (row == null) return null;
  if (typeof row !== 'object') return normalizeWhatsAppPhone(row);
  // Chỉ nguồn 'node' dùng recipientColumn (config cũ của nguồn khác có thể còn sót giá trị).
  const explicit = config?.recipientSource === 'node' ? String(config?.recipientColumn ?? '').trim() : '';
  // Người dùng ĐÃ chọn cột SĐT → chỉ đọc cột đó (ô trống = bỏ dòng, KHÔNG rơi sang cột khác: sẽ nhắn nhầm số).
  const orderedKeys = explicit
    ? [explicit]
    : ['recipientKey', ...KNOWN_PHONE_FIELDS, ...Object.keys(row).filter((k) => isPhoneHeader(k))];
  for (const key of orderedKeys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') {
      const phone = normalizeWhatsAppPhone(value);
      if (phone) return phone;
    }
  }
  return null;
}

function parseManualPhones(config) {
  const raw = config?.recipientKeys;
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/);
  const phones = new Set();
  for (const item of list) {
    const phone = pickPhoneFromRow(item, null);
    if (phone) phones.add(phone);
  }
  return [...phones];
}

/**
 * Preflight — throw SỚM (400 ở campaignPreflight.service.js).
 * @param {{userId: number, node: object}} input `userId` = chủ workspace.
 */
async function checkReadiness({ userId, node }) {
  assertOwnerPresent(userId, node?.id);
  const config = node?.config || {};
  const sessionKey = assertSessionOwnedBy(userId, config.whatsappSessionKey);
  await assertSessionNotLocked(sessionKey);
  const { getSession } = await loadWhatsAppService();
  const session = getSession(sessionKey);
  if (!session || session.status !== 'open') {
    throw notReady('Tài khoản WhatsApp chưa kết nối — quét lại QR trong Quản lý kênh gửi.');
  }
  if (config.recipientSource === 'whatsapp_conversations') {
    const conversations = await whatsappCampaignConversationRepository
      .listOpenWhatsAppConversationsForSession(Number(userId), sessionKey);
    if (!conversations || conversations.length === 0) {
      throw noRecipients(
        "Tài khoản WhatsApp này chưa có hội thoại nào đang mở — chưa có ai để gửi. Chọn 'Nhập SĐT', hoặc đợi khách nhắn tới tài khoản trước."
      );
    }
  } else if (config.recipientSource === 'whatsapp_groups') {
    const raw = config.recipientKeys;
    const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/);
    if (!list.some((item) => pickGroupJid(item))) {
      throw noRecipients('Chưa chọn nhóm WhatsApp nào — chọn ít nhất một nhóm để gửi.');
    }
  } else if (config.recipientSource === 'manual') {
    if (parseManualPhones(config).length === 0) {
      throw noRecipients(
        'Danh sách số điện thoại trống hoặc không có số hợp lệ (chỉ nhận 8-15 chữ số, ví dụ 84912345678 hoặc 0912345678) — chưa có ai để gửi.'
      );
    }
  }
  // Nguồn 'node'/mặc định: người nhận lấy từ node phía trước lúc chạy — runner có lưới CHANNEL_NO_RECIPIENTS.
  assertStepAttachmentsWithinLimits(node);
}

/**
 * P5 — báo SỚM (preflight) khi một bước đính kèm vượt giới hạn số ảnh/tài liệu/dung lượng khai báo, thay vì để MỌI
 * người nhận đều lỗi lúc gửi. Dung lượng kiểm theo trường `size` của metadata; byte thật vẫn được kiểm lại lúc gửi.
 */
function assertStepAttachmentsWithinLimits(node) {
  for (const attachments of extractStepAttachments(node?.config)) {
    try {
      assertAttachmentListWithinLimits(attachments, WHATSAPP_IMAGE_EXTENSIONS);
    } catch (limitErr) {
      throw notReady(`${limitErr.message} (node ${node?.id ?? '?'})`);
    }
  }
}

/**
 * @param {{workspaceOwnerId: number, config: object, node?: object}} input
 * @returns {Promise<{accountKey: string, sessionKey: string, display: string}>}
 */
async function resolveAccount({ workspaceOwnerId, config, node }) {
  assertOwnerPresent(workspaceOwnerId, node?.id);
  const sessionKey = assertSessionOwnedBy(workspaceOwnerId, config?.whatsappSessionKey);
  await assertSessionNotLocked(sessionKey);
  const { getSession } = await loadWhatsAppService();
  const session = getSession(sessionKey);
  return {
    accountKey: sessionKey,
    sessionKey,
    display: session?.userName || sessionKey,
    // P5 — để sendOne gửi đính kèm mà runner không phải truyền thêm: chủ workspace (lọc tệp theo chủ), đính kèm
    // từng bước, và cache đọc tệp MỘT node (một tệp gửi nhiều người chỉ đọc kho 1 lần).
    ownerUserId: workspaceOwnerId,
    stepAttachments: extractStepAttachments(config),
    attachmentCache: new Map(),
  };
}

/**
 * @param {{rows: object[], config: object, account: {sessionKey: string}}} input
 * @returns {Promise<Array<{recipientKey: string, display: string, vars: object}>>}
 */
async function resolveRecipients({ rows, config, account }) {
  const candidates = [];
  if (config?.recipientSource === 'whatsapp_conversations') {
    const ownerUserId = Number.parseInt(String(account.sessionKey).split('-')[0], 10);
    const conversations = await whatsappCampaignConversationRepository
      .listOpenWhatsAppConversationsForSession(ownerUserId, account.sessionKey);
    for (const c of conversations) {
      const phone = normalizeWhatsAppPhone(extractPhoneFromExternalId(c.external_id));
      if (!phone) continue;
      candidates.push({
        recipientKey: phone,
        display: c.visitor_name || phone,
        // `ten` nằm trong danh sách biến thể mà bộ dò templateVariableAutoMap.js công nhận (như Telegram).
        vars: { ten: c.visitor_name || '' },
      });
    }
  } else if (config?.recipientSource === 'whatsapp_groups') {
    // P8b — nhóm đã chọn: giữ NGUYÊN jid (không chuẩn hoá SĐT). `isGroup` để runner bỏ qua consent/journey (chỉ dành cho SĐT).
    for (const row of rows || []) {
      const jid = pickGroupJid(row);
      if (!jid) continue;
      const isObject = row && typeof row === 'object';
      candidates.push({
        recipientKey: jid,
        display: (isObject && row.display) || jid,
        vars: (isObject && row.vars) || {},
        isGroup: true,
      });
    }
  } else {
    for (const row of rows || []) {
      const phone = pickPhoneFromRow(row, config);
      if (!phone) continue;
      const isObject = row && typeof row === 'object';
      candidates.push({
        recipientKey: phone,
        display: (isObject && row.display) || phone,
        vars: (isObject && row.vars) || {},
      });
    }
  }
  // Khử trùng theo phone: nhiều chatbot = nhiều dòng hội thoại cùng một khách; nguồn khác có thể lặp số.
  const seen = new Set();
  return candidates.filter((r) => {
    if (seen.has(r.recipientKey)) return false;
    seen.add(r.recipientKey);
    return true;
  });
}

function toChannelSendError(err) {
  const message = String(err?.message ?? err ?? '');
  const category = classifyWhatsAppSendError(err);
  if (category === 'rate_limit') {
    return new ChannelSendError('rate_limit', message, { retryAfterMs: DEFAULT_RATE_LIMIT_RETRY_MS });
  }
  return new ChannelSendError(category, message);
}

/**
 * Kiểm số CÓ WhatsApp NGAY TRƯỚC khi gửi số này (không dò hàng loạt cả danh sách — WhatsApp tính là dò số).
 * @param {{account: {sessionKey: string}, recipientKey: string, text: string}} input
 * @returns {Promise<{messageId: string|null}>}
 */
async function sendOne({ account, recipientKey, text, stepIndex, attachments }) {
  const whatsapp = await loadWhatsAppService();
  try {
    // P8b — nhóm (jid @g.us): gửi thẳng, KHÔNG dò số. Người nhận thường: dò ngay trước khi gửi.
    if (!isWhatsAppGroupJid(recipientKey)) {
      const exists = await whatsapp.checkNumberExists(account.sessionKey, recipientKey);
      if (exists === false) {
        throw new ChannelSendError('hard', 'Số không dùng WhatsApp');
      }
    }
    const attachmentList = resolveAttachmentsForSend({ account, stepIndex, attachments });
    if (attachmentList.length > 0) {
      const sources = await prepareChannelAttachmentSources(attachmentList, {
        ownerUserId: account.ownerUserId,
        cache: account.attachmentCache,
      });
      if (sources.length < attachmentList.length) {
        // Giống chiến dịch Zalo: tệp template hỏng/mất -> vẫn gửi phần đọc được (không dừng cả đợt vì một tệp).
        console.warn(`[WhatsAppCampaignChannel] bỏ qua ${attachmentList.length - sources.length} tệp đính kèm không đọc được`);
      }
      // Import trễ: whatsapp.adapter kéo theo whatsappBaileys.service (hydrate DB lúc import) — như loadWhatsAppService.
      const { sendWhatsAppBaileysMessageWithMedia } = await import('../../chatbot/channelAdapters/whatsapp.adapter.js');
      const sent = await sendWhatsAppBaileysMessageWithMedia({
        sessionKey: account.sessionKey,
        phone: recipientKey,
        text,
        sources,
      });
      if (sent.error) {
        // Khách ĐÃ nhận một phần (tin đầu đã tới) -> tính là đã gửi 1 lượt; runner chỉ ghi messageId tin đầu.
        console.warn(`[WhatsAppCampaignChannel] tệp sau tin đầu thất bại (đã gửi ${sent.sentCount}): ${sent.error.message}`);
        return { messageId: sent.firstMessageId, sentCount: sent.sentCount, partialError: String(sent.error.message) };
      }
      return { messageId: sent.firstMessageId, sentCount: sent.sentCount };
    }
    const result = await whatsapp.sendMessage(
      account.sessionKey,
      recipientKey,
      String(text ?? '').slice(0, MAX_TEXT_LENGTH)
    );
    return { messageId: result?.key?.id ?? null };
  } catch (err) {
    if (err instanceof ChannelSendError) throw err;
    if (err?.code === CHANNEL_MEDIA_LIMIT_ERROR_CODE) throw new ChannelSendError('hard', String(err.message));
    throw toChannelSendError(err);
  }
}

function classifyError(err) {
  return classifyWhatsAppSendError(err);
}

/**
 * P4 (PLAN_TG_WA_DAY_DU) — cấu hình gửi theo TÀI KHOẢN (trần/ngày + ghi đè giãn cách, migration 267; bảng
 * `whatsapp_account_settings`, khoá sessionKey). Runner đọc MỘT lần mỗi lượt chạy node; gửi nhanh đọc mỗi request.
 * @param {{account: {sessionKey: string}, workspaceOwnerId: number}} input
 */
async function getAccountSendSettings({ account, workspaceOwnerId }) {
  return channelAccountSettingsRepository.getSendSettings('whatsapp', account.sessionKey, workspaceOwnerId);
}

function mapSessionStatus(status) {
  if (status === 'open') return 'open';
  if (status === 'connecting') return 'connecting';
  return 'offline';
}

/**
 * Danh sách tài khoản WhatsApp của CHỦ workspace cho trình dựng chiến dịch (endpoint mục 4 hợp đồng).
 * Không lộ SĐT chủ (`userId`/JID) — chỉ `display` = tên WhatsApp hoặc sessionKey.
 *
 * @param {number} ownerUserId
 * @returns {Promise<Array<{sessionKey: string, display: string, status: 'open'|'offline'|'connecting', openConversationCount: number}>>}
 */
export async function listWhatsAppAccountsForOwner(ownerUserId) {
  const owner = Number(ownerUserId);
  if (!Number.isInteger(owner) || owner <= 0) return [];
  const { listPersistedSessions, getSession } = await loadWhatsAppService();
  const allKeys = await listPersistedSessions();
  const ownKeys = (allKeys || []).filter(
    (key) => SESSION_KEY_PATTERN.test(String(key)) && String(key).startsWith(`${owner}-`)
  );
  if (ownKeys.length === 0) return [];
  const counts = await whatsappCampaignConversationRepository
    .countOpenConversationsBySessionKeys(owner, ownKeys);
  return ownKeys.map((sessionKey) => {
    const session = getSession(sessionKey);
    return {
      sessionKey,
      display: session?.userName || sessionKey,
      status: mapSessionStatus(session?.status),
      openConversationCount: counts.get(sessionKey) ?? 0,
    };
  });
}

export const whatsappChannelAdapter = {
  checkReadiness,
  resolveAccount,
  resolveRecipients,
  sendOne,
  classifyError,
  getAccountSendSettings,
};

export default whatsappChannelAdapter;
