/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-3 — runner chung cho kênh "adapter" (Telegram/WhatsApp
 * từ PR-6+). Chạy INLINE trong engine (một tiến trình duy nhất, xem mục 5 Bẫy của plan) — KHÔNG
 * thêm worker/queue riêng, KHÔNG dùng zaloRateLimiter/enforceOutboundPolicyBeforeSend (đó là state
 * riêng của 4 kênh legacy), KHÔNG ghi zalo_messages/email_messages (bảng riêng
 * campaign_channel_messages, PR-2).
 */
import { recordAdapterSentJourney } from './campaignChannelJourney.service.js';
import campaignChannelMessageRepository from '../../repositories/campaign/campaignChannelMessage.repository.js';
import { renderTemplateText, neutralizeUnresolvedTemplateVariables } from '../../utils/templateVariableAutoMap.util.js';
import { ChannelSendError } from './campaignChannelRegistry.service.js';
import { resolveStepDelayMs } from '../../utils/channelSteps.util.js';
import zaloCampaignRecipientService from './zaloCampaignRecipient.service.js';
import campaignShutdownGate from './campaignShutdownGate.js';
import { checkAccountDailyLimit } from '../quota/accountDailyLimit.service.js';
import { debitAdapterMessageIfNeeded } from '../payment/topupWallet.service.js';
import { applyAccountDelayOverride } from '../../utils/channelSendSpeed.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
} from '../quota/sendQuotaReservation.service.js';
import { buildCampaignReservationKey, computeRequestFingerprint } from '../quota/sendQuotaKey.service.js';

const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PER_HOUR_MAX_WAIT_MS = 60 * 1000;
// Review PR-5 — rate_limit PHÁT SINH KHI GỬI (sendOne ném, vd Telegram FLOOD_WAIT) cũng phải defer như
// rate_limit chủ động. Nhà cung cấp cho biết chờ bao lâu thì dùng (ChannelSendError.retryAfterMs), không thì
// 15 phút; trần 24h để một con số lạ từ nhà cung cấp không treo run nhiều ngày.
const REACTIVE_RATE_LIMIT_DEFAULT_WAIT_MS = 15 * 60 * 1000;
const REACTIVE_RATE_LIMIT_MAX_WAIT_MS = 24 * HOUR_MS;

// P2 (PLAN_TG_WA_DAY_DU 29/09) — lỗi TẠM (transient: timeout/ECONNRESET…) thử lại TRONG CÙNG LƯỢT, không bỏ cuộc
// ngay như v1. Đọc env LÚC GỌI (test đổi giữa các ca). Chờ nhân đôi mỗi lần: 30s -> 60s -> (lần 3 là lần cuối).
// KHÁC rate_limit (resolveReactiveRateLimitWaitMs ở dưới: dừng node + defer) — đừng gộp hai đường.
const TRANSIENT_MAX_ATTEMPTS_DEFAULT = 3;
const TRANSIENT_RETRY_MS_DEFAULT = 30 * 1000;
// Nhãn error_category của một lần thử transient ĐÃ được thử lại (cột varchar(40); bảng không có cột meta và
// không có status 'aborted' — migration 255): báo cáo lỗi chỉ đếm dòng KHÁC nhãn này (= lỗi cuối cùng).
export const TRANSIENT_RETRY_CATEGORY = 'transient_retry';

export function resolveTransientMaxAttempts() {
  const value = Number.parseInt(process.env.CHANNEL_TRANSIENT_MAX_ATTEMPTS, 10);
  return Number.isInteger(value) && value >= 1 ? value : TRANSIENT_MAX_ATTEMPTS_DEFAULT;
}

export function resolveTransientRetryBaseMs() {
  const value = Number.parseInt(process.env.CHANNEL_TRANSIENT_RETRY_MS, 10);
  return Number.isInteger(value) && value >= 0 ? value : TRANSIENT_RETRY_MS_DEFAULT;
}

function resolveReactiveRateLimitWaitMs(sendError) {
  const hinted = Number.parseInt(sendError?.retryAfterMs, 10);
  const waitMs = Number.isFinite(hinted) && hinted > 0 ? hinted : REACTIVE_RATE_LIMIT_DEFAULT_WAIT_MS;
  return Math.min(waitMs, REACTIVE_RATE_LIMIT_MAX_WAIT_MS);
}

/**
 * Có đang trong khung giờ yên lặng (giờ Việt Nam, dịch UTC+7) không — hàm THUẦN để unit test
 * được, khuôn `zaloRateLimiter.js` `computeNextAllowedSendAtByQuietHours` (:174-189, có vắt nửa
 * đêm khi startHour > endHour).
 *
 * @param {number} nowMs
 * @param {{startHour: number, endHour: number}|null} [quietHours]
 * @returns {boolean}
 */
export function isWithinQuietHours(nowMs, quietHours) {
  if (!quietHours) return false;
  const { startHour, endHour } = quietHours;
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour === endHour) return false;
  const shifted = new Date(nowMs + VN_UTC_OFFSET_MS);
  const hour = shifted.getUTCHours();
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // Vắt nửa đêm (vd 23 -> 6): trong khung khi hour >= 23 HOẶC hour < 6.
  return hour >= startHour || hour < endHour;
}

/**
 * Còn bao lâu (ms) tới giờ KẾT THÚC khung yên lặng hiện tại (giờ Việt Nam) — PR-5, dùng để gắn
 * `error.waitMs` cho CHANNEL_QUIET_HOURS (engine defer thay vì run failed). Hàm THUẦN, dịch UTC+7
 * như `isWithinQuietHours`, có vắt nửa đêm. Giả định gọi ĐÚNG lúc đang trong khung — nếu không thì
 * trả 0 (không có gì phải chờ).
 *
 * @param {number} nowMs
 * @param {{startHour: number, endHour: number}|null} [quietHours]
 * @returns {number}
 */
export function computeQuietHoursWaitMs(nowMs, quietHours) {
  if (!isWithinQuietHours(nowMs, quietHours)) return 0;
  const { startHour, endHour } = quietHours;
  const shifted = new Date(nowMs + VN_UTC_OFFSET_MS);
  const hour = shifted.getUTCHours();
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  // Vắt nửa đêm (startHour > endHour) mà đang ở nửa TRƯỚC nửa đêm (hour >= startHour) thì giờ kết
  // thúc rơi vào NGÀY MAI; còn lại (hour < endHour) thì giờ kết thúc cùng ngày hôm nay.
  const addDays = (startHour > endHour && hour >= startHour) ? 1 : 0;
  const targetShiftedMs = Date.UTC(year, month, day + addDays, endHour, 0, 0, 0);
  const targetRealMs = targetShiftedMs - VN_UTC_OFFSET_MS;
  return Math.max(0, targetRealMs - nowMs);
}

/**
 * Cửa sổ trượt perHourLimit trong RAM theo (channel, accountKey) — sống suốt tiến trình, KHÔNG
 * persist DB (đủ dùng vì "một tiến trình duy nhất" chạy engine, xem mục 5 Bẫy plan).
 * @type {Map<string, number[]>}
 */
const sendTimestampsByKey = new Map();

function pruneAndGetTimestamps(key, nowMs) {
  const list = (sendTimestampsByKey.get(key) || []).filter((t) => nowMs - t < HOUR_MS);
  sendTimestampsByKey.set(key, list);
  return list;
}

function recordSendTimestamp(key, nowMs) {
  const list = sendTimestampsByKey.get(key) || [];
  list.push(nowMs);
  sendTimestampsByKey.set(key, list);
}

/**
 * Còn phải chờ bao lâu (ms) trước khi được gửi tiếp theo perHourLimit — 0 nếu chưa chạm trần.
 *
 * @param {string} key `${channel}::${accountKey}`
 * @param {number} perHourLimit 0/undefined = không giới hạn
 * @param {number} nowMs
 * @returns {number}
 */
function computePerHourWaitMs(key, perHourLimit, nowMs) {
  const limit = Number.parseInt(perHourLimit, 10);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const list = pruneAndGetTimestamps(key, nowMs);
  if (list.length < limit) return 0;
  const oldestInWindow = Math.min(...list);
  return Math.max(0, (oldestInWindow + HOUR_MS) - nowMs);
}

/**
 * PLAN_GUI_NHANH_TELEGRAM_2026-09-28 Việc 1 (+ W7a tổng quát cho WhatsApp) — CỔNG NHỊP KHÔNG-NGỦ cho gửi
 * nhanh: cùng luật với bộ chạy (giờ nghỉ -> trần giờ -> giãn cách) nhưng KHÔNG ngủ; nếu chưa được gửi thì
 * trả `waitMs` để trình duyệt tự chờ/hoãn. Khoá `${descriptor.key}::${accountKey}` GIỐNG HỆT bộ chạy
 * (`perHourKey`) -> gửi nhanh và chiến dịch dùng CHUNG một cửa sổ trần giờ theo tài khoản.
 *
 * Thứ tự: giờ nghỉ (`quiet_hours`) -> trần giờ (`rate_limited`) -> giãn cách so với lần thử gần nhất
 * (`inter_message_delay`, `random(minDelayMs, maxDelayMs)`).
 *
 * Người gọi PHẢI gọi {@link recordAdapterSendAttempt} NGAY SAU khi `ok: true`, KHÔNG `await` ở giữa — hai tab
 * gửi cùng lúc mới không lọt cả hai. Khác bộ chạy (ghi SAU khi gửi thành công): gửi nhanh ghi lần thử
 * TRƯỚC khi gửi, có chủ ý — lỗi giữa chừng vẫn giữ nhịp, không cho hai request song song cùng đi qua.
 * Giới hạn v1: bộ chạy ngủ giãn cách theo lượt của nó, không nhìn dấu thời gian gửi nhanh.
 *
 * `policy` (tuỳ chọn, P4): policy ĐÃ áp ghi đè giãn cách theo tài khoản (`applyAccountDelayOverride`); thiếu thì dùng
 * `descriptor.policy` (mức env).
 *
 * @param {{descriptor: object, accountKey: string, nowMs?: number, policy?: object}} input
 * @returns {{ok: true} | {ok: false, reason: 'quiet_hours'|'rate_limited'|'inter_message_delay', waitMs: number}}
 */
export function evaluateAdapterSendGate({ descriptor, accountKey, nowMs = Date.now(), policy: policyOverride = null }) {
  const policy = policyOverride || descriptor?.policy || {};
  const key = `${descriptor.key}::${accountKey ?? ''}`;
  if (isWithinQuietHours(nowMs, policy.quietHours)) {
    return { ok: false, reason: 'quiet_hours', waitMs: computeQuietHoursWaitMs(nowMs, policy.quietHours) };
  }
  const perHourWaitMs = computePerHourWaitMs(key, policy.perHourLimit, nowMs);
  if (perHourWaitMs > 0) {
    return { ok: false, reason: 'rate_limited', waitMs: perHourWaitMs };
  }
  const timestamps = pruneAndGetTimestamps(key, nowMs);
  if (timestamps.length > 0) {
    const lastSentAt = Math.max(...timestamps);
    const delayMs = randomDelayMs(policy.minDelayMs, policy.maxDelayMs);
    const readyAt = lastSentAt + delayMs;
    if (readyAt > nowMs) {
      return { ok: false, reason: 'inter_message_delay', waitMs: readyAt - nowMs };
    }
  }
  return { ok: true };
}

/**
 * Ghi một lần thử gửi vào cửa sổ trượt dùng chung với bộ chạy (xem {@link evaluateAdapterSendGate}).
 *
 * @param {{descriptor: object, accountKey: string, nowMs?: number}} input
 */
export function recordAdapterSendAttempt({ descriptor, accountKey, nowMs = Date.now() }) {
  recordSendTimestamp(`${descriptor.key}::${accountKey ?? ''}`, nowMs);
}

/** Chỉ dùng cho test — ghi một mốc gửi giả vào cửa sổ trượt (channel::accountKey). */
export function __recordSendForTest(key, atMs) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__recordSendForTest chỉ được gọi khi NODE_ENV=test');
  }
  recordSendTimestamp(key, atMs);
}

/** Chỉ dùng cho test — tính lại còn phải chờ bao lâu (ms) theo perHourLimit, không gửi thật. */
export function __computePerHourWaitMsForTest(key, perHourLimit, nowMs) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__computePerHourWaitMsForTest chỉ được gọi khi NODE_ENV=test');
  }
  return computePerHourWaitMs(key, perHourLimit, nowMs);
}

/** Chỉ dùng cho test — xoá state cửa sổ trượt perHourLimit giữa các ca. */
export function __resetPerHourWindowForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetPerHourWindowForTest chỉ được gọi khi NODE_ENV=test');
  }
  sendTimestampsByKey.clear();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(min, max) {
  const lo = Math.max(0, Number.parseInt(min, 10) || 0);
  const hi = Math.max(lo, Number.parseInt(max, 10) || 0);
  if (hi <= 0) return 0;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Nguồn người nhận — khuôn khối email R:3619-3662 (CHỐT HỢP ĐỒNG PR-3): `manual` (danh sách
 * trong config), `node` (output node khác qua `nodeOutputs`), mặc định output node liền trước
 * (`lastOutputItems`). Runner CHỈ gom "rows" thô — việc chuẩn hoá thành {recipientKey, display,
 * vars} là của `adapter.resolveRecipients` (adapter biết field nào của kênh mình).
 *
 * @param {object} input
 * @param {object} input.config
 * @param {object} input.nodeOutputs
 * @param {Array<object>} input.lastOutputItems
 * @returns {Array<object>}
 */
const STATIC_LIST_RECIPIENT_SOURCES = new Set(['manual', 'telegram_groups', 'whatsapp_groups']);

function resolveRecipientRows({ config, nodeOutputs, lastOutputItems }) {
  const source = config?.recipientSource;
  // Nguồn "danh sách tĩnh" lưu thẳng trong config.recipientKeys: `manual` (nhập tay) và
  // `telegram_groups`/`whatsapp_groups` (nhóm đã chọn — mỗi phần tử {recipientKey, display}). Cùng cách gom.
  if (STATIC_LIST_RECIPIENT_SOURCES.has(source)) {
    const raw = config?.recipientKeys;
    const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/);
    return list
      .map((item) => (item && typeof item === 'object' ? item : { recipientKey: String(item ?? '').trim() }))
      .filter((row) => {
        if (!row || typeof row !== 'object') return false;
        if ('recipientKey' in row) return String(row.recipientKey || '').trim() !== '';
        return Object.keys(row).length > 0;
      });
  }
  if (source === 'node' && String(config?.recipientNodeId || '').trim()) {
    const sourceNodeId = String(config.recipientNodeId).trim();
    return Array.isArray(nodeOutputs?.[sourceNodeId]) ? nodeOutputs[sourceNodeId] : [];
  }
  return Array.isArray(lastOutputItems) ? lastOutputItems : [];
}

/**
 * PR-4 — quotaGate THẬT, engine truyền mặc định cho MỌI node adapter (thay bản throw
 * CHANNEL_QUOTA_NOT_WIRED của PR-3). Khuôn ĐÚNG `reserveCampaignZaloQuota`
 * (campaignZaloSender.service.js:1987-2050): `reserveSendQuota()` nhận `channel: quotaChannel` là khoá hạn mức
 * thật sự bị trừ. P10: `quotaChannel` = 'telegram' | 'whatsapp' (hạn mức tin/tháng RIÊNG, `plans.monthly_<kênh>_limit`,
 * ví `<kênh>_messages`; migration 271 mở `chk_sqr_channel`); trước P10 cả hai mượn 'zalo' để tránh migration.
 *
 * LỆCH LỆNH GIAO (phát hiện qua test tích hợp (g), đã báo lại) — lệnh giao viết
 * `channel: descriptor.key` (kênh THẬT) cho `buildCampaignReservationKey`, nhưng
 * `CANONICAL_CAMPAIGN` (sendQuota.repository.js) hard-code đoạn kênh của key phải khớp
 * `(email|zalo)` — dùng kênh thật (vd 'telegram') làm validateReservationKey ném
 * INVALID_RESERVATION_KEY ngay khi vào mode enforce/test_enforce. Đã đổi dùng `quotaChannel`
 * cho CẢ HAI — an toàn vì `nodeId` đã tự phân biệt kênh (một node chỉ gắn với đúng 1 subtype).
 *
 * GHI CHÚ GIỚI HẠN (không có trong lệnh giao, tự phát hiện khi đọc code): `reserveCampaignZaloQuota`
 * gốc còn một nhánh "replay" (reservation đã ở status 'consumed' do lần thử trước) — bỏ qua sendOne,
 * trả thẳng response cũ. Gate này KHÔNG có nhánh đó: cửa sổ crash duy nhất nó bỏ sót là tiến trình
 * chết ĐÚNG lúc giữa sendOne thành công và markSent/consumeSendQuota — hẹp, và v1 chấp nhận (không
 * nằm trong phạm vi lệnh giao PR-4, cần báo lại nếu muốn vá thêm).
 */
export function createCampaignChannelQuotaGate() {
  return {
    /**
     * @param {object} input
     * @param {string} input.realChannel descriptor.key — vd 'telegram' (chỉ dùng để ghi vào
     *   requestPayload.channel cho dễ đọc log/fingerprint — KHÔNG dùng cho reservation KEY, xem
     *   ghi chú "LỆCH LỆNH GIAO" phía trên).
     * @param {string} input.quotaChannel descriptor.quotaChannel — 'telegram' | 'whatsapp' (P10; dùng cho
     *   CẢ reservation KEY lẫn reserveSendQuota's channel — cột limit/CHECK thật).
     * @param {number} [input.quantity=1]
     * @param {number} input.userId billingUserId (chủ workspace — campaign luôn tính quota chủ).
     * @param {number} input.runId
     * @param {number|string} input.nodeId
     * @param {string} input.recipientKey
     * @param {number} input.stepIndex 1-based.
     * @param {string} [input.content] nội dung ĐÃ RENDER (không có bước rewrite tracking-link như
     *   Zalo nên dùng thẳng, không cần "quotaContentKey gốc" như campaignZaloSender).
     * @returns {Promise<{reservationId: number|null, active: boolean}>}
     */
    async reserve({
      realChannel,
      quotaChannel,
      quantity = 1,
      userId,
      runId,
      nodeId,
      recipientKey,
      stepIndex,
      content,
    }) {
      if (!userId) return { reservationId: null, active: false };
      // LỆCH LỆNH GIAO (phát hiện qua test (g), báo lại) — lệnh giao viết
      // `channel: descriptor.key` (kênh THẬT, vd 'telegram') cho reservationKey, nhưng
      // `CANONICAL_CAMPAIGN` (sendQuota.repository.js) hard-code đoạn kênh của key phải khớp
      // `(email|zalo)` (P10 đã mở thành email|zalo|telegram|whatsapp) — dùng `quotaChannel` (= khoá kênh từ P10)
      // cho cả KEY lẫn reserveSendQuota; `nodeId` đã tự phân biệt kênh (một node chỉ gắn với đúng 1 subtype).
      // `sourceType: 'campaign_zalo'` GIỮ NGUYÊN: allowlist SEND_QUOTA_RESERVATION_SOURCES/log chẩn đoán đã khoá theo tên đó.
      const reservationKey = buildCampaignReservationKey({
        runId,
        nodeId,
        channel: quotaChannel,
        recipient: recipientKey,
        logicalStep: stepIndex,
      });
      const requestPayload = {
        channel: realChannel,
        recipient: recipientKey,
        sourceType: 'campaign_zalo',
        quantity,
        content: content || '',
      };
      const requestFingerprint = computeRequestFingerprint(requestPayload);
      const parsedNodeId = Number.parseInt(nodeId, 10);
      let reservation;
      try {
        reservation = await reserveSendQuota({
          userId,
          channel: quotaChannel,
          quantity,
          reservationKey,
          requestFingerprint,
          requestPayload,
          sourceType: 'campaign_zalo',
          sourceRef: {
            runId,
            nodeId: Number.isFinite(parsedNodeId) ? parsedNodeId : null,
            stepIndex,
          },
        });
      } catch (quotaErr) {
        // Chỉ quota-exceeded thật (403 RESOURCE_LIMIT_EXCEEDED) đổi nhãn PLAN_QUOTA — khuôn
        // reserveCampaignZaloQuota. Lỗi khác (503/409/...) ném nguyên trạng.
        if (quotaErr.code !== 'RESOURCE_LIMIT_EXCEEDED') {
          throw quotaErr;
        }
        const err = new Error(
          `[PLAN_QUOTA] ${quotaErr.message || 'Vượt giới hạn gửi của gói dịch vụ.'}`
        );
        err.code = 'PLAN_SEND_LIMIT_EXCEEDED';
        err.resetAt = quotaErr.resetAt ?? null;
        err.limitType = quotaErr.limitType ?? null;
        throw err;
      }
      const active = reservation.mode === 'enforce' || reservation.mode === 'test_enforce';
      if (active) {
        await markSendQuotaSending({ reservationId: reservation.id });
      }
      return { reservationId: active ? reservation.id : null, active };
    },

    /**
     * @param {number|null} reservationId
     * @param {object} [input]
     * @param {object} [input.responseSnapshot]
     */
    async consume(reservationId, { responseSnapshot = null } = {}) {
      if (reservationId == null) return;
      await consumeSendQuota({ reservationId, responseSnapshot });
    },

    /**
     * @param {number|null} reservationId
     * @param {object} [input]
     * @param {string} [input.failureCode]
     */
    async release(reservationId, { failureCode = null } = {}) {
      if (reservationId == null) return;
      await releaseSendQuota({ reservationId, failureCode });
    },
  };
}

/** Bản no-op cho test tích hợp PR-3/PR-4 (mock descriptor) — không giữ/trừ quota thật nào. */
export function createNoopChannelQuotaGate() {
  return {
    async reserve() {
      return { reservationId: null, active: false };
    },
    async consume() {},
    async release() {},
  };
}

/**
 * Chạy MỘT node gửi kênh "adapter" cho tới khi hết người nhận hoặc phải dừng node (rate_limit/
 * auth/not_configured/quiet_hours/quota chưa đấu nối). KHÔNG throw cho lỗi 'hard'/'transient' của
 * TỪNG người nhận — 'hard' đánh dấu người đó failed rồi đi tiếp người sau; 'transient' được thử lại
 * trong lượt (P2, xem resolveTransientMaxAttempts) rồi mới bỏ cuộc.
 *
 * Bộ đếm `total/success/failed/skipped` là state CỤC BỘ của hàm này — TRẢ VỀ để engine
 * (campaignRun.service.js) tự cộng vào `let totalRecipients/successfulSends/failedSends/
 * skippedSends` của nó (runner không có quyền sửa biến `let` của closure engine).
 *
 * @param {object} ctx
 * @param {import('./campaignChannelRegistry.service.js').ChannelDescriptor} ctx.descriptor
 * @param {number} ctx.runId
 * @param {number} ctx.campaignId
 * @param {number} ctx.userId
 * @param {number} ctx.workspaceOwnerId
 * @param {object} ctx.node
 * @param {object} ctx.config
 * @param {object} ctx.nodeOutputs
 * @param {Array<object>} ctx.lastOutputItems
 * @param {function(object): Promise<object>} ctx.getRecipientProgress
 * @param {function(object): Promise<void>} ctx.markRecipientStepCompleted
 * @param {function(): Promise<void>} ctx.ensureRunStillRunning
 * @param {function(object): Promise<void>} ctx.logExecutionNode
 * @param {{reserve: function(object): Promise<string|number|null>, consume: function(*): Promise<void>, release: function(*): Promise<void>}} ctx.quotaGate
 * @returns {Promise<{total: number, success: number, failed: number, skipped: number, outputItems: Array<object>}>}
 */
export async function runAdapterSendNode(ctx) {
  const {
    descriptor,
    runId,
    campaignId,
    userId,
    workspaceOwnerId,
    node,
    config = {},
    nodeOutputs = {},
    lastOutputItems = [],
    getRecipientProgress,
    markRecipientStepCompleted,
    upsertRecipientProgress,
    toHoChiMinhIso,
    ensureRunStillRunning,
    quotaGate,
    crossRunDedupeHours = 24,
    // P7 — chu kỳ replay của run continuous: danh sách người nhận rỗng là bình thường (chưa có hội thoại mới) nên
    // KHÔNG được ném CHANNEL_NO_RECIPIENTS làm run failed.
    allowEmptyRecipients = false,
    // PLAN_GIAO_TK_TG_WA H2 — phạm vi tài khoản Telegram / WhatsApp của NGƯỜI KÍCH HOẠT lượt chạy (engine tính, xem
    // campaignChannelAccess.service); adapter chặn tài khoản ngoài phạm vi ở `resolveAccount`. undefined = không lọc.
    accessibleChannelRefs,
  } = ctx;

  let total = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  // P7 — người đang CHỜ bước kế (chưa đến hạn): không cộng failed/skipped; `nextDueAtMs` = mốc sớm nhất để engine
  // đánh thức chu kỳ continuous (one-shot thì run giữ 'running' nhờ ledger `nextDueAt`, xem campaignRun cuối lượt).
  let waiting = 0;
  let nextDueAtMs = null;
  const outputItems = [];

  // PR-6 — resolveAccount TRƯỚC resolveRecipients (đổi thứ tự so với PR-3): nguồn "hội thoại"
  // (Telegram) cần biết account để đọc đúng danh sách hội thoại của account đó.
  const account = await descriptor.adapter.resolveAccount({ userId, workspaceOwnerId, node, config, accessibleChannelRefs });
  const rows = resolveRecipientRows({ config, nodeOutputs, lastOutputItems });
  const recipients = await descriptor.adapter.resolveRecipients({ rows, config, account });
  // PLAN_TELEGRAM_0_NGUOI_NHAN_2026-09-29 Việc 2 — lưới cuối: không có người nhận thì KHÔNG trả
  // {total:0} để run 'completed' im lặng. Mã CHANNEL_NO_RECIPIENTS không nằm trong nhánh defer
  // (QUIET_HOURS/RATE_LIMIT) của engine nên rơi xuống catch tổng → run 'failed' + error_message.
  // Ném TRƯỚC try nên không có partialResult (chưa cộng gì).
  if ((!Array.isArray(recipients) || recipients.length === 0) && allowEmptyRecipients) {
    return { total: 0, success: 0, failed: 0, skipped: 0, waiting: 0, nextDueAtMs: null, outputItems: [] };
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    const noRecipientsError = new Error(
      `Không có người nhận nào để gửi ở node ${node?.id ?? '?'} (kênh ${descriptor.key}) — kiểm tra nguồn người nhận và tài khoản gửi.`
    );
    noRecipientsError.code = 'CHANNEL_NO_RECIPIENTS';
    throw noRecipientsError;
  }
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  // P7 — ledger tính `nextDueAt` của bước kế qua `computeStepDueAt` (engine): chỉ cần độ trễ, luôn tính từ bước TRƯỚC.
  const ledgerSteps = steps.map((item) => ({
    delayValue: item?.delayValue,
    delayUnit: item?.delayUnit,
    delayFrom: 'prev',
  }));
  const perHourKey = `${descriptor.key}::${account?.accountKey ?? ''}`;

  // P4 (PLAN_TG_WA_DAY_DU) — cấu hình gửi THEO TÀI KHOẢN đọc MỘT lần mỗi lượt chạy node (đổi mức tốc độ áp dụng từ lượt
  // kế tiếp — như Zalo): (1) ghi đè giãn cách, không bao giờ dưới sàn cứng (applyAccountDelayOverride); (2) trần gửi/ngày
  // người dùng tự đặt (NULL = không giới hạn → KHÔNG chạm DB thêm mỗi tin). Adapter không có hook (kênh thử nghiệm) = mặc định.
  const accountSendSettings = typeof descriptor.adapter?.getAccountSendSettings === 'function'
    ? await descriptor.adapter.getAccountSendSettings({ account, workspaceOwnerId: workspaceOwnerId ?? userId })
    : null;
  const effectivePolicy = applyAccountDelayOverride(descriptor.key, descriptor.policy || {}, accountSendSettings);
  const accountDailyLimit = accountSendSettings?.userDailySendLimit ?? null;

  let hasSentAny = false;

  // F1 (review vòng 1) — bọc TOÀN BỘ vòng lặp người nhận: lỗi bất kỳ ném ra từ đây (RUN_STOPPED/
  // RUN_YIELD_SLOT từ ensureRunStillRunning, CHANNEL_QUOTA_NOT_WIRED từ quotaGate.reserve,
  // quiet_hours/rate_limit/auth/not_configured) đều phải mang theo số đã tích luỹ — không thì
  // engine cộng 0 dù đã gửi thật, vỡ bất biến ok+failed+skipped ≤ total ở lần resume sau.
  try {
    for (const recipient of recipients) {
      await ensureRunStillRunning();
      const recipientKey = String(recipient?.recipientKey || '').trim();
      if (!recipientKey) continue;

      // eslint-disable-next-line no-await-in-loop
      let progress = await getRecipientProgress({
        nodeId: node.id,
        channel: descriptor.key,
        recipientKey,
      });
      // F2 (review vòng 1) — lần đầu thấy người này: cộng total MỘT LẦN (khuôn R:4381 email) RỒI
      // upsert ngay một dòng ledger (completedStep giữ nguyên, thường 0) — để mọi đường dừng SAU
      // đây (quiet_hours/rate_limit/quota chưa đấu nối/RUN_STOPPED) không làm resume cộng total
      // lần nữa: updatedAt của người này đã khác NULL kể từ dòng này trở đi.
      if (progress.updatedAt === null) {
        total += steps.length;
        // eslint-disable-next-line no-await-in-loop
        await upsertRecipientProgress({
          nodeId: node.id,
          channel: descriptor.key,
          recipientKey,
          completedStep: progress.lastCompletedStep,
          totalSteps: steps.length,
        });
        // eslint-disable-next-line no-await-in-loop
        progress = await getRecipientProgress({ nodeId: node.id, channel: descriptor.key, recipientKey });
      }

      let stepIndex = Math.max(0, Number.parseInt(progress.lastCompletedStep, 10) || 0);
      let stopRecipient = false;
      // Số lần đã thử bước hiện tại (lỗi transient) — về 0 mỗi khi sang bước mới.
      let transientAttempts = 0;

      while (stepIndex < steps.length && !stopRecipient) {
        await ensureRunStillRunning();
        const oneBasedStep = stepIndex + 1;
        const step = steps[stepIndex];

        // Dedupe: same-run trước, rồi cross-run (repo PR-2) — thấy thì coi bước này đã xong, KHÔNG gửi.
        // eslint-disable-next-line no-await-in-loop
        let existingSent = await campaignChannelMessageRepository.findExistingSentSameRun({
          runId,
          nodeId: node.id,
          channel: descriptor.key,
          recipientKey,
          stepIndex: oneBasedStep,
        });
        if (!existingSent) {
          // eslint-disable-next-line no-await-in-loop
          existingSent = await campaignChannelMessageRepository.findExistingSentCrossRun({
            ownRunId: runId,
            campaignId,
            nodeId: node.id,
            channel: descriptor.key,
            recipientKey,
            stepIndex: oneBasedStep,
            windowHours: crossRunDedupeHours,
          });
        }
        if (existingSent) {
          // eslint-disable-next-line no-await-in-loop
          await markRecipientStepCompleted({
            nodeId: node.id,
            channel: descriptor.key,
            recipientKey,
            completedStep: oneBasedStep,
            totalSteps: steps.length,
            progress,
            steps: ledgerSteps,
            sendMode: 'schedule',
            // Mốc bước kế tính theo lúc đã gửi THẬT (dòng cũ), không phải lúc dedupe thấy nó.
            completedAtOverride: existingSent.sent_at || existingSent.sent_at_tz || null,
          });
          skipped += 1;
          stepIndex += 1;
          transientAttempts = 0;
          // F3 (review vòng 1) — đọc lại progress SAU KHI ledger vừa cập nhật (cache được làm mới
          // ngay trong upsertRecipientProgress, khuôn R:1929) — bước kế không được dùng object
          // progress cũ (firstSentAt/lastCompletedStep đã lệch với DB).
          // eslint-disable-next-line no-await-in-loop
          progress = await getRecipientProgress({ nodeId: node.id, channel: descriptor.key, recipientKey });
          continue;
        }

        // P7 — bước k >= 2 có độ trễ: chưa đến hạn (`lastCompletedAt` + trễ) thì KHÔNG gửi, ghi `nextDueAt` vào ledger
        // và đi tiếp người sau. Đặt TRƯỚC consent/cổng nhịp/giữ chỗ hạn mức: người còn chờ không ăn nhịp, không ăn
        // quota, không tốn truy vấn consent (consent được kiểm lại đúng lúc thật sự gửi bước này). `lastCompletedAt`
        // thiếu (ledger cũ) = coi như đến hạn.
        if (stepIndex > 0) {
          const stepDelayMs = resolveStepDelayMs(step);
          const lastCompletedAtMs = Date.parse(progress?.lastCompletedAt || '');
          if (stepDelayMs > 0 && Number.isFinite(lastCompletedAtMs)) {
            const dueAtMs = lastCompletedAtMs + stepDelayMs;
            if (Date.now() < dueAtMs) {
              // eslint-disable-next-line no-await-in-loop
              await upsertRecipientProgress({
                nodeId: node.id,
                channel: descriptor.key,
                recipientKey,
                completedStep: stepIndex,
                totalSteps: steps.length,
                firstSentAt: progress?.firstSentAt || null,
                lastCompletedAt: progress?.lastCompletedAt || null,
                nextDueAt: toHoChiMinhIso(dueAtMs),
              });
              waiting += 1;
              nextDueAtMs = nextDueAtMs === null ? dueAtMs : Math.min(nextDueAtMs, dueAtMs);
              outputItems.push({
                ...recipient,
                status: 'waiting',
                stepIndex: oneBasedStep,
                nextDueAt: toHoChiMinhIso(dueAtMs),
              });
              stopRecipient = true;
              continue;
            }
          }
        }

        // P2 — khách ĐÃ TỪ CHỐI nhận tin (lead mới nhất marketing_consent=false; NULL = chưa hỏi vẫn gửi, chốt
        // 19/09) thì KHÔNG gửi. Chỉ áp cho kênh có recipientKey là SĐT (`descriptor.recipientIsPhone`, WhatsApp) —
        // Telegram định danh bằng chat id, không có SĐT để đối chiếu nên KHÔNG áp (không giả vờ có kiểm).
        // Kiểm TRƯỚC cổng nhịp/giữ chỗ hạn mức: người từ chối không ăn nhịp, không ăn quota. Lead thuộc CHỦ
        // workspace (workspaceOwnerId) — nhân viên tạo chiến dịch thì userId là nhân viên, tra sai chủ.
        // P8b — người nhận NHÓM (jid @g.us) không có SĐT để đối chiếu -> bỏ qua kiểm consent.
        if (descriptor.recipientIsPhone && !recipient?.isGroup) {
          // eslint-disable-next-line no-await-in-loop
          const consentRefused = await zaloCampaignRecipientService.isLeadPhoneConsentRefused(
            workspaceOwnerId ?? userId,
            recipientKey
          );
          if (consentRefused) {
            // Bỏ nốt MỌI bước còn lại của người này (total đã cộng steps.length lúc thấy lần đầu) — giữ ok+failed+skipped ≤ total.
            skipped += steps.length - stepIndex;
            const nowIso = toHoChiMinhIso();
            // eslint-disable-next-line no-await-in-loop
            await upsertRecipientProgress({
              nodeId: node.id,
              channel: descriptor.key,
              recipientKey,
              completedStep: steps.length,
              totalSteps: steps.length,
              firstSentAt: progress?.firstSentAt || nowIso,
              lastCompletedAt: nowIso,
              nextDueAt: null,
              lastFailureReason: 'consent_refused',
              lastFailureAt: nowIso,
            });
            outputItems.push({
              ...recipient,
              status: 'skipped',
              skipReason: 'consent_refused',
              stepIndex: oneBasedStep,
            });
            stopRecipient = true;
            continue;
          }
        }

        // Pacing 1: quiet hours — trong khung thì dừng CẢ NODE (không phải chỉ người này).
        if (isWithinQuietHours(Date.now(), descriptor.policy?.quietHours)) {
          const quietError = new ChannelSendError(
            'quiet_hours',
            `Kênh ${descriptor.key} đang trong khung giờ yên lặng, dừng node ${node.id}.`
          );
          quietError.code = 'CHANNEL_QUIET_HOURS';
          // PR-5 — engine dùng waitMs để defer (persistRunDeferYieldSlot) thay vì đánh run failed.
          quietError.waitMs = computeQuietHoursWaitMs(Date.now(), descriptor.policy?.quietHours);
          throw quietError;
        }

        // Trần gửi/NGÀY do người dùng tự đặt cho tài khoản (P4) — chạm trần thì hoãn CẢ NODE tới 00:00 giờ VN hôm sau
        // (engine defer như quiet_hours, KHÔNG đánh failed, KHÔNG đốt danh sách: bước dở dang chưa vào ledger nên resume
        // gửi lại đúng chỗ). Đặt SAU consent (người từ chối không ăn quota) và TRƯỚC nhịp giờ/giãn cách (khỏi ngủ vô ích).
        if (accountDailyLimit != null) {
          // eslint-disable-next-line no-await-in-loop
          const dailyCheck = await checkAccountDailyLimit({
            channel: descriptor.key,
            accountId: account?.accountKey,
            limit: accountDailyLimit,
          });
          if (!dailyCheck.allowed) {
            const dailyLimitError = new ChannelSendError(
              'rate_limit',
              `Tài khoản ${descriptor.key} đã đạt giới hạn ${dailyCheck.limit} tin/ngày do bạn đặt (đã gửi ${dailyCheck.currentCount}) `
              + '— chiến dịch tiếp tục từ 00:00 giờ Việt Nam hôm sau.'
            );
            dailyLimitError.code = 'CHANNEL_DAILY_LIMIT';
            dailyLimitError.waitMs = Math.max(0, dailyCheck.resetAt.getTime() - Date.now());
            throw dailyLimitError;
          }
        }

        // Pacing 2: perHourLimit — chờ nếu ≤ 60s, dừng cả node nếu lâu hơn.
        const waitMs = computePerHourWaitMs(perHourKey, descriptor.policy?.perHourLimit, Date.now());
        if (waitMs > 0) {
          if (waitMs <= PER_HOUR_MAX_WAIT_MS) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(waitMs);
          } else {
            const rateLimitError = new ChannelSendError(
              'rate_limit',
              `Kênh ${descriptor.key} account=${account?.accountKey} đã chạm trần `
              + `${descriptor.policy.perHourLimit} tin/giờ, chờ ${Math.ceil(waitMs / 1000)}s (> 60s) → dừng node.`
            );
            rateLimitError.code = 'CHANNEL_RATE_LIMIT';
            // PR-5 — engine dùng waitMs để defer (persistRunDeferYieldSlot) thay vì đánh run failed.
            rateLimitError.waitMs = waitMs;
            throw rateLimitError;
          }
        }

        // Delay ngẫu nhiên giữa 2 lần gửi — KHÔNG áp cho tin đầu tiên của cả node.
        if (hasSentAny) {
          const delayMs = randomDelayMs(effectivePolicy.minDelayMs, effectivePolicy.maxDelayMs);
          if (delayMs > 0) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(delayMs);
          }
        }

        const text = neutralizeUnresolvedTemplateVariables(
          renderTemplateText(step?.message, recipient.vars || {}),
          { campaignId, nodeId: node.id }
        );

        // reserve() TRƯỚC insertQueued — lỗi ở đây (vd PLAN_SEND_LIMIT_EXCEEDED khi vượt hạn mức
        // gói, Việc 1 PR-4) LUÔN dừng cả node ngay, KHÔNG đi qua classifyError: đây là lỗi hạ tầng/
        // quota, không phải lỗi gửi của riêng người nhận này. v1 = dừng node → run failed (PR-5
        // mới đổi thành defer, ghi rõ ở đây để không ai tưởng nhầm là đã có).
        // eslint-disable-next-line no-await-in-loop
        const { reservationId, active: quotaActive } = await quotaGate.reserve({
          realChannel: descriptor.key,
          quotaChannel: descriptor.quotaChannel,
          quantity: 1,
          userId,
          runId,
          nodeId: node.id,
          recipientKey,
          stepIndex: oneBasedStep,
          content: text,
        });

        let messageId = null;
        try {
          // PR-A (PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28) — TRƯỚC lời gọi nhà cung cấp (và TRƯỚC
          // insertQueued): catch bên dưới ném thẳng RUN_STOPPED/RUN_YIELD_SLOT mà KHÔNG gọi
          // markFailed(messageId, …) (xem nhánh `if (sendError?.code === 'RUN_STOPPED' ||
          // sendError?.code === 'RUN_YIELD_SLOT') throw sendError;` ngay dưới) — nếu đặt sau
          // insertQueued, dòng 'queued' vừa tạo sẽ treo vĩnh viễn (không sent, không failed).
          // Đặt TRƯỚC insertQueued để không tạo dòng đó khi đang shutdown.
          if (campaignShutdownGate.isShuttingDown()) {
            const shutdownErr = new Error('Tiến trình đang shutdown, tạm dừng gửi kênh ' + descriptor.key + '.');
            shutdownErr.code = 'RUN_YIELD_SLOT';
            throw shutdownErr;
          }
          // eslint-disable-next-line no-await-in-loop
          messageId = await campaignChannelMessageRepository.insertQueued({
            campaignId,
            runId,
            nodeId: node.id,
            channel: descriptor.key,
            accountKey: account?.accountKey,
            recipientKey,
            recipientDisplay: recipient.display,
            stepIndex: oneBasedStep,
            workspaceOwnerId,
            actorUserId: userId,
            quotaReservationId: reservationId,
          });
          // eslint-disable-next-line no-await-in-loop
          const sendResult = await campaignShutdownGate.trackInFlight(() => descriptor.adapter.sendOne({
            account,
            recipientKey,
            text,
            stepIndex: oneBasedStep,
          }));
          // eslint-disable-next-line no-await-in-loop
          await campaignChannelMessageRepository.markSent(messageId, {
            providerMessageId: sendResult?.messageId || null,
          });
          if (quotaActive) {
            // eslint-disable-next-line no-await-in-loop
            await quotaGate.consume(reservationId, { responseSnapshot: sendResult || null });
          } else {
            // P10 — đường legacy (mode off/shadow): không có reservation nên phải tự trừ ví top-up của kênh khi tin
            // vượt hạn mức gói (giống Zalo ở campaignRun.updateZaloMessageTrackingMeta). Không ném: tin đã đi.
            // eslint-disable-next-line no-await-in-loop
            await debitAdapterMessageIfNeeded({
              billingUserId: userId,
              channel: descriptor.quotaChannel,
              messageId,
            });
          }
          hasSentAny = true;
          transientAttempts = 0;
          recordSendTimestamp(perHourKey, Date.now());
          // eslint-disable-next-line no-await-in-loop
          await markRecipientStepCompleted({
            nodeId: node.id,
            channel: descriptor.key,
            recipientKey,
            completedStep: oneBasedStep,
            totalSteps: steps.length,
            progress,
            steps: ledgerSteps,
            sendMode: 'schedule',
          });
          // P8b — journey khách (WhatsApp, người nhận SĐT có trong customers). Không bao giờ ném: lỗi chỉ log.
          // eslint-disable-next-line no-await-in-loop
          await recordAdapterSentJourney({
            descriptor,
            workspaceOwnerId: workspaceOwnerId ?? userId,
            recipient,
            campaignId,
            runId,
            nodeId: node.id,
            messageId,
          });
          success += 1;
          outputItems.push({
            ...recipient,
            status: 'sent',
            stepIndex: oneBasedStep,
            messageId: sendResult?.messageId || null,
          });
          // F3 — đọc lại progress sau khi bước này hoàn tất (cache đã làm mới), để bước kế (nếu
          // còn) nhận đúng firstSentAt thay vì object progress đọc từ TRƯỚC bước 1.
          // eslint-disable-next-line no-await-in-loop
          progress = await getRecipientProgress({ nodeId: node.id, channel: descriptor.key, recipientKey });
        } catch (sendError) {
          if (quotaActive) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await quotaGate.release(reservationId, { failureCode: 'CHANNEL_SEND_FAILED' });
            } catch (releaseError) {
              console.warn('[CampaignChannelRunner] quotaGate.release lỗi:', releaseError?.message);
            }
          }
          if (sendError?.code === 'RUN_STOPPED' || sendError?.code === 'RUN_YIELD_SLOT') throw sendError;

          const category = sendError instanceof ChannelSendError
            ? sendError.category
            : descriptor.adapter.classifyError(sendError);
          // P2 — lỗi TẠM: thử lại trong cùng lượt tối đa CHANNEL_TRANSIENT_MAX_ATTEMPTS lần (mặc định 3), chờ
          // CHANNEL_TRANSIENT_RETRY_MS (30s) nhân đôi mỗi lần. Thử lại = `continue` vòng bước KHÔNG tăng stepIndex nên
          // đi lại qua giờ yên lặng / trần giờ / giãn cách như một lần gửi mới. Chưa hết lượt thì KHÔNG cộng
          // failed và KHÔNG đẩy outputItems (mới đếm khi bỏ cuộc) — giữ ok+failed+skipped ≤ total.
          const maxAttempts = resolveTransientMaxAttempts();
          const attemptNo = category === 'transient' ? transientAttempts + 1 : 1;
          const willRetry = category === 'transient' && attemptNo < maxAttempts;
          if (messageId) {
            // Bảng không có cột meta (migration 255): số lần thử = số dòng của (run, node, người, bước); lần thử
            // đã được thử lại mang nhãn TRANSIENT_RETRY_CATEGORY, dòng cuối giữ 'transient' + tiền tố "[lần n/max]".
            const rawMessage = sendError?.message || String(sendError);
            // eslint-disable-next-line no-await-in-loop
            await campaignChannelMessageRepository.markFailed(messageId, {
              errorCategory: willRetry ? TRANSIENT_RETRY_CATEGORY : category,
              errorMessage: category === 'transient' ? `[lần ${attemptNo}/${maxAttempts}] ${rawMessage}` : rawMessage,
            });
          }
          if (willRetry) {
            transientAttempts = attemptNo;
            // eslint-disable-next-line no-await-in-loop
            await sleep(resolveTransientRetryBaseMs() * (2 ** (attemptNo - 1)));
            continue;
          }
          outputItems.push({
            ...recipient,
            status: 'failed',
            stepIndex: oneBasedStep,
            errorCategory: category,
            ...(category === 'transient' ? { attempts: attemptNo } : {}),
          });

          if (category === 'hard' || category === 'transient') {
            // Review PR-5 — CHỈ lỗi bỏ cuộc mới cộng failed. Lỗi dừng-để-thử-lại (rate_limit/auth/
            // not_configured) mà cũng cộng thì resume gửi lại đúng bước đó và thành công → một bước đếm
            // cả failed lẫn success, vỡ ok+failed+skipped ≤ total (khuôn: lỗi còn thử lại không cộng
            // failedSends — email continuous R:4100–4105).
            failed += 1;
            // F2 — bỏ cuộc (hard, hoặc transient đã hết lượt thử): người này COI NHƯ XONG, ghi ledger completedStep=
            // totalSteps + lastFailureReason để resume KHÔNG gửi lại (khuôn email bỏ cuộc, R:4118-
            // 4133) rồi đi tiếp người sau.
            const nowIso = toHoChiMinhIso();
            // eslint-disable-next-line no-await-in-loop
            await upsertRecipientProgress({
              nodeId: node.id,
              channel: descriptor.key,
              recipientKey,
              completedStep: steps.length,
              totalSteps: steps.length,
              firstSentAt: progress?.firstSentAt || nowIso,
              lastCompletedAt: nowIso,
              nextDueAt: null,
              lastFailureReason: category,
              lastFailureAt: nowIso,
            });
            stopRecipient = true;
            continue;
          }

          // 'rate_limit' | 'auth' | 'not_configured' — dừng CẢ NODE. KHÔNG upsert ledger thêm ở
          // đây: dòng "lần đầu thấy" đã đủ chặn đếm total trùng khi resume, và bước dở dang này
          // PHẢI được thử lại nguyên vẹn (không phải "bỏ cuộc" như hard/transient).
          const stopError = new Error(
            sendError?.message || `Kênh ${descriptor.key} dừng node ${node.id} (${category}).`
          );
          stopError.code = `CHANNEL_${String(category).toUpperCase()}`;
          if (category === 'rate_limit') {
            stopError.waitMs = resolveReactiveRateLimitWaitMs(sendError);
          }
          throw stopError;
        }

        stepIndex += 1;
        transientAttempts = 0;
      }
    }
  } catch (loopError) {
    loopError.partialResult = { total, success, failed, skipped, waiting, nextDueAtMs, outputItems };
    throw loopError;
  }

  return { total, success, failed, skipped, waiting, nextDueAtMs, outputItems };
}

export default {
  runAdapterSendNode,
  resolveStepDelayMs,
  evaluateAdapterSendGate,
  recordAdapterSendAttempt,
  isWithinQuietHours,
  computeQuietHoursWaitMs,
  createCampaignChannelQuotaGate,
  createNoopChannelQuotaGate,
  __resetPerHourWindowForTest,
};
