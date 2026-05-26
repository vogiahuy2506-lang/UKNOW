import usageTrackingService from '../services/payment/usageTracking.service.js';

// Predefined feature constants
export const FEATURES = {
  UNIFIED_INBOX: 'unified_inbox',
  MULTI_LANGUAGE: 'multi_language',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  CUSTOM_DOMAIN: 'custom_domain',
  API_ACCESS: 'api_access',
  WHITE_LABEL: 'white_label',
  PRIORITY_SUPPORT: 'priority_support',
  CUSTOM_BRANDING: 'custom_branding',
};

export const RESOURCE_TYPES = {
  CAMPAIGN: 'campaign',
  LANDING_PAGE: 'landing_page',
  EMPLOYEE: 'employee',
  EMAIL_SENT: 'email_sent',
  ZALO_SENT: 'zalo_sent',
};

/**
 * Middleware to check if user has a specific feature
 */
export function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
        });
      }

      const hasFeature = await usageTrackingService.hasFeature(req.user.id, featureName);

      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          message: `Tính năng "${featureName}" không có trong gói dịch vụ của bạn. Vui lòng nâng cấp để sử dụng.`,
          code: 'FEATURE_NOT_AVAILABLE',
          upgradeRequired: true,
        });
      }

      next();
    } catch (err) {
      console.error('[FeatureGate] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        code: 'SERVER_ERROR',
      });
    }
  };
}

/**
 * Middleware to check if user can use more of a resource
 */
export function requireResource(resourceType, delta = 1) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
        });
      }

      const check = await usageTrackingService.checkLimit(req.user.id, resourceType);

      if (check.isExceeded) {
        return res.status(403).json({
          success: false,
          message: `Bạn đã vượt quá giới hạn ${resourceType} của gói dịch vụ. Vui lòng nâng cấp hoặc chờ chu kỳ tiếp theo.`,
          code: 'RESOURCE_LIMIT_EXCEEDED',
          resource: resourceType,
          used: check.used,
          limit: check.limit,
          remaining: check.remaining,
          upgradeRequired: true,
        });
      }

      if (check.isWarning) {
        // Add warning header but continue
        res.set('X-Resource-Warning', `${resourceType}:${check.percentage.toFixed(0)}%`);
      }

      // Attach usage info to request for tracking later
      req.usageCheck = check;

      next();
    } catch (err) {
      console.error('[ResourceGate] Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        code: 'SERVER_ERROR',
      });
    }
  };
}

/**
 * Track usage after successful operation
 */
export async function trackUsage(req, resourceType, delta = 1) {
  if (req.user?.id) {
    try {
      await usageTrackingService.incrementUsage(req.user.id, resourceType, delta);
    } catch (err) {
      console.warn('[TrackUsage] Warning:', err.message);
      // Don't throw - usage tracking should not break the main flow
    }
  }
}
