import db from '../config/database.js';

class UsageTrackingRepository {
  /**
   * Get user's current usage for all resources
   */
  async getUserUsage(userId) {
    const { rows } = await db.query(
      `SELECT * FROM usage_logs WHERE id_user = $1 ORDER BY period_start DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Get current period usage for a specific resource
   */
  async getCurrentUsage(userId, resourceType) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { rows } = await db.query(
      `SELECT COALESCE(SUM(delta), 0) as total_usage
       FROM usage_logs
       WHERE id_user = $1
         AND resource_type = $2
         AND period_start >= $3
         AND period_end <= $4`,
      [userId, resourceType, periodStart.toISOString(), now.toISOString()]
    );
    return parseInt(rows[0]?.total_usage || 0);
  }

  /**
   * Get usage summary for all resources in current period
   */
  async getUsageSummary(userId) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { rows } = await db.query(
      `SELECT
         resource_type,
         COALESCE(SUM(delta), 0) as total_usage
       FROM usage_logs
       WHERE id_user = $1
         AND period_start >= $2
       GROUP BY resource_type`,
      [userId, periodStart.toISOString()]
    );
    return rows;
  }

  /**
   * Track usage for a resource
   */
  async trackUsage(userId, resourceType, delta = 1) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const { rows } = await db.query(
      `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, resourceType, delta, periodStart.toISOString(), periodEnd.toISOString()]
    );
    return rows[0];
  }

  /**
   * Get plan limits for a user
   */
  async getUserPlanLimits(userId) {
    const { rows } = await db.query(
      `SELECT
         p.max_employees,
         p.max_landing_pages,
         p.max_campaigns,
         p.max_zalo_accounts,
         p.max_email_accounts,
         p.max_email_templates,
         p.max_zalo_templates,
         p.daily_email_limit,
         p.monthly_email_limit,
         p.daily_zalo_limit,
         p.monthly_zalo_limit
       FROM users u
       JOIN plans p ON p.id = u.active_plan_id
       WHERE u.id = $1`,
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Check if user can use a feature
   */
  async canUseFeature(userId, featureName) {
    const { rows } = await db.query(
      `SELECT p.features
       FROM users u
       JOIN plans p ON p.id = u.active_plan_id
       WHERE u.id = $1`,
      [userId]
    );

    if (!rows[0]?.features) return true; // No feature restrictions

    const features = rows[0].features;
    if (Array.isArray(features)) {
      return features.includes(featureName);
    }
    if (typeof features === 'object') {
      return features[featureName] === true;
    }

    return true;
  }
}

export default new UsageTrackingRepository();
