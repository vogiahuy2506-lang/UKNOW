import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import * as planRepository from '../../repositories/payment/plan.repository.js';

class UsageTrackingService {
  /**
   * Track usage for a resource
   * @param {number} userId
   * @param {string} resourceType - e.g., 'campaign', 'landing_page', 'email_sent', 'zalo_sent'
   * @param {number} delta - Amount to add (default 1)
   */
  async trackUsage(userId, resourceType, delta = 1) {
    return usageTrackingRepository.trackUsage(userId, resourceType, delta);
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
   * Get usage for a specific resource
   */
  async getResourceUsage(userId, resourceType) {
    const [currentUsage, limits] = await Promise.all([
      usageTrackingRepository.getCurrentUsage(userId, resourceType),
      usageTrackingRepository.getUserPlanLimits(userId),
    ]);

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
   * Increment usage (and check limit)
   */
  async incrementUsage(userId, resourceType, delta = 1) {
    // Check current limit first
    const check = await this.checkLimit(userId, resourceType);
    if (check.isExceeded) {
      throw new Error(`Đã vượt quá giới hạn sử dụng cho ${resourceType}`);
    }

    // Track the usage
    await this.trackUsage(userId, resourceType, delta);

    // Return updated status
    return this.getResourceUsage(userId, resourceType);
  }

  async ensureAvailable(userId, resourceType, delta = 1) {
    const usage = await this.getResourceUsage(userId, resourceType);
    if (usage.limit > 0 && usage.used + delta > usage.limit) {
      const error = new Error(`Đã hết ${resourceType} trong gói dịch vụ hiện tại`);
      error.status = 403;
      error.code = 'RESOURCE_LIMIT_EXCEEDED';
      error.resource = resourceType;
      error.used = usage.used;
      error.limit = usage.limit;
      throw error;
    }
    return usage;
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
