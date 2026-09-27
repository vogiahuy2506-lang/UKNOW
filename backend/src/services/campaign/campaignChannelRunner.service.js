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

const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PER_HOUR_MAX_WAIT_MS = 60 * 1000;

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

/** Bản mặc định engine truyền cho MỌI node adapter — PR-3 chưa kênh thật nào đăng ký nên nhánh
 * này không chạm production; PR-4 thay bằng quota thật (reserve/consume/release qua
 * send_quota_reservations). Throw ngay ở reserve() để không lặng lẽ bỏ qua quota. */
export function createDefaultChannelQuotaGate() {
  return {
    async reserve() {
      const error = new Error(
        'Quota kênh adapter chưa được đấu nối (PR-4 sẽ thay bằng quota thật) — không gửi.'
      );
      error.code = 'CHANNEL_QUOTA_NOT_WIRED';
      throw error;
    },
    async consume() {},
    async release() {},
  };
}

/** Bản no-op cho test tích hợp PR-3 (mock descriptor) — không giữ/trừ quota thật nào. */
export function createNoopChannelQuotaGate() {
  return {
    async reserve() {
      return null;
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

  for (const recipient of recipients) {
    await ensureRunStillRunning();
    const recipientKey = String(recipient?.recipientKey || '').trim();
    if (!recipientKey) continue;

    const progress = await getRecipientProgress({
      nodeId: node.id,
      channel: descriptor.key,
      recipientKey,
    });
    // Cộng total ĐÚNG MỘT LẦN — lần đầu thấy người này (chưa có dòng ledger cho run hiện tại),
    // khuôn R:4381 (email) — không cộng lại mỗi lần executeCampaign gọi lại (resume/chu kỳ sau).
    if (progress.updatedAt === null) {
      total += steps.length;
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
        continue;
      }

      // Pacing 1: quiet hours — trong khung thì dừng CẢ NODE (không phải chỉ người này).
      if (isWithinQuietHours(Date.now(), descriptor.policy?.quietHours)) {
        const quietError = new ChannelSendError(
          'quiet_hours',
          `Kênh ${descriptor.key} đang trong khung giờ yên lặng, dừng node ${node.id}.`
        );
        quietError.code = 'CHANNEL_QUIET_HOURS';
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

      // reserve() TRƯỚC insertQueued — lỗi ở đây (vd CHANNEL_QUOTA_NOT_WIRED khi engine chưa đấu
      // nối quota thật, Việc 4) LUÔN dừng cả node ngay, KHÔNG đi qua classifyError: đây là lỗi hạ
      // tầng, không phải lỗi gửi của riêng người nhận này.
      // eslint-disable-next-line no-await-in-loop
      const reservationId = await quotaGate.reserve({
        channel: descriptor.quotaChannel,
        quantity: 1,
        userId,
        workspaceOwnerId,
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
        if (reservationId) {
          // eslint-disable-next-line no-await-in-loop
          await quotaGate.consume(reservationId);
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
      } catch (sendError) {
        if (reservationId) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await quotaGate.release(reservationId);
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
        failed += 1;
        outputItems.push({
          ...recipient,
          status: 'failed',
          stepIndex: oneBasedStep,
          errorCategory: category,
        });

        if (category === 'hard' || category === 'transient') {
          // v1 KHÔNG retry — bỏ người này, đi tiếp người sau (không thử step tiếp theo của họ).
          stopRecipient = true;
          continue;
        }

        // 'rate_limit' | 'auth' | 'not_configured' — dừng CẢ NODE.
        const stopError = new Error(
          sendError?.message || `Kênh ${descriptor.key} dừng node ${node.id} (${category}).`
        );
        stopError.code = `CHANNEL_${String(category).toUpperCase()}`;
        throw stopError;
      }

      stepIndex += 1;
    }
  }

  return { total, success, failed, skipped, outputItems };
}

export default {
  runAdapterSendNode,
  isWithinQuietHours,
  createDefaultChannelQuotaGate,
  createNoopChannelQuotaGate,
  __resetPerHourWindowForTest,
};
