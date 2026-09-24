import { formatUtcAndVietnamForLog } from '../../utils/vnTimeFormat.util.js';
import { isZaloPhoneLookupRateLimitError } from '../../utils/zaloSendErrorClassifier.util.js';

/**
 * Kênh phải tra số điện thoại (findUser) trước khi gửi. Chỉ các kênh này tiêu hạn mức tra số
 * theo ngày của Zalo, nên chỉ chúng phải tuân cooldown tra số. Gửi nhóm đi thẳng theo groupId,
 * không tra số — production 06/09–16/09 (tài khoản 34, user 39): 155 tin nhóm gửi trong lúc
 * hai run cá nhân/kết bạn cùng tài khoản đốt hạn mức mỗi sáng, Zalo không từ chối tin nhóm nào;
 * 1.542 lỗi "quá nhiều" trong lịch sử đều là cá nhân/kết bạn. PR-2 (95a3a6f5) từng áp cooldown
 * cho mọi kênh, làm lịch nhóm 09:00 15/09 trượt sang 06:00 hôm sau.
 */
const PHONE_LOOKUP_CHANNELS = new Set(['zalo_personal', 'zalo_friend_request']);

export const ZALO_PERSONAL_DELAY_HARD_FLOOR_MS = 30_000;

/**
 * ZaloRateLimiter — Manages per-account Zalo outbound rate limiting state and policy.
 *
 * Extracted from CampaignRunService to keep rate-limit concerns in one place.
 * Accepts a config object in the constructor so it can be tested without process.env.
 */
class ZaloRateLimiter {
  /**
   * @param {object} config — all parsed env values for Zalo rate-limit policy
   */
  constructor(config = {}) {
    // Per-account+channel rate-limit state (shared across all runs in this process).
    this.zaloOutboundRateLimitState = new Map();
    // Phone-lookup cooldown per accountId — chỉ chặn các kênh trong PHONE_LOOKUP_CHANNELS.
    this.zaloPersonalPhoneLookupCooldownUntil = new Map();
    // Per-account mutex to serialise concurrent sends on the same account.
    this.zaloOutboundAccountMutex = new Map();

    // --- Config ---
    this.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT = config.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT ?? 100;
    this.ZALO_OUTBOUND_RATE_WINDOW_MS = config.ZALO_OUTBOUND_RATE_WINDOW_MS ?? 60 * 60 * 1000;
    this.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = config.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT ?? 20_000;
    this.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = config.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT ?? 50_000;
    if (this.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT < this.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT) {
      this.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = this.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT;
    }
    this.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = config.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE ?? 23;
    this.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = config.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE ?? 6;

    this.ZALO_PERSONAL_PER_HOUR_LIMIT = config.ZALO_PERSONAL_PER_HOUR_LIMIT ?? 0;
    this.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS = config.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS ?? 0;
    this.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS = config.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS ?? 0;
    this.ZALO_PERSONAL_BLOCK_SEND_LIMIT = config.ZALO_PERSONAL_BLOCK_SEND_LIMIT ?? 0;
    this.ZALO_PERSONAL_BLOCK_COOLDOWN_MS = config.ZALO_PERSONAL_BLOCK_COOLDOWN_MS ?? 0;

    this.ZALO_GROUP_PER_HOUR_LIMIT = config.ZALO_GROUP_PER_HOUR_LIMIT ?? 0;
    this.ZALO_GROUP_INTER_MESSAGE_MIN_MS = config.ZALO_GROUP_INTER_MESSAGE_MIN_MS ?? 0;
    this.ZALO_GROUP_INTER_MESSAGE_MAX_MS = config.ZALO_GROUP_INTER_MESSAGE_MAX_MS ?? 0;

    this.ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT = config.ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT ?? 0;
    this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS = config.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS ?? 0;
    this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS = config.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS ?? 0;

    this.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS = config.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS ?? 3 * 60 * 60 * 1000;
    this.ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS = config.ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS ?? 60_000;
  }

  // ---------------------------------------------------------------------------
  // Mutex
  // ---------------------------------------------------------------------------

  /**
   * Run `task` under a per-account mutex to serialise sends for the same Zalo account.
   *
   * @param {string|number} accountId
   * @param {() => Promise<any>} task
   * @returns {Promise<any>}
   */
  async runWithZaloAccountMutex(accountId, task) {
    const key = String(accountId || '').trim();
    if (!key || typeof task !== 'function') {
      return task();
    }

    const previous = this.zaloOutboundAccountMutex.get(key) || Promise.resolve();
    let releaseCurrent = null;
    const current = new Promise((resolve) => {
      releaseCurrent = resolve;
    });
    const combined = previous.finally(() => current);
    this.zaloOutboundAccountMutex.set(key, combined);

    try {
      await previous;
      return await task();
    } finally {
      releaseCurrent();
      if (this.zaloOutboundAccountMutex.get(key) === combined) {
        this.zaloOutboundAccountMutex.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phone-lookup cooldown
  // ---------------------------------------------------------------------------

  /**
   * Nhận diện lỗi Zalo khi tra số quá nhiều / vượt quota request.
   *
   * @param {unknown} error
   * @returns {boolean}
   */
  isZaloPersonalPhoneLookupRateLimitError(error) {
    return isZaloPhoneLookupRateLimitError(error);
  }

  /**
   * Đặt cooldown gửi Zalo cá nhân cho tài khoản (sau lỗi tra số quá nhiều).
   *
   * @param {string|number} accountId
   * @returns {number} epoch ms của mốc hết cooldown
   */
  scheduleZaloPersonalPhoneLookupCooldown(accountId) {
    const key = String(accountId ?? '').trim();
    if (!key) return 0;
    const nowMs = Date.now();
    const prevUntil = Number(this.zaloPersonalPhoneLookupCooldownUntil.get(key)) || 0;
    // Zalo tính hạn mức tra số THEO NGÀY, reset lúc 00:00 giờ VN — không phải "chặn N giờ kể từ
    // lúc gặp lỗi". Tính mốc 00:00 VN kế tiếp bằng kỹ thuật giống computeNextAllowedSendAtByQuietHours
    // (cộng offset +7 rồi đọc getUTC*, KHÔNG dùng múi giờ của OS/VPS).
    const utcPlusSevenOffsetMs = 7 * 60 * 60 * 1000;
    const shifted = new Date(nowMs + utcPlusSevenOffsetMs);
    let candidateUntil = Date.UTC(
      shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1, 0, 0, 0, 0
    ) - utcPlusSevenOffsetMs;
    // Dự phòng nếu vì lý do nào đó tính mốc nửa đêm ra giá trị vô lý (không > now) — giữ hành vi
    // an toàn cũ (cộng thêm ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS) thay vì trả một mốc đã qua.
    if (!(candidateUntil > nowMs)) {
      candidateUntil = nowMs + this.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS;
    }
    const untilMs = Math.max(prevUntil, candidateUntil);
    this.zaloPersonalPhoneLookupCooldownUntil.set(key, untilMs);
    return untilMs;
  }

  /**
   * Trả về mốc hết cooldown tra số của accountId (0 nếu không có cooldown).
   *
   * @param {string|number} accountId
   * @returns {number}
   */
  getPhoneLookupCooldownUntil(accountId) {
    return Number(this.zaloPersonalPhoneLookupCooldownUntil.get(String(accountId || '').trim())) || 0;
  }

  // ---------------------------------------------------------------------------
  // Policy helpers
  // ---------------------------------------------------------------------------

  /**
   * Giải thích khung giờ yên lặng Zalo cho log vận hành.
   *
   * @returns {string}
   */
  explainQuietHoursPolicyForLog() {
    const qs = this.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
    const qe = this.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
    return (
      `chặn gửi từ ${qs}h đêm đến trước ${qe}h sáng (giờ Việt Nam, Asia/Ho_Chi_Minh; không dùng giờ UTC của VPS hay múi hệ thống)`
    );
  }

  /**
   * Nếu đang trong khung giờ yên lặng (mặc định 23:00–06:00), trả về mốc được phép gửi tiếp theo.
   *
   * @param {number} nowMs
   * @returns {number|null} epoch ms, hoặc null nếu không bị chặn.
   */
  computeNextAllowedSendAtByQuietHours(nowMs) {
    const utcPlusSevenOffsetMs = 7 * 60 * 60 * 1000;
    const shifted = new Date(nowMs + utcPlusSevenOffsetMs);
    const hour = shifted.getUTCHours();
    const quietStart = this.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
    const quietEnd = this.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
    const isQuiet = hour >= quietStart || hour < quietEnd;
    if (!isQuiet) return null;

    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    const day = shifted.getUTCDate();
    const addDays = hour >= quietStart ? 1 : 0;
    const targetLocalUtcMs = Date.UTC(year, month, day + addDays, quietEnd, 0, 0, 0);
    const targetEpochMs = targetLocalUtcMs - utcPlusSevenOffsetMs;
    return targetEpochMs > nowMs ? targetEpochMs : null;
  }

  /**
   * Tính toán các tham số rate-limit cho từng kênh Zalo.
   *
   * @param {'zalo_personal'|'zalo_group'|'zalo_friend_request'} channel
   * @param {object|null} [accountHint]
   * @returns {{limitPerWindow: number, windowMs: number, minDelayMs: number, maxDelayMs: number}}
   */
  resolveOutboundPolicy(channel, accountHint = null) {
    const base = {
      limitPerWindow: this.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT,
      windowMs: this.ZALO_OUTBOUND_RATE_WINDOW_MS,
      minDelayMs: this.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT,
      maxDelayMs: this.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT,
    };
    const safeChannel = String(channel || '').trim();
    let policy;
    if (safeChannel === 'zalo_group') {
      const limit = this.ZALO_GROUP_PER_HOUR_LIMIT > 0 ? this.ZALO_GROUP_PER_HOUR_LIMIT : 0;
      const minMs = this.ZALO_GROUP_INTER_MESSAGE_MIN_MS > 0 ? this.ZALO_GROUP_INTER_MESSAGE_MIN_MS : 0;
      const maxMs = this.ZALO_GROUP_INTER_MESSAGE_MAX_MS > 0 ? this.ZALO_GROUP_INTER_MESSAGE_MAX_MS : 0;
      policy = {
        ...base,
        ...(limit ? { limitPerWindow: limit } : {}),
        ...(minMs ? { minDelayMs: minMs } : {}),
        ...(maxMs ? { maxDelayMs: maxMs } : {}),
      };
    } else if (safeChannel === 'zalo_friend_request') {
      const limit = this.ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT > 0 ? this.ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT : 0;
      const minMs = this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS > 0 ? this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS : 0;
      const maxMs = this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS > 0 ? this.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS : 0;
      policy = {
        ...base,
        ...(limit ? { limitPerWindow: limit } : {}),
        ...(minMs ? { minDelayMs: minMs } : {}),
        ...(maxMs ? { maxDelayMs: maxMs } : {}),
      };
    } else {
      // default: zalo_personal
      const legacyLimit = this.ZALO_PERSONAL_BLOCK_SEND_LIMIT > 0 ? this.ZALO_PERSONAL_BLOCK_SEND_LIMIT : 0;
      const legacyWindow = this.ZALO_PERSONAL_BLOCK_COOLDOWN_MS > 0 ? this.ZALO_PERSONAL_BLOCK_COOLDOWN_MS : 0;
      const limit = this.ZALO_PERSONAL_PER_HOUR_LIMIT > 0 ? this.ZALO_PERSONAL_PER_HOUR_LIMIT : legacyLimit;
      const minMs = this.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS > 0 ? this.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS : 0;
      const maxMs = this.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS > 0 ? this.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS : 0;
      policy = {
        ...base,
        ...(limit ? { limitPerWindow: limit } : {}),
        ...(legacyWindow ? { windowMs: legacyWindow } : {}),
        ...(minMs ? { minDelayMs: minMs } : {}),
        ...(maxMs ? { maxDelayMs: maxMs } : {}),
      };
    }
    if (safeChannel === 'zalo_personal' && accountHint && typeof accountHint === 'object') {
      const accLim = Number.parseInt(accountHint.zaloPersonalOutboundPerHourLimit, 10);
      if (Number.isFinite(accLim) && accLim > 0) {
        policy = { ...policy, limitPerWindow: accLim };
      }
      // Ghi đè theo tài khoản — 3 mức người dùng chọn (PATCH /zalo/accounts/:id/send-speed) hoặc giá
      // trị đặt tay bằng SQL — ĐƯỢC PHÉP nhanh hơn mức chung (từ 24/09; trước đó chỉ được chậm hơn),
      // nhưng không bao giờ dưới sàn cứng ZALO_PERSONAL_DELAY_HARD_FLOOR_MS (30 giây). Sàn có vì hai
      // lẽ: đã từng có người đặt thẳng 0 giây, tự đưa nick của khách vào diện chống spam; và mọi nick
      // của mọi khách đều gửi từ CÙNG một IP máy chủ.
      // Sàn CHỈ áp cho giá trị ghi đè: không có ghi đè thì dùng nguyên mức env (production 80–150s,
      // dev 20–50s), không kẹp lên 30s.
      // max kẹp theo min SAU khi kẹp, KHÔNG theo max của env — kẹp theo env max thì mức 30–60s thành
      // 30–150s, vẫn "nhanh hơn" nên rất khó phát hiện.
      const floorMin = policy.minDelayMs;
      const floorMax = policy.maxDelayMs;
      const dMin = Number.parseInt(accountHint.zaloPersonalOutboundDelayMinMs, 10);
      const dMax = Number.parseInt(accountHint.zaloPersonalOutboundDelayMaxMs, 10);
      let nextMin = floorMin;
      let nextMax = floorMax;
      if (Number.isFinite(dMin) && dMin >= 0) {
        nextMin = Math.max(ZALO_PERSONAL_DELAY_HARD_FLOOR_MS, dMin);
      }
      if (Number.isFinite(dMax) && dMax >= 0) {
        nextMax = Math.max(nextMin, dMax);
      }
      nextMax = Math.max(nextMin, nextMax);
      policy = { ...policy, minDelayMs: nextMin, maxDelayMs: nextMax };
    }
    return policy;
  }

  /**
   * Đọc quota outbound hiện tại cho account/channel, không mutate state.
   *
   * @param {string|number} accountId
   * @param {'zalo_personal'|'zalo_group'|'zalo_friend_request'} channel
   * @param {object|null} [accountHint]
   * @returns {{attemptCount: number, successCount: number, limitPerWindow: number, windowStartMs: number|null, windowResetInMs: number|null, windowMs: number, lastAttemptAtMs: number|null}}
   */
  getOutboundQuotaStatus(accountId, channel, accountHint = null) {
    const safeAccountId = String(accountId || '').trim();
    const safeChannel = String(channel || '').trim() || 'zalo_personal';
    const policy = this.resolveOutboundPolicy(safeChannel, accountHint);
    const windowMs = Math.max(1, Number.parseInt(policy.windowMs, 10) || (60 * 60 * 1000));
    const limitPerWindow = Math.max(1, Number.parseInt(policy.limitPerWindow, 10) || 1);
    const current = safeAccountId
      ? this.zaloOutboundRateLimitState.get(`${safeAccountId}:${safeChannel}`)
      : null;
    const nowMs = Date.now();
    if (!current || !Number.isFinite(Number(current.windowStartMs))) {
      return {
        attemptCount: 0,
        /** @deprecated dùng attemptCount — giữ alias cho Diagnostic UI cũ */
        successCount: 0,
        limitPerWindow,
        windowStartMs: null,
        windowResetInMs: null,
        windowMs,
        lastAttemptAtMs: null,
      };
    }
    const windowStartMs = Number(current.windowStartMs);
    const expired = nowMs - windowStartMs >= windowMs;
    const attemptCount = expired ? 0 : Math.max(0, Number.parseInt(current.attemptCount, 10) || 0);
    return {
      attemptCount,
      successCount: attemptCount,
      limitPerWindow,
      windowStartMs,
      windowResetInMs: expired ? 0 : Math.max(0, windowStartMs + windowMs - nowMs),
      windowMs,
      lastAttemptAtMs: Number.isFinite(Number(current.lastAttemptAtMs)) ? Number(current.lastAttemptAtMs) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Rate-limit state mutations
  // ---------------------------------------------------------------------------

  /**
   * Legacy no-op — hạn mức giờ đã đếm theo lần thử trong
   * `enforceOutboundPolicyBeforeSend` (P1-2). Giữ tên để call site cũ không gãy.
   */
  markOutboundSuccess() {
    // intentionally empty
  }

  /**
   * Enforce rate-limit + giờ yên lặng cho outbound Zalo theo `accountId + channel`.
   * Delegates sleeping / yielding to the provided callbacks so the caller controls I/O.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {'zalo_personal'|'zalo_group'|'zalo_friend_request'} input.channel
   * @param {object|null} [input.zaloAccountPolicyHint]
   * @param {boolean} [input.requiresPhoneLookup=true]
   * @param {(waitMs: number, reason: string, context?: object) => Promise<void>} input.yieldOrSleep
   * @param {(waitMs: number) => Promise<void>} input.sleepWithRunCheck
   * @param {() => Promise<void>} input.ensureRunStillRunning
   * @param {number} [input.runId]
   */
  async enforceOutboundPolicyBeforeSend({
    accountId,
    channel,
    zaloAccountPolicyHint = null,
    yieldOrSleep,
    sleepWithRunCheck,
    ensureRunStillRunning,
    runId = 0,
    requiresPhoneLookup = true,
  }) {
    const safeAccountId = String(accountId || '').trim();
    const safeChannel = String(channel || '').trim();
    if (!safeAccountId || !safeChannel) return;

    const stateKey = `${safeAccountId}:${safeChannel}`;
    const utcPlusSevenOffsetMs = 7 * 60 * 60 * 1000;
    while (true) {
      await ensureRunStillRunning();
      const nowMs = Date.now();

      // Cooldown tra số điện thoại quá nhiều — cooldown ghi theo TÀI KHOẢN Zalo, nhưng chỉ kênh
      // có tra số (personal/friend_request) mới tiêu hạn mức đó; kênh nhóm gửi theo groupId nên
      // đi thẳng (xem PHONE_LOOKUP_CHANNELS).
      const phoneLookupUntilMs = PHONE_LOOKUP_CHANNELS.has(safeChannel) && requiresPhoneLookup
        ? Number(this.zaloPersonalPhoneLookupCooldownUntil.get(safeAccountId)) || 0
        : 0;
      const accountContext = {
        accountId: safeAccountId,
        accountName: zaloAccountPolicyHint?.displayName || zaloAccountPolicyHint?.name || null,
      };

      if (phoneLookupUntilMs > nowMs) {
        const waitMs = phoneLookupUntilMs - nowMs;
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `phone_lookup_cooldown=true wait_ms=${waitMs}`
        );
        await yieldOrSleep(waitMs, 'phone_lookup_cooldown', accountContext);
        continue;
      }

      const quietUntilMs = this.computeNextAllowedSendAtByQuietHours(nowMs);
      if (quietUntilMs) {
        const waitMs = Math.max(0, quietUntilMs - nowMs);
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `quiet_hours=true (${this.explainQuietHoursPolicyForLog()}) `
          + `resume_at=${formatUtcAndVietnamForLog(quietUntilMs)} wait_ms=${waitMs}`
        );
        await yieldOrSleep(waitMs, 'quiet_hours', accountContext);
        continue;
      }

      const policy = this.resolveOutboundPolicy(safeChannel, zaloAccountPolicyHint);
      const limitPerWindow = Math.max(1, Number.parseInt(policy.limitPerWindow, 10) || 1);
      const windowMs = Math.max(1, Number.parseInt(policy.windowMs, 10) || (60 * 60 * 1000));
      const minDelayMs = Math.max(0, Number.parseInt(policy.minDelayMs, 10) || 0);
      const maxDelayMs = Math.max(minDelayMs, Number.parseInt(policy.maxDelayMs, 10) || minDelayMs);

      const current = this.zaloOutboundRateLimitState.get(stateKey) || {
        windowStartMs: nowMs,
        attemptCount: 0,
        lastAttemptAtMs: null,
        policyFingerprint: null,
      };
      const policyFingerprint = `${limitPerWindow}:${windowMs}:${minDelayMs}:${maxDelayMs}`;
      if (current.policyFingerprint != null && current.policyFingerprint !== policyFingerprint) {
        current.windowStartMs = nowMs;
        current.attemptCount = 0;
        current.lastAttemptAtMs = null;
      }
      current.policyFingerprint = policyFingerprint;
      if (nowMs - current.windowStartMs >= windowMs) {
        this.zaloOutboundRateLimitState.delete(stateKey);
        current.windowStartMs = nowMs;
        current.attemptCount = 0;
      }

      if (current.attemptCount >= limitPerWindow) {
        const targetMs = current.windowStartMs + windowMs;
        const waitMs = Math.max(0, targetMs - nowMs);
        const shifted = new Date(nowMs + utcPlusSevenOffsetMs);
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `rate_limited=true attempts=${current.attemptCount}/${limitPerWindow} `
          + `window_start=${current.windowStartMs} now_local=${shifted.toISOString()} wait_ms=${waitMs}`
        );
        await yieldOrSleep(waitMs, 'rate_limited', accountContext);
        continue;
      }

      if (current.lastAttemptAtMs) {
        const delayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `inter_message_delay_ms=${delayMs}`
        );
        await sleepWithRunCheck(delayMs);
        current.lastAttemptAtMs = null;
        this.zaloOutboundRateLimitState.set(stateKey, current);
        continue;
      }

      // Đếm lần thử (không chỉ thành công) — Zalo tính mọi request vào anti-spam.
      current.lastAttemptAtMs = nowMs;
      current.attemptCount += 1;
      this.zaloOutboundRateLimitState.set(stateKey, current);
      return;
    }
  }
}

export default ZaloRateLimiter;
