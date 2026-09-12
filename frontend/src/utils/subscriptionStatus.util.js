/**
 * Trạng thái gói (hết hạn + ân hạn) — mirror backend subscriptionStatus.util.js.
 *
 * @param {object} input
 * @param {boolean} [input.hasPlan]
 * @param {string|Date|null} [input.subscriptionExpiresAt]
 * @param {number} [input.gracePeriodDays]
 */
export function getSubscriptionUiStatus({
  hasPlan = false,
  subscriptionExpiresAt = null,
  gracePeriodDays = 0,
} = {}) {
  const empty = {
    hasPlan: false,
    isFullyExpired: false,
    isInGracePeriod: false,
    serviceSuspended: false,
    daysUntilExpiry: null,
    graceDaysLeft: 0,
  };

  if (!hasPlan || !subscriptionExpiresAt) {
    return empty;
  }

  const expiresAt = new Date(subscriptionExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ...empty, hasPlan: true };
  }

  const graceDays = Number(gracePeriodDays) || 0;
  const graceUntil = new Date(expiresAt);
  graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);

  const now = Date.now();
  const isFullyExpired = now > graceUntil.getTime();
  const isInGracePeriod = now > expiresAt.getTime() && now <= graceUntil.getTime();
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now) / 86400000);
  const graceDaysLeft = isInGracePeriod ? Math.max(1, Math.ceil((graceUntil.getTime() - now) / 86400000)) : 0;

  return {
    hasPlan: true,
    isFullyExpired,
    isInGracePeriod,
    serviceSuspended: isFullyExpired,
    daysUntilExpiry,
    graceDaysLeft,
  };
}

/**
 * Xác định xem người dùng có cần cảnh báo về hạn gói dịch vụ hay không.
 *
 * @param {object|null} billingStatus
 * @returns {boolean}
 */
export function shouldWarnPlanExpiry(billingStatus) {
  if (!billingStatus) return false;
  const { isFullyExpired, planRevokedAfterExpiry, isInGracePeriod, daysUntilExpiry } = billingStatus;
  // Nhánh 1: Đã hết hạn hoàn toàn hoặc đã bị cron thu hồi gói sau khi hết hạn
  if (isFullyExpired || planRevokedAfterExpiry) return true;
  // Nhánh 2: Đang trong thời gian ân hạn
  if (isInGracePeriod) return true;
  // Nhánh 3: Sắp hết hạn (còn <= 3 ngày và chưa quá hạn)
  if (typeof daysUntilExpiry === 'number' && daysUntilExpiry <= 3 && daysUntilExpiry > 0) return true;
  return false;
}

/**
 * @param {object} input
 * @param {boolean} [input.isAdmin]
 * @param {object|null} [input.billingStatus]
 * @param {{ used?: number, limit?: number|null }} [input.aiCredits]
 * @param {number|null|undefined} [input.walletRemaining] — addons.aiCredits.remaining
 * @returns {{ type: 'expired'|'credits' }|null}
 */
export function getAiBillingBlockState({
  isAdmin,
  billingStatus,
  aiCredits,
  walletRemaining = 0,
} = {}) {
  if (isAdmin) return null;
  if (billingStatus?.isFullyExpired) {
    return { type: 'expired' };
  }
  const limit = Number(aiCredits?.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const used = Math.max(0, Number(aiCredits?.used) || 0);
    if (used >= limit && !(Number(walletRemaining) > 0)) {
      return { type: 'credits' };
    }
  }
  return null;
}

/** null / undefined / negative = unlimited quota in plan UI */
export function isUnlimitedPlanLimit(limit) {
  return limit === null || limit === undefined || Number(limit) < 0;
}
