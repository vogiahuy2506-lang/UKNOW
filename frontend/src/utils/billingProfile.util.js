import { getSubscriptionUiStatus } from './subscriptionStatus.util.js';

/**
 * Build billing snapshot from GET /users/profile payload.
 *
 * @param {object} profile
 */
export function buildBillingStatusFromProfile(profile = {}) {
  const subscription = getSubscriptionUiStatus({
    hasPlan: Boolean(profile.activePlanId),
    subscriptionExpiresAt: profile.subscriptionExpiresAt ?? null,
    gracePeriodDays: profile.planGracePeriodDays ?? 0,
  });

  return {
    activePlanId: profile.activePlanId ?? null,
    subscriptionExpiresAt: profile.subscriptionExpiresAt ?? null,
    planGracePeriodDays: Number(profile.planGracePeriodDays) || 0,
    planRevokedAfterExpiry:
      !profile.activePlanId
      && Boolean(profile.subscriptionExpiresAt)
      && new Date(profile.subscriptionExpiresAt).getTime() < Date.now(),
    ...subscription,
  };
}

/**
 * Khoá lưu trạng thái tắt popup cảnh báo hết hạn gói trong sessionStorage.
 *
 * @param {string|number} userId
 * @returns {string}
 */
export const planExpiryDismissKey = (userId) => `founderai_plan_expiry_dismissed_${userId}`;
