import db from '../../config/database.js';
import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import * as planRepository from '../../repositories/payment/plan.repository.js';

async function acquireUsageTrackingLock(client, userId, resourceType) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
    [`usage:${userId}`, String(resourceType)]
  );
}

class UsageTrackingService {
  /**
   * Track usage for a resource
   * @param {number} userId
   * @param {string} resourceType - e.g., 'campaign', 'landing_page', 'email_sent', 'zalo_sent'
   * @param {number} delta - Amount to add (default 1)
   * @param {object} metadata - Optional usage metadata
   */
  async trackUsage(userId, resourceType, delta = 1, metadata = {}) {
    return usageTrackingRepository.trackUsage(userId, resourceType, delta, metadata);
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
   * Increment usage (and check limit) atomically within a transaction.
   */
  async incrementUsage(userId, resourceType, delta = 1) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await acquireUsageTrackingLock(client, userId, resourceType);
      const limits = await usageTrackingRepository.getUserPlanLimits(userId, client);
      const limit = this._getLimitForResource(limits, resourceType);
      const currentUsage = await usageTrackingRepository.getCurrentUsage(userId, resourceType, client);
      if (limit > 0 && currentUsage + delta > limit) {
        const error = new Error(`Đã vượt quá giới hạn sử dụng cho ${resourceType}`);
        error.status = 403;
        error.code = 'RESOURCE_LIMIT_EXCEEDED';
        error.resource = resourceType;
        throw error;
      }
      await usageTrackingRepository.trackUsage(userId, resourceType, delta, {}, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.getResourceUsage(userId, resourceType);
  }

  async ensureAvailable(userId, resourceType, delta = 1) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await acquireUsageTrackingLock(client, userId, resourceType);
      const limits = await usageTrackingRepository.getUserPlanLimits(userId, client);
      const limit = this._getLimitForResource(limits, resourceType);
      const used = await usageTrackingRepository.getCurrentUsage(userId, resourceType, client);
      if (limit > 0 && used + delta > limit) {
        const error = new Error(`Đã hết ${resourceType} trong gói dịch vụ hiện tại`);
        error.status = 403;
        error.code = 'RESOURCE_LIMIT_EXCEEDED';
        error.resource = resourceType;
        error.used = used;
        error.limit = limit;
        throw error;
      }
      await client.query('COMMIT');
      return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        percentage: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
        isExceeded: limit > 0 && used >= limit,
        isWarning: limit > 0 && (used / limit) * 100 >= 80 && (used / limit) * 100 < 100,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      ai_token: 'ai_tokens_per_period',
      ai_tokens: 'ai_tokens_per_period',
      chatbot: 'max_chatbots',
      chatbots: 'max_chatbots',
    };

    const limitKey = mapping[resourceType];
    return limitKey ? (limits[limitKey] || 0) : 0;
  }
}

export default new UsageTrackingService();
