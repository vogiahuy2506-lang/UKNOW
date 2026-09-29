/**
 * P8b (PLAN_TG_WA_DAY_DU) — "Chạy thử" trong trình dựng cho node `send_telegram` / `send_whatsapp`: GỬI THẬT tối đa
 * MỘT tin cho người nhận đầu tiên qua `POST /campaigns/quick-send/:channel` (đã có đủ cổng: hạn mức gói, trần/ngày, nhịp
 * gửi, khoá tài khoản, consent, nhật ký `is_preview`). Trước đây node bị bỏ qua (`dry_run_not_supported`).
 *
 * Trần 1 người (chặt hơn Zalo = 3): tin thử là gửi thật cho khách thật và Telegram/WhatsApp chưa có số liệu ngưỡng an toàn.
 *
 * Không gửi lại khi lỗi: lỗi TRƯỚC khi gọi API (thiếu tài khoản/nội dung/người nhận) được ném để trình chạy báo lỗi (an
 * toàn thử lại vì chưa gửi gì); lỗi SAU khi đã gọi API (HTTP 4xx/5xx, mạng) được trả về dạng item `failed` — KHÔNG ném,
 * vì trình chạy node tự thử lại node khi ném lỗi và sẽ gửi thật lần hai.
 */
import { deriveVariablesForText } from './templateVariableAutoMap.js';
import { resolveItemField } from './campaignBuilderRuntime.js';
import { normalizeWhatsAppPhone, parseWhatsAppPhoneList } from './nodeConfigModal.helpers.js';
import { generateIdempotencyKey } from '../../../utils/idempotency.util.js';

/** Số người gửi THẬT tối đa khi chạy thử một node Telegram/WhatsApp. */
export const TEST_RUN_MAX_SEND_ADAPTER = 1;

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;
const WHATSAPP_GROUP_JID_PATTERN = /^\d+(?:-\d+)*@g\.us$/;

const CHANNELS = {
  send_telegram: { channel: 'telegram', label: 'Telegram' },
  send_whatsapp: { channel: 'whatsapp', label: 'WhatsApp' },
};

/** Danh sách nhóm đã chọn ([{recipientKey, display}] hoặc chuỗi) -> [{recipientKey, display}] hợp lệ theo `pattern`. */
function pickSelectedGroups(raw, pattern) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    const key = String((item && typeof item === 'object' ? item.recipientKey : item) ?? '').trim();
    if (!pattern.test(key) || seen.has(key)) return;
    seen.add(key);
    result.push({ recipientKey: key, display: (item && typeof item === 'object' && item.display) || key });
  });
  return result;
}

/** Hội thoại đang mở của tài khoản (cùng API gửi nhanh) -> [{recipientKey, display}]; `name` dùng cho `{{ten}}` phía server. */
async function loadConversationRecipients({ apiService, channel, accountRef, signal }) {
  const response = await apiService.getQuickSendAdapterConversations(channel, accountRef, signal ? { signal } : {});
  const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
  return rows
    .map((row) => ({ recipientKey: String(row?.recipientKey ?? '').trim(), display: row?.name || String(row?.recipientKey ?? '') }))
    .filter((row) => row.recipientKey);
}

/** Người nhận theo nguồn đã cấu hình trên node — CÙNG quy tắc nguồn như backend (`resolveRecipientRows` + adapter). */
async function resolveCandidates({ nodeType, config, ctx, apiService, accountRef, signal }) {
  const { channel } = CHANNELS[nodeType];
  const source = config.recipientSource;

  if (nodeType === 'send_telegram') {
    if (source === 'telegram_groups') return pickSelectedGroups(config.recipientKeys, TELEGRAM_CHAT_ID_PATTERN);
    if (source === 'manual') {
      const raw = Array.isArray(config.recipientKeys) ? config.recipientKeys : String(config.recipientKeys ?? '').split(/[\n,]+/);
      return pickSelectedGroups(raw.map((v) => String(v ?? '').trim()), TELEGRAM_CHAT_ID_PATTERN);
    }
    return loadConversationRecipients({ apiService, channel, accountRef, signal });
  }

  // WhatsApp
  if (source === 'whatsapp_groups') return pickSelectedGroups(config.recipientKeys, WHATSAPP_GROUP_JID_PATTERN);
  if (source === 'manual') {
    return parseWhatsAppPhoneList(config.recipientKeys).valid.map((phone) => ({ recipientKey: phone, display: phone }));
  }
  if (source === 'node') {
    const sourceNodeId = String(config.recipientNodeId || '').trim();
    const column = String(config.recipientColumn || '').trim();
    const items = Array.isArray(ctx?.nodeResultsById?.[sourceNodeId]?.output?.items)
      ? ctx.nodeResultsById[sourceNodeId].output.items
      : [];
    const seen = new Set();
    const result = [];
    items.forEach((row) => {
      const phone = normalizeWhatsAppPhone(resolveItemField(row, column));
      if (!phone || seen.has(phone)) return;
      seen.add(phone);
      result.push({ recipientKey: phone, display: phone, row });
    });
    return result;
  }
  return loadConversationRecipients({ apiService, channel, accountRef, signal });
}

/**
 * @param {object} input
 * @param {'send_telegram'|'send_whatsapp'} input.nodeType
 * @param {object} input.node
 * @param {object} input.ctx ngữ cảnh chạy (`nodeResultsById`)
 * @param {object} input.apiService cần `sendQuickAdapterMessage`, `getQuickSendAdapterConversations`
 * @param {AbortSignal} [input.signal]
 * @param {Function} [input.onProgress]
 * @param {Function} [input.isRunCancelledError]
 * @param {Function} input.buildSchemaFromRows
 * @returns {Promise<{input: object, output: object}>}
 */
export async function runAdapterChannelTestSend({
  nodeType,
  node,
  ctx,
  apiService,
  signal,
  onProgress,
  isRunCancelledError,
  buildSchemaFromRows,
}) {
  const { channel, label } = CHANNELS[nodeType];
  const config = node.data?.config || {};
  const accountField = channel === 'whatsapp' ? 'sessionKey' : 'accountId';
  const accountRef = String((channel === 'whatsapp' ? config.whatsappSessionKey : config.telegramAccountId) ?? '').trim();
  if (!accountRef) throw new Error(`Chưa chọn tài khoản ${label} cho node này.`);

  const step = Array.isArray(config.steps) ? config.steps[0] : null;
  const rawMessage = String(step?.message ?? '').trim();
  if (!rawMessage) throw new Error(`Node ${label} chưa có nội dung tin nhắn.`);

  const candidates = await resolveCandidates({ nodeType, config, ctx, apiService, accountRef, signal });
  if (candidates.length === 0) {
    throw new Error(`Không có người nhận nào để gửi thử ở node ${label} — kiểm tra nguồn người nhận và tài khoản gửi.`);
  }
  const selected = candidates.slice(0, TEST_RUN_MAX_SEND_ADAPTER);

  if (typeof onProgress === 'function') {
    onProgress({
      status: 'info',
      message: candidates.length > TEST_RUN_MAX_SEND_ADAPTER
        ? `Chạy thử gửi THẬT ${TEST_RUN_MAX_SEND_ADAPTER} tin cho người đầu tiên (danh sách có ${candidates.length} người) — dùng "Chạy ngay" để gửi cả danh sách.`
        : `Chạy thử gửi THẬT ${selected.length} tin cho ${selected[0].display}.`,
    });
  }

  const attachments = (Array.isArray(step?.attachments) ? step.attachments : [])
    .filter((a) => a?.key)
    .map((a) => ({
      key: a.key,
      ...(a.originalName ? { originalName: a.originalName } : {}),
      ...(a.displayName ? { displayName: a.displayName } : {}),
      ...(a.name ? { name: a.name } : {}),
      ...(a.size ? { size: a.size } : {}),
    }));

  const items = [];
  for (const recipient of selected) {
    // Dòng dữ liệu của khối phía trước: điền {{biến}} theo cột ngay tại đây (server chỉ biết {{ten}} của hội thoại).
    // Người nhận không có dòng dữ liệu: giữ nguyên nội dung, server tự điền {{ten}} nếu là hội thoại đang mở.
    let message = rawMessage;
    if (recipient.row && message.includes('{{')) {
      const { variables } = deriveVariablesForText(message, { entry: { row: recipient.row } });
      message = message.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
        const value = variables?.[key];
        return value === undefined || value === null ? '' : String(value);
      });
    }

    let item;
    try {
      const response = await apiService.sendQuickAdapterMessage(channel, {
        [accountField]: accountRef,
        recipientKey: recipient.recipientKey,
        message,
        ...(attachments.length > 0 ? { attachments } : {}),
      }, { signal, idempotencyKey: generateIdempotencyKey() });
      item = response?.data?.data?.item || { status: 'failed', error: 'Không nhận được kết quả gửi.' };
    } catch (error) {
      if ((typeof isRunCancelledError === 'function' && isRunCancelledError(error))
        || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        throw error;
      }
      item = {
        status: 'failed',
        errorCode: error?.response?.data?.code || null,
        error: error?.response?.data?.message || error?.message || 'Gửi thử thất bại.',
      };
    }

    const status = item.status || 'failed';
    items.push({ ...item, recipientKey: recipient.recipientKey, display: recipient.display, message, status });
    // Bị hoãn/thất bại: dừng luôn, không thử người kế (cùng tài khoản gần như chắc chắn cũng bị hoãn/lỗi).
    if (status !== 'success') break;
  }

  return {
    input: {
      channel,
      [accountField]: accountRef,
      recipientSource: config.recipientSource || null,
      message: rawMessage,
    },
    output: {
      items,
      schema: buildSchemaFromRows(items),
      meta: {
        attempted: items.length,
        sent: items.filter((i) => i.status === 'success').length,
        failed: items.filter((i) => i.status === 'failed').length,
        deferred: items.filter((i) => i.status === 'deferred').length,
        totalItems: candidates.length,
        totalAvailable: candidates.length,
        limitedTo: TEST_RUN_MAX_SEND_ADAPTER,
        realSend: true,
      },
    },
  };
}
