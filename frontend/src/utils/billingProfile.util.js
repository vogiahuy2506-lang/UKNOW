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
    ...subscription,
  };
}
