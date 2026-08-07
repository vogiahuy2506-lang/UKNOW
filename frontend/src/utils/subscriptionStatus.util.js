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

  return {
    hasPlan: true,
    isFullyExpired,
    isInGracePeriod,
    serviceSuspended: isFullyExpired,
  };
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
