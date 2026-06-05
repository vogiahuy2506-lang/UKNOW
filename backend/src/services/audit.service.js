import auditRepository from '../repositories/audit.repository.js';

class AuditService {
  async log({
    userId,
    ownerId = null,
    category = 'workspace',
    action,
    entityType,
    entityId,
    details = {},
    ipAddress = null,
    userAgent = null,
  }) {
    try {
      await auditRepository.createLog({
        userId,
        ownerId,
        category,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
      });
    } catch (err) {
      console.error('[AuditService] Failed to log audit:', err.message);
    }
  }

  // Employer view: logs scoped to their workspace (own actions + employees' actions)
  async getWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = {}) {
    return auditRepository.getWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate, limit, offset });
  }

  async countWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate } = {}) {
    return auditRepository.countWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate });
  }

  // Super admin view: system-level events only
  async getSystemLogs({ actorId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = {}) {
    return auditRepository.getSystemLogs({ actorId, action, entityType, startDate, endDate, limit, offset });
  }

  async countSystemLogs({ actorId, action, entityType, startDate, endDate } = {}) {
    return auditRepository.countSystemLogs({ actorId, action, entityType, startDate, endDate });
  }
}

const auditService = new AuditService();

export const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',

  // System — plans
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_UPDATED: 'PLAN_UPDATED',
  PLAN_DELETED: 'PLAN_DELETED',

  // System — vouchers
  VOUCHER_CREATED: 'VOUCHER_CREATED',
  VOUCHER_UPDATED: 'VOUCHER_UPDATED',
  VOUCHER_DELETED: 'VOUCHER_DELETED',

  // System — users
  USER_REGISTERED: 'USER_REGISTERED',
  USER_PLAN_CHANGED: 'USER_PLAN_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',

  // Workspace — employees
  EMPLOYEE_ADDED: 'EMPLOYEE_ADDED',
  EMPLOYEE_REMOVED: 'EMPLOYEE_REMOVED',
  EMPLOYEE_LIMITS_UPDATED: 'EMPLOYEE_LIMITS_UPDATED',
  EMPLOYEE_PERMISSIONS_UPDATED: 'EMPLOYEE_PERMISSIONS_UPDATED',
  EMPLOYEE_STATUS_UPDATED: 'EMPLOYEE_STATUS_UPDATED',
  EMPLOYEE_PASSWORD_RESET: 'EMPLOYEE_PASSWORD_RESET',

  // Workspace — campaigns
  CAMPAIGN_CREATED: 'CAMPAIGN_CREATED',
  CAMPAIGN_UPDATED: 'CAMPAIGN_UPDATED',
  CAMPAIGN_DELETED: 'CAMPAIGN_DELETED',
  CAMPAIGN_RUN_STARTED: 'CAMPAIGN_RUN_STARTED',
  CAMPAIGN_PAUSED: 'CAMPAIGN_PAUSED',

  // Workspace — templates
  EMAIL_TEMPLATE_CREATED: 'EMAIL_TEMPLATE_CREATED',
  EMAIL_TEMPLATE_UPDATED: 'EMAIL_TEMPLATE_UPDATED',
  EMAIL_TEMPLATE_DELETED: 'EMAIL_TEMPLATE_DELETED',
  ZALO_TEMPLATE_CREATED: 'ZALO_TEMPLATE_CREATED',
  ZALO_TEMPLATE_UPDATED: 'ZALO_TEMPLATE_UPDATED',
  ZALO_TEMPLATE_DELETED: 'ZALO_TEMPLATE_DELETED',
};

export const AUDIT_ENTITY_TYPES = {
  USER: 'user',
  PLAN: 'plan',
  VOUCHER: 'voucher',
  EMPLOYEE: 'employee',
  CAMPAIGN: 'campaign',
  EMAIL_TEMPLATE: 'email_template',
  ZALO_TEMPLATE: 'zalo_template',
};

/**
 * Log a workspace event (employer/employee action).
 */
export async function logWorkspace(context, action, entityType, entityId, details = {}) {
  return auditService.log({
    userId: context?.userId,
    ownerId: context?.ownerId,
    category: 'workspace',
    action,
    entityType,
    entityId,
    details,
    ipAddress: context?.ipAddress || null,
    userAgent: context?.userAgent || null,
  });
}

/**
 * Log a system event (super admin action).
 */
export async function logSystem(context, action, entityType, entityId, details = {}) {
  return auditService.log({
    userId: context?.userId,
    ownerId: context?.ownerId || null,
    category: 'system',
    action,
    entityType,
    entityId,
    details,
    ipAddress: context?.ipAddress || null,
    userAgent: context?.userAgent || null,
  });
}

export default auditService;
