/**
 * Pure logic util to resolve plan change action, price, and scheduling rules.
 * Synced with backend/src/utils/planChange.util.js
 */

export function resolvePlanChange({
  currentPlan,
  currentBillingPeriod = 'monthly',
  subscriptionExpiresAt,
  targetPlan,
  targetBillingPeriod = 'monthly',
  pendingChange = null,
  targetPlanPrice = null,
  now = new Date(),
}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const expiresDate = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
  const isCurrentlyActive = !!(currentPlan && expiresDate && expiresDate > nowDate);

  // Determine standard prices
  const getPlanPrice = (plan, period) => {
    if (!plan) return 0;
    if (period === 'yearly') {
      return Number(plan.price_yearly || plan.priceYearly || (Number(plan.price || 0) * 12));
    }
    return Number(plan.price || 0);
  };

  const currentPrice = getPlanPrice(currentPlan, currentBillingPeriod);
  const resolvedTargetPrice = targetPlanPrice !== null && targetPlanPrice !== undefined
    ? Number(targetPlanPrice)
    : getPlanPrice(targetPlan, targetBillingPeriod);

  const msRemaining = isCurrentlyActive && expiresDate ? expiresDate.getTime() - nowDate.getTime() : 0;
  const daysRemaining = Math.max(0, msRemaining / (1000 * 60 * 60 * 24));

  // Case 1: No active plan or subscription expired -> Always upgrade immediately
  if (!isCurrentlyActive) {
    return {
      action: 'upgrade_now',
      amountToPay: resolvedTargetPrice,
      code: null,
      message: null,
      activateAfter: null,
      pendingChangeId: null,
      daysRemaining: 0,
    };
  }

  // Case 2: Same plan & same billing period & same price -> Blocked
  if (
    currentPlan?.id != null &&
    targetPlan?.id != null &&
    Number(currentPlan.id) === Number(targetPlan.id) &&
    currentBillingPeriod === targetBillingPeriod &&
    resolvedTargetPrice === currentPrice
  ) {
    return {
      action: 'blocked',
      amountToPay: 0,
      code: 'SAME_PLAN',
      message: 'Bạn đang sử dụng gói này với cùng kỳ hạn thanh toán.',
      activateAfter: null,
      pendingChangeId: null,
      daysRemaining,
    };
  }

  // Case 3: User currently has a pending scheduled change X
  if (pendingChange && pendingChange.status === 'pending') {
    const pendingPaid = Number(pendingChange.amount_paid || 0);

    // Calculate full catalog price of scheduled plan X (compare against plan price, NOT amount paid)
    const pendingPlanPrice = pendingChange.billing_period === 'yearly'
      ? Number(pendingChange.plan_price_yearly || (Number(pendingChange.plan_price || 0) * 12))
      : Number(pendingChange.plan_price || 0);

    // Rule: Target plan > X -> upgrade_pending (pay difference between target price and total already paid)
    if (resolvedTargetPrice > pendingPlanPrice) {
      const difference = Math.max(0, resolvedTargetPrice - pendingPaid);
      return {
        action: 'upgrade_pending',
        amountToPay: difference,
        code: null,
        message: null,
        activateAfter: pendingChange.activate_after || expiresDate,
        pendingChangeId: pendingChange.id,
        daysRemaining,
      };
    }

    // Rule: Target plan <= X -> blocked (cannot downgrade or select <= scheduled plan X)
    return {
      action: 'blocked',
      amountToPay: 0,
      code: 'PENDING_DOWNGRADE',
      message: 'Bạn đã có một lệnh hẹn đổi sang gói có giá trị cao hơn đang chờ kích hoạt. Không thể hạ gói hoặc đổi sang gói thấp hơn gói hẹn.',
      activateAfter: null,
      pendingChangeId: pendingChange.id,
      daysRemaining,
    };
  }

  // Case 4: Monthly to Yearly -> Always upgrade immediately
  if (currentBillingPeriod === 'monthly' && targetBillingPeriod === 'yearly') {
    return {
      action: 'upgrade_now',
      amountToPay: resolvedTargetPrice,
      code: null,
      message: null,
      activateAfter: null,
      pendingChangeId: null,
      daysRemaining,
    };
  }

  // Case 5: Yearly to Monthly
  if (currentBillingPeriod === 'yearly' && targetBillingPeriod === 'monthly') {
    // If >= 30 days remaining -> Blocked
    if (daysRemaining >= 30) {
      return {
        action: 'blocked',
        amountToPay: 0,
        code: 'YEARLY_TO_MONTHLY',
        message: 'Gói năm còn trên 30 ngày không thể chuyển sang gói tháng. Vui lòng quay lại khi còn dưới 30 ngày.',
        activateAfter: null,
        pendingChangeId: null,
        daysRemaining,
      };
    }

    // If < 30 days remaining:
    // Compare monthly price of current plan vs target monthly price
    const currentMonthlyPrice = Number(currentPlan.price || 0);
    const targetMonthlyPrice = Number(targetPlan.price || 0);

    if (targetMonthlyPrice > currentMonthlyPrice) {
      return {
        action: 'upgrade_now',
        amountToPay: resolvedTargetPrice,
        code: null,
        message: null,
        activateAfter: null,
        pendingChangeId: null,
        daysRemaining,
      };
    }

    return {
      action: 'schedule',
      amountToPay: resolvedTargetPrice,
      code: null,
      message: null,
      activateAfter: expiresDate,
      pendingChangeId: null,
      daysRemaining,
    };
  }

  // Case 6: Same billing period (Monthly -> Monthly or Yearly -> Yearly)
  if (resolvedTargetPrice > currentPrice) {
    return {
      action: 'upgrade_now',
      amountToPay: resolvedTargetPrice,
      code: null,
      message: null,
      activateAfter: null,
      pendingChangeId: null,
      daysRemaining,
    };
  }

  // Target price < current price -> Schedule change at the end of cycle
  return {
    action: 'schedule',
    amountToPay: resolvedTargetPrice,
    code: null,
    message: null,
    activateAfter: expiresDate,
    pendingChangeId: null,
    daysRemaining,
  };
}
