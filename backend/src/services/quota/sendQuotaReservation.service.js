import db, { isConnectionError } from '../../config/database.js';
import {
  acquireWorkspaceQuotaLock,
  createReservation,
  findReservationByKey,
  findReservationById,
  transitionReservationState,
  validateReservationKey,
  validateProviderReference,
  validateFailureCode,
  countEmailSentTodayWithLedger,
  countZaloSentTodayWithLedger,
  countEmailSentInCycleWithLedger,
  countZaloSentInCycleWithLedger,
  countCombinedSentInCycleWithLedger,
  countEmployeeSentTodayWithLedger,
  countEmployeeSentInCycleWithLedger,
  getWorkspacePlanLimits,
  getEmployeeSendLimits,
  getWalletAvailableBalance,
} from '../../repositories/sendQuota.repository.js';
import {
  acquireWalletLock,
  insertTopupDebit,
} from '../../repositories/payment/topup.repository.js';
import {
  computeRequestFingerprint,
  validateFingerprint,
} from './sendQuotaKey.service.js';
import {
  nextVnMidnight,
  nextVnMonthStart,
  _clearQuotaCache,
  checkSendQuota,
} from '../../utils/userSendLimit.util.js';
import { getBillingCycle, resolveBillingUserId } from '../../utils/billingCycle.util.js';

export const SEND_QUOTA_RESERVATION_MODE = process.env.SEND_QUOTA_RESERVATION_MODE || 'off';

export const SUBSCRIPTION_EXPIRED_MSG =
  'Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục gửi.';
export const NO_PLAN_MSG =
  'Gói dịch vụ không hợp lệ hoặc đã bị vô hiệu hóa.';
export const PERIOD_LIMIT_MSG = (count, limit) =>
  `Đã đạt giới hạn tổng tin nhắn trong kỳ (${count}/${limit} tin). Hạn mức sẽ reset vào chu kỳ mới.`;

const _initialShadowMetrics = () => ({
  total: 0,
  mismatches: 0,
  legacy_allow_atomic_deny: 0,
  legacy_deny_atomic_allow: 0,
  atomic_candidate_error: 0,
});

let _shadowMetrics = _initialShadowMetrics();

/**
 * Returns detailed multidimensional metrics of shadow mode evaluations.
 */
export function getShadowMismatchMetrics() {
  return {
    ..._shadowMetrics,
    count: _shadowMetrics.mismatches, // backward-compatibility alias
  };
}

/**
 * Reset shadow mismatch counters (used in tests).
 */
export function resetShadowMismatchMetrics() {
  _shadowMetrics = _initialShadowMetrics();
}

/**
 * Record a shadow mode evaluation outcome.
 */
export function recordShadowEvaluation({ legacyAllowed, atomicAllowed, atomicError, billingUserId, userId, channel }) {
  _shadowMetrics.total++;
  // Distinguish true infrastructure/system errors from legitimate business limit denials (status 403)
  if (atomicError && (!atomicError.status || atomicError.status >= 500)) {
    _shadowMetrics.atomic_candidate_error++;
  }
  const isMismatch = legacyAllowed !== atomicAllowed;
  if (isMismatch) {
    _shadowMetrics.mismatches++;
    if (legacyAllowed && !atomicAllowed) {
      _shadowMetrics.legacy_allow_atomic_deny++;
    } else if (!legacyAllowed && atomicAllowed) {
      _shadowMetrics.legacy_deny_atomic_allow++;
    }
    console.warn(
      `[SendQuota] Shadow mismatch for user ${billingUserId || userId} (${channel}): legacy=${legacyAllowed}, atomic=${atomicAllowed}, error=${atomicError?.message || 'none'}`
    );
  }
}

/**
 * Backward compatibility alias for single mismatch logging.
 */
export function recordShadowMismatch(details) {
  recordShadowEvaluation(details);
}

function toInt(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * Maps database/infrastructure errors to HTTP 503 SEND_QUOTA_UNAVAILABLE,
 * while preserving explicit 4xx business/client validation errors.
 */
function mapToServiceUnavailableIfInternal(err) {
  if (!err) return err;
  if (err.status && err.status >= 400 && err.status < 500) {
    return err;
  }
  const serviceErr = new Error('Dịch vụ kiểm tra hạn mức đang bận, vui lòng thử lại sau giây lát');
  serviceErr.status = 503;
  serviceErr.code = 'SEND_QUOTA_UNAVAILABLE';
  serviceErr.cause = err;
  return serviceErr;
}

/**
 * Returns current Vietnam day boundaries (00:00:00 to 23:59:59.999 VN).
 * @param {Date} [now]
 * @returns {{ vnDayStart: Date, vnDayEnd: Date }}
 */
export function getVnDayBoundaries(now = new Date()) {
  const vnEnd = nextVnMidnight(now);
  const vnStart = new Date(vnEnd.getTime() - 24 * 60 * 60 * 1000);
  return { vnDayStart: vnStart, vnDayEnd: vnEnd };
}

/**
 * Validates and enforces operational mode guard for all public send quota operations.
 * - 'off': Always returns safe stub, never accesses DB.
 * - 'shadow': Executes shadow comparison without persisting reservation/wallet hold.
 * - 'enforce': Executes atomic reservation and state transitions.
 * - 'test_enforce': Test bypass when NODE_ENV === 'test'.
 *
 * NOTE: Source allowlist (SEND_QUOTA_RESERVATION_SOURCES / SEND_QUOTA_RESERVATION_ALLOWLIST)
 * applies STRICTLY to admission control (reserveSendQuota / isAdmission: true).
 * Existing reservations that have already been admitted MUST ALWAYS be allowed to settle
 * (markSendQuotaSending, consumeSendQuota, releaseSendQuota, markSendQuotaUncertain),
 * even if their source is unlisted or dynamically removed from rollout.
 *
 * @param {object} [options]
 * @param {object|null} [params]
 * @param {object} [context]
 * @param {boolean} [context.isAdmission]
 * @returns {{ mode: string, isTestEnforce: boolean, skippedByAllowlist?: boolean, reason?: string }}
 */
export function assertReservationOperationMode(options = {}, params = null, { isAdmission = false } = {}) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const configuredMode = process.env.SEND_QUOTA_RESERVATION_MODE || SEND_QUOTA_RESERVATION_MODE;
  const effectiveMode = isTestEnv && options.modeOverride
    ? options.modeOverride
    : configuredMode;

  if (effectiveMode === 'off') {
    return { mode: 'off', isTestEnforce: false };
  }

  // Check source allowlist ONLY during admission (creating a new reservation in reserveSendQuota)
  const shouldCheckAllowlist = isAdmission || options.isAdmission || (params !== null && typeof params === 'object' && ('sourceType' in params || 'source' in params || 'isAdmission' in params));
  if (shouldCheckAllowlist) {
    const configuredSources = process.env.SEND_QUOTA_RESERVATION_SOURCES || process.env.SEND_QUOTA_RESERVATION_ALLOWLIST;
    if (configuredSources && configuredSources.trim() !== '*' && configuredSources.trim() !== 'all') {
      const rawSource = params?.sourceType || params?.source || options?.source || options?.sourceType;
      let sourceStr = rawSource ? String(rawSource).trim().toLowerCase() : '';
      if (sourceStr === 'direct') sourceStr = 'direct_email';
      const allowedSources = configuredSources
        .split(',')
        .map((s) => {
          const clean = s.trim().toLowerCase();
          return clean === 'direct' ? 'direct_email' : clean;
        })
        .filter(Boolean);

      if (!sourceStr || !allowedSources.includes(sourceStr)) {
        return {
          mode: 'off',
          isTestEnforce: false,
          skippedByAllowlist: true,
          reason: 'source_not_in_allowlist',
        };
      }
    }
  }

  if (effectiveMode === 'shadow') {
    return { mode: 'shadow', isTestEnforce: false };
  }

  if (effectiveMode === 'enforce') {
    return { mode: 'enforce', isTestEnforce: false };
  }

  if (effectiveMode === 'test_enforce' || (isTestEnv && options.allowTestEnforce)) {
    return { mode: 'enforce', isTestEnforce: true };
  }

  const err = new Error(
    `SEND_QUOTA_RESERVATION_MODE='${effectiveMode}' is not recognized or not enabled`
  );
  err.status = 503;
  err.code = 'RESERVATION_MODE_NOT_IMPLEMENTED';
  throw err;
}

/**
 * Atomic evaluation of quota policies across 4 tiers:
 * Tier 1: Employee limits
 * Tier 2: Workspace plan status & daily limits
 * Tier 3: Workspace plan monthly limits & topup wallet fallback
 * Tier 4: Workspace combined period limits
 *
 * Runs strictly within the provided queryable/client under acquireWorkspaceQuotaLock.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @returns {Promise<{ allowed: boolean, walletItemKey: string|null, walletQuantity: number }>}
 */
export async function evaluateReservationQuotaPolicy(client, params) {
  const {
    billingUserId: initialBillingUserId,
    actorUserId = null,
    ownerContextId = null,
    userId,
    channel,
    quantity = 1,
    isMetered = true,
    vnDayStart,
    vnDayEnd,
    cycleStart,
    cycleEnd,
  } = params;

  if (!isMetered) {
    return { allowed: true, walletItemKey: null, walletQuantity: 0 };
  }

  const billingUserId = initialBillingUserId || (await resolveBillingUserId(userId, { ownerContextId }, client));

  const isEmail = channel === 'email';
  const channelLabel = isEmail ? 'Email' : 'Zalo';
  const unitLabel = isEmail ? 'email' : 'tin';

  // 1. Employee limits check (Tier 1)
  const isEmployee =
    (actorUserId != null && String(actorUserId) !== String(billingUserId)) ||
    (ownerContextId != null && String(ownerContextId) !== String(userId)) ||
    (billingUserId != null && String(billingUserId) !== String(userId));
  const effectiveActorUserId = isEmployee ? (actorUserId || userId) : null;

  if (isEmployee && effectiveActorUserId) {
    const empLimits = await getEmployeeSendLimits(client, billingUserId, effectiveActorUserId);
    if (empLimits) {
      if (empLimits.status !== 'active') {
        const err = new Error('Tài khoản nhân viên đang tạm khóa hoặc không còn trong workspace.');
        err.status = 403;
        err.code = 'RESOURCE_LIMIT_EXCEEDED';
        err.limitType = 'employee_inactive';
        err.limit = 0;
        err.currentCount = 0;
        err.resetAt = null;
        err.billingUserId = billingUserId;
        throw err;
      }

      const empDailyLimit = toInt(isEmail ? empLimits.daily_email_limit : empLimits.daily_zalo_limit);
      if (empDailyLimit !== null) {
        if (empDailyLimit === 0) {
          const err = new Error(`Hạn mức gửi ${channelLabel} trong ngày của bạn là 0. Vui lòng liên hệ chủ workspace.`);
          err.status = 403;
          err.code = 'RESOURCE_LIMIT_EXCEEDED';
          err.limitType = 'employee';
          err.limit = 0;
          err.currentCount = 0;
          err.resetAt = null;
          err.billingUserId = billingUserId;
          throw err;
        }

        const empDailyCount = await countEmployeeSentTodayWithLedger(
          client,
          billingUserId,
          effectiveActorUserId,
          channel,
          vnDayStart,
          vnDayEnd
        );
        if (empDailyCount + quantity > empDailyLimit) {
          const err = new Error(
            `Đã đạt giới hạn gửi ${channelLabel} trong ngày của nhân viên (${empDailyCount}/${empDailyLimit} ${unitLabel}). Hạn mức sẽ reset vào 00:00 ngày mai.`
          );
          err.status = 403;
          err.code = 'RESOURCE_LIMIT_EXCEEDED';
          err.limitType = 'employee';
          err.limit = empDailyLimit;
          err.currentCount = empDailyCount;
          err.resetAt = vnDayEnd;
          err.billingUserId = billingUserId;
          throw err;
        }
      }

      const empMonthlyLimit = toInt(isEmail ? empLimits.monthly_email_limit : empLimits.monthly_zalo_limit);
      if (empMonthlyLimit !== null) {
        if (empMonthlyLimit === 0) {
          const err = new Error(`Hạn mức gửi ${channelLabel} trong tháng của bạn là 0. Vui lòng liên hệ chủ workspace.`);
          err.status = 403;
          err.code = 'RESOURCE_LIMIT_EXCEEDED';
          err.limitType = 'employee';
          err.limit = 0;
          err.currentCount = 0;
          err.resetAt = null;
          err.billingUserId = billingUserId;
          throw err;
        }

        if (cycleStart && cycleEnd) {
          const empMonthlyCount = await countEmployeeSentInCycleWithLedger(
            client,
            billingUserId,
            effectiveActorUserId,
            channel,
            cycleStart,
            cycleEnd
          );
          if (empMonthlyCount + quantity > empMonthlyLimit) {
            const resetDate = cycleEnd instanceof Date ? cycleEnd : (cycleEnd ? new Date(cycleEnd) : nextVnMonthStart());
            const err = new Error(
              `Đã đạt giới hạn gửi ${channelLabel} trong tháng của nhân viên (${empMonthlyCount}/${empMonthlyLimit} ${unitLabel}). Vui lòng liên hệ chủ workspace.`
            );
            err.status = 403;
            err.code = 'RESOURCE_LIMIT_EXCEEDED';
            err.limitType = 'employee';
            err.limit = empMonthlyLimit;
            err.currentCount = empMonthlyCount;
            err.resetAt = resetDate;
            err.billingUserId = billingUserId;
            throw err;
          }
        }
      }
    }
  }

  // 2. Workspace plan status & daily limit (Tier 2)
  const planInfo = await getWorkspacePlanLimits(client, billingUserId);
  if (!planInfo || !planInfo.has_plan) {
    const err = new Error(NO_PLAN_MSG);
    err.status = 403;
    err.code = 'RESOURCE_LIMIT_EXCEEDED';
    err.limitType = 'no_plan';
    err.limit = 0;
    err.currentCount = 0;
    err.billingUserId = billingUserId;
    throw err;
  }

  if (planInfo.is_subscription_expired) {
    const err = new Error(SUBSCRIPTION_EXPIRED_MSG);
    err.status = 403;
    err.code = 'RESOURCE_LIMIT_EXCEEDED';
    err.limitType = 'subscription_expired';
    err.limit = 0;
    err.currentCount = 0;
    err.billingUserId = billingUserId;
    throw err;
  }

  const dailyLimit = toInt(isEmail ? planInfo.daily_email_limit : planInfo.daily_zalo_limit);
  if (dailyLimit !== null) {
    if (dailyLimit === 0) {
      const err = new Error(
        `Tính năng gửi ${channelLabel} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.`
      );
      err.status = 403;
      err.code = 'RESOURCE_LIMIT_EXCEEDED';
      err.limitType = 'disabled';
      err.limit = 0;
      err.currentCount = 0;
      err.resetAt = null;
      err.billingUserId = billingUserId;
      throw err;
    }

    const dailyCount = isEmail
      ? await countEmailSentTodayWithLedger(client, billingUserId, vnDayStart, vnDayEnd)
      : await countZaloSentTodayWithLedger(client, billingUserId, vnDayStart, vnDayEnd);
    if (dailyCount + quantity > dailyLimit) {
      const err = new Error(
        `Đã đạt giới hạn gửi ${channelLabel} trong ngày (${dailyCount}/${dailyLimit} ${unitLabel}). Hạn mức sẽ reset vào 00:00 ngày mai.`
      );
      err.status = 403;
      err.code = 'RESOURCE_LIMIT_EXCEEDED';
      err.limitType = 'daily';
      err.limit = dailyLimit;
      err.currentCount = dailyCount;
      err.resetAt = vnDayEnd;
      err.billingUserId = billingUserId;
      throw err;
    }
  }

  // 3. Workspace plan monthly limit & wallet fallback (Tier 3)
  const monthlyLimit = toInt(isEmail ? planInfo.monthly_email_limit : planInfo.monthly_zalo_limit);
  let walletItemKey = null;
  let walletQuantity = 0;

  if (monthlyLimit !== null) {
    if (monthlyLimit === 0) {
      const err = new Error(
        `Tính năng gửi ${channelLabel} không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.`
      );
      err.status = 403;
      err.code = 'RESOURCE_LIMIT_EXCEEDED';
      err.limitType = 'disabled';
      err.limit = 0;
      err.currentCount = 0;
      err.resetAt = null;
      err.billingUserId = billingUserId;
      throw err;
    }

    const monthlyCount = isEmail
      ? await countEmailSentInCycleWithLedger(client, billingUserId, cycleStart, cycleEnd)
      : await countZaloSentInCycleWithLedger(client, billingUserId, cycleStart, cycleEnd);

    if (monthlyCount + quantity > monthlyLimit) {
      const coveredByPlan = Math.max(0, monthlyLimit - monthlyCount);
      const requiredTopup = quantity - coveredByPlan;
      const itemKey = isEmail ? 'emails' : 'zalo_messages';

      // Strict lock order: workspace lock already held, now acquire wallet lock
      await acquireWalletLock(client, billingUserId, itemKey);
      const walletBal = await getWalletAvailableBalance(client, billingUserId, itemKey);
      if (walletBal.available < requiredTopup) {
        const resetDate = cycleEnd instanceof Date ? cycleEnd : (cycleEnd ? new Date(cycleEnd) : nextVnMonthStart());
        const err = new Error(
          `Đã đạt giới hạn gửi ${channelLabel} trong tháng (${monthlyCount}/${monthlyLimit} ${unitLabel}). Vui lòng mua thêm hoặc liên hệ admin để nâng gói.`
        );
        err.status = 403;
        err.code = 'RESOURCE_LIMIT_EXCEEDED';
        err.limitType = 'monthly';
        err.limit = monthlyLimit;
        err.currentCount = monthlyCount;
        err.resetAt = resetDate;
        err.billingUserId = billingUserId;
        throw err;
      }

      walletItemKey = itemKey;
      walletQuantity = requiredTopup;
    }
  }

  // 4. Workspace combined period limit (Tier 4)
  const periodLimit = toInt(planInfo.messages_per_period);
  if (periodLimit !== null) {
    if (periodLimit === 0) {
      const err = new Error(
        'Tính năng gửi tin nhắn không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.'
      );
      err.status = 403;
      err.code = 'RESOURCE_LIMIT_EXCEEDED';
      err.limitType = 'disabled';
      err.limit = 0;
      err.currentCount = 0;
      err.resetAt = null;
      err.billingUserId = billingUserId;
      throw err;
    }

    if (cycleStart && cycleEnd) {
      const combinedCount = await countCombinedSentInCycleWithLedger(client, billingUserId, cycleStart, cycleEnd);
      if (combinedCount + quantity > periodLimit) {
        const resetDate = cycleEnd instanceof Date ? cycleEnd : new Date(cycleEnd);
        const err = new Error(PERIOD_LIMIT_MSG(combinedCount, periodLimit));
        err.status = 403;
        err.code = 'RESOURCE_LIMIT_EXCEEDED';
        err.limitType = 'period';
        err.limit = periodLimit;
        err.currentCount = combinedCount;
        err.resetAt = resetDate;
        err.billingUserId = billingUserId;
        throw err;
      }
    }
  }

  return {
    allowed: true,
    walletItemKey,
    walletQuantity,
  };
}

/**
 * Reserve send quota for an upcoming message delivery.
 * Enforces workspace advisory locking, idempotency with fingerprint validation,
 * and multi-tier quota availability (Employee -> Plan Daily -> Plan Monthly -> Wallet).
 *
 * @param {object} params
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function reserveSendQuota(params, options = {}) {
  const { queryableClient = null } = options;
  const { mode, skippedByAllowlist = false } = assertReservationOperationMode(options, params, { isAdmission: true });

  const {
    userId,
    actorUserId = null,
    ownerContextId = null,
    membershipId = null,
    roleCode = 'user',
    channel,
    quantity = 1,
    reservationKey,
    requestFingerprint,
    fingerprintVersion = 'v2',
    sourceType = 'direct_email',
    sourceRef = {},
    requestPayload = null,
    expiresInSeconds = 300,
  } = params;

  // Step 1: Mode 'off' — evaluate legacy checkSendQuota without atomic table reservation
  if (mode === 'off') {
    let legacyResult = null;
    if (roleCode === 'admin' && !ownerContextId) {
      legacyResult = { allowed: true, billingUserId: null, bypass: true };
    } else if (userId && channel) {
      try {
        legacyResult = await checkSendQuota({
          userId,
          channel,
          roleCode,
          ownerContextId,
          requiredCount: quantity,
          actorUserId,
        });
        if (legacyResult?.allowed === false) {
          const err = new Error(legacyResult.message || 'Hạn mức gửi tin không đủ (legacy)');
          err.status = legacyResult.status || 403;
          err.code = legacyResult.code || 'RESOURCE_LIMIT_EXCEEDED';
          throw err;
        }
      } catch (checkErr) {
        if (checkErr.status === 403 || checkErr.code === 'RESOURCE_LIMIT_EXCEEDED' || checkErr.code === 'SEND_QUOTA_EXCEEDED') {
          throw checkErr;
        }
        if (process.env.NODE_ENV === 'test' && (isConnectionError(checkErr) || checkErr?.code === '28P01' || checkErr?.message?.includes('password authentication failed') || checkErr?.message?.includes('connect ECONNREFUSED'))) {
          legacyResult = { allowed: true, billingUserId: userId };
        } else {
          throw checkErr;
        }
      }
    }
    return {
      id: null,
      reservation_key: reservationKey || null,
      status: 'reserved',
      mode: 'off',
      is_metered: roleCode !== 'admin',
      allowed: true,
      bypass: true,
      skippedByAllowlist: Boolean(skippedByAllowlist),
      legacyDecision: legacyResult || { allowed: true },
    };
  }

  // Step 2: Mode 'shadow' — strictly non-blocking sandbox evaluation
  if (mode === 'shadow') {
    let legacyResult = null;
    let legacyError = null;
    try {
      legacyResult = await checkSendQuota({
        userId,
        channel,
        roleCode,
        ownerContextId,
        requiredCount: quantity,
        actorUserId,
      });
    } catch (err) {
      legacyError = err;
    }
    const legacyAllowed = !legacyError && (legacyResult?.allowed !== false);

    let atomicAllowed = false;
    let atomicError = null;
    let shadowClient = null;

    try {
      // Key and fingerprint validation inside candidate sandbox (non-blocking for legacy)
      if (reservationKey) {
        validateReservationKey(reservationKey);
      }
      let fingerprint = requestFingerprint;
      if (fingerprint && requestPayload) {
        fingerprint = computeRequestFingerprint(requestPayload, fingerprintVersion);
      }

      // Always acquire a separate dedicated connection for shadow candidate
      shadowClient = await db.getClient();
      await shadowClient.query('BEGIN');

      const shadowBillingUserId = roleCode === 'admin'
        ? (ownerContextId ? Number(ownerContextId) : userId)
        : (await resolveBillingUserId(userId, { ownerContextId }, shadowClient));

      await acquireWorkspaceQuotaLock(shadowClient, shadowBillingUserId);

      const now = new Date();
      const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
      let cycleStart = null;
      let cycleEnd = null;
      const cycle = await getBillingCycle(shadowBillingUserId, {}, shadowClient);
      if (cycle?.cycleStart && cycle?.cycleEnd) {
        cycleStart = cycle.cycleStart;
        cycleEnd = cycle.cycleEnd;
      }

      const policyResult = await evaluateReservationQuotaPolicy(shadowClient, {
        billingUserId: shadowBillingUserId,
        actorUserId,
        ownerContextId,
        userId,
        channel,
        quantity,
        isMetered: roleCode !== 'admin',
        vnDayStart,
        vnDayEnd,
        cycleStart,
        cycleEnd,
      });
      atomicAllowed = Boolean(policyResult?.allowed);
    } catch (candErr) {
      atomicAllowed = false;
      atomicError = candErr;
    } finally {
      if (shadowClient) {
        try {
          await shadowClient.query('ROLLBACK');
        } catch (_) {}
        shadowClient.release();
      }
    }

    recordShadowEvaluation({
      legacyAllowed,
      atomicAllowed,
      atomicError,
      billingUserId: ownerContextId || userId,
      userId,
      channel,
    });

    const isMismatch = legacyAllowed !== atomicAllowed;

    if (!legacyAllowed) {
      if (legacyError) throw legacyError;
      const err = new Error(legacyResult?.message || 'Hạn mức gửi tin không đủ (legacy)');
      err.status = legacyResult?.status || 403;
      err.code = legacyResult?.code || 'RESOURCE_LIMIT_EXCEEDED';
      throw err;
    }

    return {
      id: null,
      reservation_key: reservationKey || null,
      mode: 'shadow',
      allowed: true,
      shadowAllowed: atomicAllowed,
      shadowError: atomicError ? { message: atomicError.message, code: atomicError.code, status: atomicError.status } : null,
      shadowMismatch: isMismatch,
      legacyDecision: legacyResult || { allowed: true },
    };
  }

  // Step 3: Mode 'enforce' / 'test_enforce'
  // Validate reservationKey format and Zero-PII
  validateReservationKey(reservationKey);

  // Fingerprint calculation and validation: strictly 64-char lowercase hex SHA-256
  let fingerprint = requestFingerprint;
  if (fingerprint && requestPayload) {
    const cleanFp = String(fingerprint).trim();
    if (!/^[0-9a-f]{64}$/.test(cleanFp)) {
      const err = new Error('requestFingerprint must be a valid 64-character lowercase hex SHA-256 string');
      err.status = 400;
      err.code = 'INVALID_REQUEST_FINGERPRINT';
      throw err;
    }
    fingerprint = cleanFp;
    const computed = computeRequestFingerprint(requestPayload, fingerprintVersion);
    if (fingerprint !== computed) {
      const err = new Error(
        `requestFingerprint mismatch: provided '${fingerprint}' does not match computed fingerprint '${computed}'`
      );
      err.status = 400;
      err.code = 'FINGERPRINT_MISMATCH';
      throw err;
    }
  } else if (fingerprint) {
    const cleanFp = String(fingerprint).trim();
    if (!/^[0-9a-f]{64}$/.test(cleanFp)) {
      const err = new Error('requestFingerprint must be a valid 64-character lowercase hex SHA-256 string');
      err.status = 400;
      err.code = 'INVALID_REQUEST_FINGERPRINT';
      throw err;
    }
    fingerprint = cleanFp;
  } else if (requestPayload) {
    fingerprint = computeRequestFingerprint(requestPayload, fingerprintVersion);
  } else {
    const err = new Error('Reservation requires either a valid 64-char requestFingerprint or requestPayload');
    err.status = 400;
    err.code = 'MISSING_REQUEST_FINGERPRINT';
    throw err;
  }

  let client = queryableClient;
  let isSelfManagedTx = false;
  let inTransaction = false;

  try {
    if (!client) {
      client = await db.getClient();
      isSelfManagedTx = true;
    }
    if (isSelfManagedTx) {
      await client.query('BEGIN');
      inTransaction = true;
    }

    // Resolve billing context under client
    const billingUserId = roleCode === 'admin'
      ? (ownerContextId ? Number(ownerContextId) : userId)
      : (await resolveBillingUserId(userId, { ownerContextId }, client));
    const isMetered = roleCode !== 'admin';

    // Step 1: Workspace advisory lock
    await acquireWorkspaceQuotaLock(client, billingUserId);

    // Step 2: Check existing reservation by reservationKey (Idempotency)
    const existing = await findReservationByKey(client, reservationKey);
    if (existing) {
      // Validate fingerprint with version
      let isMatch = false;
      let computedFingerprint = null;

      if (requestPayload) {
        const check = validateFingerprint(
          existing.fingerprint_version,
          existing.request_fingerprint,
          requestPayload
        );
        isMatch = check.valid;
        computedFingerprint = check.computedFingerprint;
      } else {
        isMatch =
          existing.fingerprint_version === fingerprintVersion &&
          existing.request_fingerprint.toLowerCase() === fingerprint.toLowerCase();
        computedFingerprint = fingerprint;
      }

      if (!isMatch) {
        const err = new Error('Idempotency key reused with different request payload');
        err.status = 409;
        err.code = 'IDEMPOTENCY_KEY_REUSED';
        err.savedFingerprint = existing.request_fingerprint;
        err.computedFingerprint = computedFingerprint;
        throw err;
      }

      // Existing reservation matches fingerprint
      if (existing.status === 'consumed') {
        if (isSelfManagedTx) {
          await client.query('COMMIT');
          inTransaction = false;
        }
        return {
          ...existing,
          mode,
          allowed: true,
          replayed: true,
          replayedStatus: 'consumed',
          responseSnapshot: existing.response_snapshot || null,
        };
      }

      if (['reserved', 'sending'].includes(existing.status)) {
        if (isSelfManagedTx) {
          await client.query('COMMIT');
          inTransaction = false;
        }
        const err = new Error(`A send operation with reservation key '${reservationKey}' is already in progress (${existing.status})`);
        err.status = 409;
        err.code = 'CONCURRENT_SEND_IN_PROGRESS';
        err.currentStatus = existing.status;
        err.reservationId = existing.id;
        throw err;
      }

      if (existing.status === 'uncertain') {
        if (isSelfManagedTx) {
          await client.query('COMMIT');
          inTransaction = false;
        }
        const err = new Error(`Prior send operation with reservation key '${reservationKey}' is in uncertain state and requires reconciliation`);
        err.status = 409;
        err.code = 'RESERVATION_UNCERTAIN';
        err.reservationId = existing.id;
        throw err;
      }

      if (existing.status === 'released') {
        // Retry released reservation: transition back to reserved under lock
        const now = new Date();
        const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
        let cycleStart = null;
        let cycleEnd = null;

        const cycle = await getBillingCycle(billingUserId, {}, client);
        if (cycle?.cycleStart && cycle?.cycleEnd) {
          cycleStart = cycle.cycleStart;
          cycleEnd = cycle.cycleEnd;
        }

        // Evaluate quota policy for the retry
        const policyResult = await evaluateReservationQuotaPolicy(client, {
          billingUserId,
          actorUserId,
          ownerContextId,
          userId,
          channel,
          quantity,
          isMetered,
          vnDayStart,
          vnDayEnd,
          cycleStart,
          cycleEnd,
        });

        const newExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
        const reReserved = await transitionReservationState(
          client,
          existing.id,
          'released',
          'reserved',
          {
            vnDayStart,
            vnDayEnd,
            cycleStart,
            cycleEnd,
            expiresAt: newExpiresAt,
            walletItemKey: policyResult.walletItemKey,
            walletQuantity: policyResult.walletQuantity,
          }
        );

        if (isSelfManagedTx) {
          await client.query('COMMIT');
          inTransaction = false;
        }
        _clearQuotaCache();
        return {
          ...reReserved,
          mode,
          allowed: true,
          retriedFromReleased: true,
        };
      }
    }

    // Step 3: Compute date boundaries & billing cycle snapshot using transaction client
    const now = new Date();
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
    let cycleStart = null;
    let cycleEnd = null;

    const cycle = await getBillingCycle(billingUserId, {}, client);
    if (cycle?.cycleStart && cycle?.cycleEnd) {
      cycleStart = cycle.cycleStart;
      cycleEnd = cycle.cycleEnd;
    }

    // Step 4: Multi-tier quota policy evaluation
    const policyResult = await evaluateReservationQuotaPolicy(client, {
      billingUserId,
      actorUserId,
      ownerContextId,
      userId,
      channel,
      quantity,
      isMetered,
      vnDayStart,
      vnDayEnd,
      cycleStart,
      cycleEnd,
    });

    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

    // Step 5: Create new reservation row
    const created = await createReservation(client, {
      reservationKey,
      requestFingerprint: fingerprint,
      fingerprintVersion,
      billingUserId,
      actorUserId,
      membershipId,
      channel,
      quantity,
      isMetered,
      walletItemKey: policyResult.walletItemKey,
      walletQuantity: policyResult.walletQuantity,
      sourceType,
      sourceRef,
      status: 'reserved',
      vnDayStart,
      vnDayEnd,
      cycleStart,
      cycleEnd,
      expiresAt,
    });

    if (isSelfManagedTx) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    _clearQuotaCache();
    return {
      ...created,
      mode,
      allowed: true,
      replayed: false,
    };
  } catch (err) {
    if (isSelfManagedTx && inTransaction && client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw mapToServiceUnavailableIfInternal(err);
  } finally {
    if (isSelfManagedTx && client) {
      client.release();
    }
  }
}

/**
 * Mark reservation as sending before dispatching network request to provider.
 *
 * @param {object} params
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function markSendQuotaSending(
  { reservationId, providerReference = null },
  options = {}
) {
  const { queryableClient = null } = options;
  const { mode } = assertReservationOperationMode(options);
  if (mode === 'off' || mode === 'shadow' || reservationId == null) {
    return { status: 'sending', mode: reservationId == null ? 'off' : mode, ...(reservationId != null ? { id: reservationId } : {}) };
  }

  const cleanProviderRef = validateProviderReference(providerReference);

  let client = queryableClient;
  let isSelfManagedTx = false;
  let inTransaction = false;

  try {
    if (!client) {
      client = await db.getClient();
      isSelfManagedTx = true;
    }
    if (isSelfManagedTx) {
      await client.query('BEGIN');
      inTransaction = true;
    }

    const preCheck = await findReservationById(client, reservationId);
    if (!preCheck) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    await acquireWorkspaceQuotaLock(client, preCheck.billing_user_id);

    const updated = await transitionReservationState(
      client,
      reservationId,
      'reserved',
      'sending',
      { providerReference: cleanProviderRef }
    );

    if (isSelfManagedTx) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    _clearQuotaCache();
    return updated;
  } catch (err) {
    if (isSelfManagedTx && inTransaction && client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw mapToServiceUnavailableIfInternal(err);
  } finally {
    if (isSelfManagedTx && client) {
      client.release();
    }
  }
}

/**
 * Consume quota reservation upon provider acceptance/success.
 * Strict lock hierarchy: 1. Workspace quota lock -> 2. Wallet lock -> 3. Reservation FOR UPDATE.
 * If already consumed, returns immediately without re-running persistSource or duplicate debit.
 *
 * @param {object} params
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function consumeSendQuota(
  { reservationId, providerReference = null, responseSnapshot = null, persistSource = null },
  options = {}
) {
  const { queryableClient = null } = options;
  const { mode } = assertReservationOperationMode(options);
  if (mode === 'off' || mode === 'shadow' || reservationId == null) {
    return { status: 'consumed', mode: reservationId == null ? 'off' : mode, ...(reservationId != null ? { id: reservationId } : {}) };
  }

  const cleanProviderRef = validateProviderReference(providerReference);

  let client = queryableClient;
  let isSelfManagedTx = false;
  let inTransaction = false;

  try {
    if (!client) {
      client = await db.getClient();
      isSelfManagedTx = true;
    }
    if (isSelfManagedTx) {
      await client.query('BEGIN');
      inTransaction = true;
    }

    // Step 1: Pre-fetch reservation info
    const preCheck = await findReservationById(client, reservationId);
    if (!preCheck) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    // Step 2: Strict Lock Hierarchy
    // 1. Workspace lock
    await acquireWorkspaceQuotaLock(client, preCheck.billing_user_id);
    // 2. Wallet lock (if wallet_quantity was held)
    if (preCheck.wallet_quantity > 0 && preCheck.wallet_item_key) {
      await acquireWalletLock(client, preCheck.billing_user_id, preCheck.wallet_item_key);
    }

    // Step 3: Re-fetch / Lock reservation row for update under the locks
    const existing = await findReservationById(client, reservationId, { forUpdate: true });
    if (!existing) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    // Idempotent replay check — if already consumed, return immediately without re-running persistSource or debit
    if (existing.status === 'consumed') {
      if (isSelfManagedTx) {
        await client.query('COMMIT');
        inTransaction = false;
      }
      return existing;
    }

    // Enforce valid source state (must be 'sending' to consume)
    if (existing.status !== 'sending') {
      const err = new Error(
        `Cannot consume reservation #${reservationId}: current status is '${existing.status}', expected 'sending'`
      );
      err.status = 409;
      err.code = 'INVALID_RESERVATION_TRANSITION';
      err.currentStatus = existing.status;
      err.targetStatus = 'consumed';
      throw err;
    }

    // Step 4: Atomic Topup Wallet Debit if wallet_quantity was held
    if (existing.wallet_quantity > 0 && existing.wallet_item_key) {
      await insertTopupDebit({
        userId: existing.billing_user_id,
        itemKey: existing.wallet_item_key,
        qty: existing.wallet_quantity,
        sourceKey: `quota_reservation:${existing.id}`,
      }, client);
    }

    // Step 5: Execute controlled persistence operation under the lock
    if (typeof persistSource === 'function') {
      await persistSource(client);
    }

    // Step 6: Transition state to consumed
    const updated = await transitionReservationState(
      client,
      reservationId,
      existing.status,
      'consumed',
      {
        providerReference: cleanProviderRef || existing.provider_reference,
        responseSnapshot: responseSnapshot || existing.response_snapshot,
      }
    );

    if (isSelfManagedTx) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    _clearQuotaCache();
    return updated;
  } catch (err) {
    if (isSelfManagedTx && inTransaction && client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw mapToServiceUnavailableIfInternal(err);
  } finally {
    if (isSelfManagedTx && client) {
      client.release();
    }
  }
}

/**
 * Release quota reservation on provider rejection or terminal failure.
 *
 * @param {object} params
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function releaseSendQuota(
  { reservationId, failureCode = null },
  options = {}
) {
  const { queryableClient = null } = options;
  const { mode } = assertReservationOperationMode(options);
  if (mode === 'off' || mode === 'shadow' || reservationId == null) {
    return { status: 'released', mode: reservationId == null ? 'off' : mode, ...(reservationId != null ? { id: reservationId } : {}) };
  }

  const cleanReason = validateFailureCode(failureCode);

  let client = queryableClient;
  let isSelfManagedTx = false;
  let inTransaction = false;

  try {
    if (!client) {
      client = await db.getClient();
      isSelfManagedTx = true;
    }
    if (isSelfManagedTx) {
      await client.query('BEGIN');
      inTransaction = true;
    }

    const preCheck = await findReservationById(client, reservationId);
    if (!preCheck) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    await acquireWorkspaceQuotaLock(client, preCheck.billing_user_id);

    const current = await findReservationById(client, reservationId, { forUpdate: true });
    if (!current) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    if (current.status === 'released') {
      if (isSelfManagedTx) {
        await client.query('COMMIT');
        inTransaction = false;
      }
      return current;
    }

    const updated = await transitionReservationState(
      client,
      reservationId,
      current.status,
      'released',
      { failureCode: cleanReason, walletQuantity: 0 }
    );

    if (isSelfManagedTx) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    _clearQuotaCache();
    return updated;
  } catch (err) {
    if (isSelfManagedTx && inTransaction && client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw mapToServiceUnavailableIfInternal(err);
  } finally {
    if (isSelfManagedTx && client) {
      client.release();
    }
  }
}

/**
 * Mark reservation as uncertain when timeout/network error occurs during provider call.
 *
 * @param {object} params
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function markSendQuotaUncertain(
  { reservationId, failureCode = null },
  options = {}
) {
  const { queryableClient = null } = options;
  const { mode } = assertReservationOperationMode(options);
  if (mode === 'off' || mode === 'shadow' || reservationId == null) {
    return { status: 'uncertain', mode: reservationId == null ? 'off' : mode, ...(reservationId != null ? { id: reservationId } : {}) };
  }

  const cleanFailure = validateFailureCode(failureCode);

  let client = queryableClient;
  let isSelfManagedTx = false;
  let inTransaction = false;

  try {
    if (!client) {
      client = await db.getClient();
      isSelfManagedTx = true;
    }
    if (isSelfManagedTx) {
      await client.query('BEGIN');
      inTransaction = true;
    }

    const preCheck = await findReservationById(client, reservationId);
    if (!preCheck) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    await acquireWorkspaceQuotaLock(client, preCheck.billing_user_id);

    const current = await findReservationById(client, reservationId, { forUpdate: true });
    if (!current) {
      const err = new Error(`Reservation #${reservationId} not found`);
      err.status = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    const updated = await transitionReservationState(
      client,
      reservationId,
      current.status,
      'uncertain',
      { failureCode: cleanFailure }
    );

    if (isSelfManagedTx) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    _clearQuotaCache();
    return updated;
  } catch (err) {
    if (isSelfManagedTx && inTransaction && client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw mapToServiceUnavailableIfInternal(err);
  } finally {
    if (isSelfManagedTx && client) {
      client.release();
    }
  }
}
