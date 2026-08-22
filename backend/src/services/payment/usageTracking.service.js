import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import * as planRepository from '../../repositories/payment/plan.repository.js';
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import { getSubscriptionStatus } from '../../utils/subscriptionStatus.util.js';

class UsageTrackingService {
  /**
   * Track usage for a resource
   * @param {number} userId
   * @param {string} resourceType - e.g., 'campaign', 'landing_page', 'email_sent', 'zalo_sent'
   * @param {number} delta - Amount to add (default 1)
   * @param {object} metadata - Optional usage metadata
   * @param {object} [client] - Optional pg client (khi chạy trong transaction)
   */
  async trackUsage(userId, resourceType, delta = 1, metadata = {}, client = null) {
    return usageTrackingRepository.trackUsage(userId, resourceType, delta, metadata, client);
  }

  /**
   * Plan limits for a user (delegates to repository).
   * @param {number|string} userId
   * @param {import('pg').PoolClient} [client]
   */
  async getUserPlanLimits(userId, client = null) {
    return usageTrackingRepository.getUserPlanLimits(userId, client);
  }

  /**
   * Get current usage for a user
   */
  async getUserUsage(userId) {
    const [usage, limits, features] = await Promise.all([
      usageTrackingRepository.getUsageSummary(userId),
      usageTrackingRepository.getUserPlanLimits(userId),
      planRepository.getUserFeatures(userId),
    ]);

    // Calculate usage percentages
    const usageMap = {};
    usage.forEach(u => {
      usageMap[u.resource_type] = parseInt(u.total_usage);
    });

    return {
      usage: usageMap,
      limits: limits || {},
      features: features || [],
      usagePercentages: this._calculatePercentages(usageMap, limits),
    };
  }

  /**
   * Get usage for a specific resource, optionally scoped to a billing cycle or date range.
   * @param {number|string} userId
   * @param {string} resourceType
   * @param {object} [options]
   */
  async getResourceUsage(userId, resourceType, options = {}) {
    let currentUsage;
    if (options.cycle?.cycleStart || (options.from && options.to)) {
      const start = options.cycle?.cycleStart || options.from;
      const end = options.cycle?.cycleEnd || options.to || new Date();
      currentUsage = await usageTrackingRepository.getUsageInRange(
        options.cycle?.billingUserId || userId,
        resourceType,
        start,
        end
      );
    } else {
      currentUsage = await usageTrackingRepository.getCurrentUsage(userId, resourceType);
    }

    const limits = await usageTrackingRepository.getUserPlanLimits(userId);
    const limit = this._getLimitForResource(limits, resourceType);
    const percentage = limit > 0 ? (currentUsage / limit) * 100 : 0;

    return {
      used: currentUsage,
      limit,
      remaining: Math.max(0, limit - currentUsage),
      percentage: Math.min(100, percentage),
      isExceeded: limit > 0 && currentUsage >= limit,
      isWarning: percentage >= 80 && percentage < 100,
    };
  }

  /**
   * AI credit usage within the current billing cycle.
   * @param {number|string} userId
   * @param {object|null} [cycle] - optional pre-resolved billing cycle
   */
  async getCreditUsageForCycle(userId, cycle = null, options = {}) {
    const resolvedCycle = cycle || await getBillingCycle(userId, options);
    if (!resolvedCycle.hasPlan || !resolvedCycle.cycleStart) {
      return { used: 0, cycle: resolvedCycle };
    }
    const billingUserId = resolvedCycle.billingUserId || userId;
    const subscription = await getSubscriptionStatus(userId);
    const rangeEnd = subscription.isExpired
      ? resolvedCycle.cycleEnd
      : new Date();
    if (!rangeEnd) {
      return { used: 0, cycle: resolvedCycle };
    }
    const used = await usageTrackingRepository.getUsageInRange(
      billingUserId,
      'ai_credit',
      resolvedCycle.cycleStart,
      rangeEnd
    );
    return { used, cycle: resolvedCycle };
  }

  /**
   * Check if user has exceeded limit
   */
  async checkLimit(userId, resourceType) {
    const usage = await this.getResourceUsage(userId, resourceType);
    return {
      allowed: !usage.isExceeded,
      ...usage,
    };
  }

  /**
   * Check if user has a feature
   */
  async hasFeature(userId, featureName) {
    return usageTrackingRepository.canUseFeature(userId, featureName);
  }

  /**
   * Get all features for a user
   */
  async getUserFeatures(userId) {
    return planRepository.getUserFeatures(userId);
  }

  /**
   * Deduct credits from user (used in marketplace purchase)
   * @param {number} userId
   * @param {number} amount - Amount to deduct (must be > 0)
   * @param {object} metadata - Optional metadata
   * @param {object} [client] - Optional pg client (khi chạy trong transaction)
   */
  async deductCredits(userId, amount, metadata = {}, client = null) {
    return usageTrackingRepository.deductCredits(userId, amount, metadata, client);
  }

  _calculatePercentages(usageMap, limits) {
    if (!limits) return {};

    const percentages = {};
    const resourceMapping = {
      campaigns: 'max_campaigns',
      landing_pages: 'max_landing_pages',
      employees: 'max_employees',
    };

    for (const [resource, limit] of Object.entries(limits)) {
      const usageKey = Object.keys(resourceMapping).find(k => resourceMapping[k] === resource);
      if (usageKey && limit > 0) {
        percentages[usageKey] = Math.min(100, ((usageMap[usageKey] || 0) / limit) * 100);
      }
    }

    return percentages;
  }

  _getLimitForResource(limits, resourceType) {
    if (!limits) return 0;

    const mapping = {
      campaign: 'max_campaigns',
      campaigns: 'max_campaigns',
      landing_page: 'max_landing_pages',
      landing_pages: 'max_landing_pages',
      employee: 'max_employees',
      employees: 'max_employees',
      email_sent: 'monthly_email_limit',
      email: 'monthly_email_limit',
      zalo_sent: 'monthly_zalo_limit',
      zalo: 'monthly_zalo_limit',
      ai_token: 'ai_tokens_per_period',
      ai_tokens: 'ai_tokens_per_period',
      ai_credit: 'ai_credits_per_period',
      ai_credits: 'ai_credits_per_period',
      chatbot: 'max_chatbots',
      chatbots: 'max_chatbots',
    };

    const limitKey = mapping[resourceType];
    return limitKey ? (limits[limitKey] || 0) : 0;
  }
}

export default new UsageTrackingService();
