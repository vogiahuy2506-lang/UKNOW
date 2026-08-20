import { describe, it, expect } from '@jest/globals';
import { resolvePlanChange } from '../planChange.util.js';

describe('planChange.util - resolvePlanChange', () => {
  const planBasic = { id: 1, name: 'Basic', price: 299000, price_yearly: 2990000, duration_days: 30 };
  const planPro = { id: 2, name: 'Pro', price: 799000, price_yearly: 7990000, duration_days: 30 };
  const planEnterprise = { id: 3, name: 'Enterprise', price: 1999000, price_yearly: 19990000, duration_days: 30 };

  const now = new Date('2026-08-19T10:00:00Z');
  const expires20Days = new Date('2026-09-08T10:00:00Z'); // 20 days left
  const expires45Days = new Date('2026-10-03T10:00:00Z'); // 45 days left

  describe('No active plan or expired plan', () => {
    it('returns upgrade_now with full price when user has no active plan', () => {
      const res = resolvePlanChange({
        currentPlan: null,
        currentBillingPeriod: null,
        subscriptionExpiresAt: null,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(299000);
      expect(res.daysRemaining).toBe(0);
    });

    it('returns upgrade_now when user plan is expired', () => {
      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: new Date('2026-08-01T00:00:00Z'),
        targetPlan: planPro,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(799000);
    });
  });

  describe('Same plan & same billing period', () => {
    it('returns blocked with SAME_PLAN', () => {
      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('blocked');
      expect(res.code).toBe('SAME_PLAN');
    });
  });

  describe('Monthly -> Monthly (Same period)', () => {
    it('Basic (299k) -> Pro (799k): upgrade_now full price', () => {
      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planPro,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(799000);
      expect(res.activateAfter).toBeNull();
    });

    it('Pro (799k) -> Basic (299k): schedule to cycle end', () => {
      const res = resolvePlanChange({
        currentPlan: planPro,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('schedule');
      expect(res.amountToPay).toBe(299000);
      expect(res.activateAfter).toEqual(expires20Days);
    });
  });

  describe('Monthly -> Yearly', () => {
    it('Basic monthly -> Pro yearly: upgrade_now', () => {
      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planPro,
        targetBillingPeriod: 'yearly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(7990000);
    });

    it('Pro monthly -> Basic yearly: upgrade_now (yearly always upgrades immediately)', () => {
      const res = resolvePlanChange({
        currentPlan: planPro,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planBasic,
        targetBillingPeriod: 'yearly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(2990000);
    });
  });

  describe('Yearly -> Monthly', () => {
    it('Yearly with > 30 days remaining -> blocked with YEARLY_TO_MONTHLY', () => {
      const res = resolvePlanChange({
        currentPlan: planPro,
        currentBillingPeriod: 'yearly',
        subscriptionExpiresAt: expires45Days,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('blocked');
      expect(res.code).toBe('YEARLY_TO_MONTHLY');
    });

    it('Yearly with < 30 days remaining -> Pro (monthly 799k) to Basic (monthly 299k): schedule', () => {
      const res = resolvePlanChange({
        currentPlan: planPro,
        currentBillingPeriod: 'yearly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('schedule');
      expect(res.amountToPay).toBe(299000);
      expect(res.activateAfter).toEqual(expires20Days);
    });

    it('Yearly with < 30 days remaining -> Basic (monthly 299k) to Pro (monthly 799k): upgrade_now', () => {
      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'yearly',
        subscriptionExpiresAt: expires20Days,
        targetPlan: planPro,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('upgrade_now');
      expect(res.amountToPay).toBe(799000);
    });
  });

  describe('Pending scheduled change interactions', () => {
    const pendingChangeBasic = {
      id: 10,
      user_id: 1,
      plan_id: planBasic.id,
      plan_price: planBasic.price,
      plan_price_yearly: planBasic.price_yearly,
      billing_period: 'monthly',
      amount_paid: 299000,
      status: 'pending',
      activate_after: expires20Days,
    };

    const pendingChangePro = {
      id: 11,
      user_id: 1,
      plan_id: planPro.id,
      plan_price: planPro.price,
      plan_price_yearly: planPro.price_yearly,
      billing_period: 'monthly',
      amount_paid: 799000,
      status: 'pending',
      activate_after: expires20Days,
    };

    it('When having pending Basic (299k) and choosing Pro (799k): upgrade_pending with difference', () => {
      const res = resolvePlanChange({
        currentPlan: planPro, // Currently using Pro
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        pendingChange: pendingChangeBasic, // Scheduled downgrade to Basic
        targetPlan: planEnterprise, // Wants Enterprise 1999k instead
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('upgrade_pending');
      expect(res.amountToPay).toBe(1999000 - 299000); // 1700000
      expect(res.pendingChangeId).toBe(10);
      expect(res.activateAfter).toEqual(expires20Days);
    });

    it('When having pending Pro (799k) and choosing Basic (299k): blocked with PENDING_DOWNGRADE', () => {
      const res = resolvePlanChange({
        currentPlan: planEnterprise,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        pendingChange: pendingChangePro,
        targetPlan: planBasic,
        targetBillingPeriod: 'monthly',
        now,
      });
      expect(res.action).toBe('blocked');
      expect(res.code).toBe('PENDING_DOWNGRADE');
    });

    it('Bug 1: When scheduled Enterprise (1999k) with voucher discount (amount_paid=100k), choosing Pro (799k) must be BLOCKED', () => {
      const pendingEnterpriseDiscounted = {
        id: 12,
        user_id: 1,
        plan_id: planEnterprise.id,
        plan_price: planEnterprise.price,
        plan_price_yearly: planEnterprise.price_yearly,
        billing_period: 'monthly',
        amount_paid: 100000, // Discounted by voucher
        status: 'pending',
        activate_after: expires20Days,
      };

      const res = resolvePlanChange({
        currentPlan: planBasic,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        pendingChange: pendingEnterpriseDiscounted,
        targetPlan: planPro, // 799k < 1999k (Enterprise)
        targetBillingPeriod: 'monthly',
        now,
      });

      expect(res.action).toBe('blocked');
      expect(res.code).toBe('PENDING_DOWNGRADE');
    });

    it('When having pending Basic (299k) scheduled downgrade, and user upgrades scheduled plan to yearly Pro: upgrade_pending', () => {
      const res = resolvePlanChange({
        currentPlan: planPro,
        currentBillingPeriod: 'monthly',
        subscriptionExpiresAt: expires20Days,
        pendingChange: pendingChangeBasic,
        targetPlan: planPro,
        targetBillingPeriod: 'yearly',
        now,
      });
      expect(res.action).toBe('upgrade_pending');
      expect(res.amountToPay).toBe(7990000 - 299000);
    });
  });
});
