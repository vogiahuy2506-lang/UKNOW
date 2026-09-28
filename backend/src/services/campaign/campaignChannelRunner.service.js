/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-3 — runner chung cho kênh "adapter" (Telegram/WhatsApp
 * từ PR-6+). Chạy INLINE trong engine (một tiến trình duy nhất, xem mục 5 Bẫy của plan) — KHÔNG
 * thêm worker/queue riêng, KHÔNG dùng zaloRateLimiter/enforceOutboundPolicyBeforeSend (đó là state
 * riêng của 4 kênh legacy), KHÔNG ghi zalo_messages/email_messages (bảng riêng
 * campaign_channel_messages, PR-2).
 */
import campaignChannelMessageRepository from '../../repositories/campaign/campaignChannelMessage.repository.js';
import { renderTemplateText, neutralizeUnresolvedTemplateVariables } from '../../utils/templateVariableAutoMap.util.js';
import { ChannelSendError } from './campaignChannelRegistry.service.js';
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
function resolveRecipientRows({ config, nodeOutputs, lastOutputItems }) {
  const source = config?.recipientSource;
  if (source === 'manual') {
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
 * (campaignZaloSender.service.js:1987-2050): `reserveSendQuota()` nhận `channel: quotaChannel`
 * ('zalo') là cột limit/CHECK thật sự bị trừ (SỬA PR-4: không migration mới nới `chk_sqr_channel`,
 * reservation của kênh adapter TRÔNG Y HỆT một reservation Zalo bình thường —
 * evaluateReservationQuotaPolicy vì vậy KHÔNG cần sửa gì thêm).
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
     * @param {string} input.quotaChannel descriptor.quotaChannel — 'email' | 'zalo' (dùng cho
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
      // `(email|zalo)` — bất kỳ kênh thật nào khác 'zalo' đều bị validateReservationKey chặn
      // INVALID_RESERVATION_KEY ngay khi vào mode enforce/test_enforce. Dùng `quotaChannel`
      // ('zalo') ở đây thay vì `realChannel` — an toàn vì `nodeId` đã tự phân biệt kênh (một
      // node chỉ gắn với đúng 1 subtype/kênh, không có 2 kênh thật cùng dùng chung nodeId).
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
 * TỪNG người nhận — những lỗi đó chỉ đánh dấu người đó failed rồi đi tiếp người sau (v1 KHÔNG
 * retry — nâng cấp retry là việc của PR sau, không phải PR-3).
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
  } = ctx;

  let total = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const outputItems = [];

  const rows = resolveRecipientRows({ config, nodeOutputs, lastOutputItems });
  const recipients = await descriptor.adapter.resolveRecipients({ rows, config });
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  const account = await descriptor.adapter.resolveAccount({ userId, workspaceOwnerId, node, config });
  const perHourKey = `${descriptor.key}::${account?.accountKey ?? ''}`;

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
          });
          skipped += 1;
          stepIndex += 1;
          // F3 (review vòng 1) — đọc lại progress SAU KHI ledger vừa cập nhật (cache được làm mới
          // ngay trong upsertRecipientProgress, khuôn R:1929) — bước kế không được dùng object
          // progress cũ (firstSentAt/lastCompletedStep đã lệch với DB).
          // eslint-disable-next-line no-await-in-loop
          progress = await getRecipientProgress({ nodeId: node.id, channel: descriptor.key, recipientKey });
          continue;
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
          const delayMs = randomDelayMs(descriptor.policy?.minDelayMs, descriptor.policy?.maxDelayMs);
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
          const sendResult = await descriptor.adapter.sendOne({
            account,
            recipientKey,
            text,
            stepIndex: oneBasedStep,
          });
          // eslint-disable-next-line no-await-in-loop
          await campaignChannelMessageRepository.markSent(messageId, {
            providerMessageId: sendResult?.messageId || null,
          });
          if (quotaActive) {
            // eslint-disable-next-line no-await-in-loop
            await quotaGate.consume(reservationId, { responseSnapshot: sendResult || null });
          }
          hasSentAny = true;
          recordSendTimestamp(perHourKey, Date.now());
          // eslint-disable-next-line no-await-in-loop
          await markRecipientStepCompleted({
            nodeId: node.id,
            channel: descriptor.key,
            recipientKey,
            completedStep: oneBasedStep,
            totalSteps: steps.length,
            progress,
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
          if (messageId) {
            // eslint-disable-next-line no-await-in-loop
            await campaignChannelMessageRepository.markFailed(messageId, {
              errorCategory: category,
              errorMessage: sendError?.message || String(sendError),
            });
          }
          outputItems.push({
            ...recipient,
            status: 'failed',
            stepIndex: oneBasedStep,
            errorCategory: category,
          });

          if (category === 'hard' || category === 'transient') {
            // Review PR-5 — CHỈ lỗi bỏ cuộc mới cộng failed. Lỗi dừng-để-thử-lại (rate_limit/auth/
            // not_configured) mà cũng cộng thì resume gửi lại đúng bước đó và thành công → một bước đếm
            // cả failed lẫn success, vỡ ok+failed+skipped ≤ total (khuôn: lỗi còn thử lại không cộng
            // failedSends — email continuous R:4100–4105).
            failed += 1;
            // F2 — v1 KHÔNG retry: người này COI NHƯ XONG (bỏ cuộc), ghi ledger completedStep=
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
      }
    }
  } catch (loopError) {
    loopError.partialResult = { total, success, failed, skipped, outputItems };
    throw loopError;
  }

  return { total, success, failed, skipped, outputItems };
}

export default {
  runAdapterSendNode,
  isWithinQuietHours,
  computeQuietHoursWaitMs,
  createCampaignChannelQuotaGate,
  createNoopChannelQuotaGate,
  __resetPerHourWindowForTest,
};
