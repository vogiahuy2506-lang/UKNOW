import { formatUtcAndVietnamForLog } from '../../utils/vnTimeFormat.util.js';
import { isZaloPhoneLookupRateLimitError } from '../../utils/zaloSendErrorClassifier.util.js';

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
    // Phone-lookup cooldown per accountId (zalo_personal only).
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
    const candidateUntil = nowMs + this.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS;
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
      const dMin = Number.parseInt(accountHint.zaloPersonalOutboundDelayMinMs, 10);
      const dMax = Number.parseInt(accountHint.zaloPersonalOutboundDelayMaxMs, 10);
      let nextMin = policy.minDelayMs;
      let nextMax = policy.maxDelayMs;
      if (Number.isFinite(dMin) && dMin >= 0) {
        nextMin = dMin;
      }
      if (Number.isFinite(dMax) && dMax >= 0) {
        nextMax = dMax;
      }
      nextMax = Math.max(nextMin, nextMax);
      policy = { ...policy, minDelayMs: nextMin, maxDelayMs: nextMax };
    }
    return policy;
  }

  // ---------------------------------------------------------------------------
  // Rate-limit state mutations
  // ---------------------------------------------------------------------------

  /**
   * Ghi nhận một lần gửi thành công để tính quota theo giờ.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {'zalo_personal'|'zalo_group'|'zalo_friend_request'} input.channel
   * @param {object|null} [input.zaloAccountPolicyHint]
   */
  markOutboundSuccess({ accountId, channel, zaloAccountPolicyHint = null }) {
    const safeAccountId = String(accountId || '').trim();
    const safeChannel = String(channel || '').trim();
    if (!safeAccountId || !safeChannel) return;
    const stateKey = `${safeAccountId}:${safeChannel}`;
    const nowMs = Date.now();
    const current = this.zaloOutboundRateLimitState.get(stateKey) || {
      windowStartMs: nowMs,
      successCount: 0,
      lastAttemptAtMs: null,
      policyFingerprint: null,
    };
    const policy = this.resolveOutboundPolicy(safeChannel, zaloAccountPolicyHint);
    const windowMs = Math.max(1, Number.parseInt(policy.windowMs, 10) || (60 * 60 * 1000));
    if (nowMs - current.windowStartMs >= windowMs) {
      this.zaloOutboundRateLimitState.delete(stateKey);
      current.windowStartMs = nowMs;
      current.successCount = 0;
    }
    current.successCount += 1;
    this.zaloOutboundRateLimitState.set(stateKey, current);
  }

  /**
   * Enforce rate-limit + giờ yên lặng cho outbound Zalo theo `accountId + channel`.
   * Delegates sleeping / yielding to the provided callbacks so the caller controls I/O.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {'zalo_personal'|'zalo_group'|'zalo_friend_request'} input.channel
   * @param {object|null} [input.zaloAccountPolicyHint]
   * @param {(waitMs: number, reason: string) => Promise<void>} input.yieldOrSleep
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
  }) {
    const safeAccountId = String(accountId || '').trim();
    const safeChannel = String(channel || '').trim();
    if (!safeAccountId || !safeChannel) return;

    const stateKey = `${safeAccountId}:${safeChannel}`;
    const utcPlusSevenOffsetMs = 7 * 60 * 60 * 1000;
    while (true) {
      await ensureRunStillRunning();
      const nowMs = Date.now();

      // Cooldown tra số điện thoại quá nhiều (chỉ áp kênh cá nhân).
      if (safeChannel === 'zalo_personal') {
        const phoneLookupUntilMs = Number(this.zaloPersonalPhoneLookupCooldownUntil.get(safeAccountId)) || 0;
        if (phoneLookupUntilMs > nowMs) {
          const waitMs = phoneLookupUntilMs - nowMs;
          console.log(
            `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
            + `phone_lookup_cooldown=true wait_ms=${waitMs}`
          );
          await yieldOrSleep(waitMs, 'phone_lookup_cooldown');
          continue;
        }
      }

      const quietUntilMs = this.computeNextAllowedSendAtByQuietHours(nowMs);
      if (quietUntilMs) {
        const waitMs = Math.max(0, quietUntilMs - nowMs);
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `quiet_hours=true (${this.explainQuietHoursPolicyForLog()}) `
          + `resume_at=${formatUtcAndVietnamForLog(quietUntilMs)} wait_ms=${waitMs}`
        );
        await yieldOrSleep(waitMs, 'quiet_hours');
        continue;
      }

      const policy = this.resolveOutboundPolicy(safeChannel, zaloAccountPolicyHint);
      const limitPerWindow = Math.max(1, Number.parseInt(policy.limitPerWindow, 10) || 1);
      const windowMs = Math.max(1, Number.parseInt(policy.windowMs, 10) || (60 * 60 * 1000));
      const minDelayMs = Math.max(0, Number.parseInt(policy.minDelayMs, 10) || 0);
      const maxDelayMs = Math.max(minDelayMs, Number.parseInt(policy.maxDelayMs, 10) || minDelayMs);

      const current = this.zaloOutboundRateLimitState.get(stateKey) || {
        windowStartMs: nowMs,
        successCount: 0,
        lastAttemptAtMs: null,
        policyFingerprint: null,
      };
      const policyFingerprint = `${limitPerWindow}:${windowMs}:${minDelayMs}:${maxDelayMs}`;
      if (current.policyFingerprint != null && current.policyFingerprint !== policyFingerprint) {
        current.windowStartMs = nowMs;
        current.successCount = 0;
        current.lastAttemptAtMs = null;
      }
      current.policyFingerprint = policyFingerprint;
      if (nowMs - current.windowStartMs >= windowMs) {
        this.zaloOutboundRateLimitState.delete(stateKey);
        current.windowStartMs = nowMs;
        current.successCount = 0;
      }

      if (current.successCount >= limitPerWindow) {
        const targetMs = current.windowStartMs + windowMs;
        const waitMs = Math.max(0, targetMs - nowMs);
        const shifted = new Date(nowMs + utcPlusSevenOffsetMs);
        console.log(
          `[CampaignRun][ZaloOutbound] run=${runId} channel=${safeChannel} account=${safeAccountId} `
          + `rate_limited=true success=${current.successCount}/${limitPerWindow} `
          + `window_start=${current.windowStartMs} now_local=${shifted.toISOString()} wait_ms=${waitMs}`
        );
        await yieldOrSleep(waitMs, 'rate_limited');
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

      current.lastAttemptAtMs = nowMs;
      this.zaloOutboundRateLimitState.set(stateKey, current);
      return;
    }
  }
}

export default ZaloRateLimiter;
