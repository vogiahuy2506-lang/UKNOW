import db from '../config/database.js';

class AuditService {
  async log({ userId, ownerId = null, category = 'workspace', action, entityType, entityId, details = {}, req = null }) {
    try {
      await db.query(
        `INSERT INTO audit_logs (id_user, owner_id, category, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId || null,
          ownerId || null,
          category,
          action,
          entityType || null,
          entityId || null,
          JSON.stringify(details),
          req?.ip || req?.connection?.remoteAddress || null,
          req?.headers?.['user-agent'] || null,
        ]
      );
    } catch (err) {
      console.error('[AuditService] Failed to log audit:', err.message);
    }
  }

  // Employer view: logs scoped to their workspace (own actions + employees' actions)
  async getWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = {}) {
    const conditions = ['(owner_id = $1 OR (id_user = $1 AND category = \'workspace\'))'];
    const params = [ownerId];
    let i = 2;

    if (actorId) { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action)  { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate)  { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details,
              al.ip_address, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username, u.avatar_url AS actor_avatar
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.id_user
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    return rows;
  }

  async countWorkspaceLogs({ ownerId, actorId, action, entityType, startDate, endDate } = {}) {
    const conditions = ['(owner_id = $1 OR (id_user = $1 AND category = \'workspace\'))'];
    const params = [ownerId];
    let i = 2;

    if (actorId)    { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action)     { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate)  { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params
    );
    return rows[0].total;
  }

  // Super admin view: system-level events only
  async getSystemLogs({ actorId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = {}) {
    const conditions = [`category = 'system'`];
    const params = [];
    let i = 1;

    if (actorId)    { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action)     { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate)  { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details,
              al.ip_address, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username, u.email AS actor_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.id_user
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    return rows;
  }

  async countSystemLogs({ actorId, action, entityType, startDate, endDate } = {}) {
    const conditions = [`category = 'system'`];
    const params = [];
    let i = 1;

    if (actorId)    { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action)     { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate)  { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params
    );
    return rows[0].total;
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
 * Call this in controllers where req is available.
 */
export async function logWorkspace(req, action, entityType, entityId, details = {}) {
  const userId = req.user?.id;
  // owner_id = employer. If acting as employee (activeContext.type === 'employee'), owner is activeContext.ownerId.
  const ownerId = req.user?.activeContext?.type === 'employee'
    ? req.user.activeContext.ownerId
    : userId;

  return auditService.log({ userId, ownerId, category: 'workspace', action, entityType, entityId, details, req });
}

/**
 * Log a system event (super admin action).
 */
export async function logSystem(req, action, entityType, entityId, details = {}) {
  return auditService.log({
    userId: req.user?.id,
    ownerId: null,
    category: 'system',
    action,
    entityType,
    entityId,
    details,
    req,
  });
}

export default auditService;
