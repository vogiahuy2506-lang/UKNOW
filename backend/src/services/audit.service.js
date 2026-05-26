import db from '../config/database.js';

class AuditService {
  /**
   * Log an action to the audit log
   * @param {object} params
   */
  async log({ userId, action, entityType, entityId, details = {}, req = null }) {
    try {
      await db.query(
        `INSERT INTO audit_logs (id_user, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          action,
          entityType,
          entityId,
          JSON.stringify(details),
          req?.ip || req?.connection?.remoteAddress || null,
          req?.headers?.['user-agent'] || null,
        ]
      );
    } catch (err) {
      console.error('[AuditService] Failed to log audit:', err.message);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Get audit logs with filters
   * @param {object} filters
   */
  async getLogs({ userId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`id_user = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex}`);
      params.push(entityType);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);

    const query = `
      SELECT al.*, u.full_name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.id_user
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Get audit log summary by action type
   * @param {number} userId
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async getSummary(userId, startDate, endDate) {
    const { rows } = await db.query(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE ($1::BIGINT IS NULL OR id_user = $1)
         AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
         AND ($3::TIMESTAMPTZ IS NULL OR created_at <= $3)
       GROUP BY action
       ORDER BY count DESC`,
      [userId, startDate, endDate]
    );
    return rows;
  }
}

const auditService = new AuditService();

// Predefined action types
export const AUDIT_ACTIONS = {
  // Auth actions
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',

  // Channel actions
  CHANNEL_CONNECTED: 'CHANNEL_CONNECTED',
  CHANNEL_DISCONNECTED: 'CHANNEL_DISCONNECTED',
  CHANNEL_CONFIG_UPDATED: 'CHANNEL_CONFIG_UPDATED',

  // Chatbot actions
  CHATBOT_SETTINGS_UPDATED: 'CHATBOT_SETTINGS_UPDATED',
  KB_CREATED: 'KB_CREATED',
  KB_UPDATED: 'KB_UPDATED',
  KB_DELETED: 'KB_DELETED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  SUB_ASSISTANT_CREATED: 'SUB_ASSISTANT_CREATED',
  SUB_ASSISTANT_UPDATED: 'SUB_ASSISTANT_UPDATED',
  SUB_ASSISTANT_DELETED: 'SUB_ASSISTANT_DELETED',

  // Campaign actions
  CAMPAIGN_CREATED: 'CAMPAIGN_CREATED',
  CAMPAIGN_UPDATED: 'CAMPAIGN_UPDATED',
  CAMPAIGN_DELETED: 'CAMPAIGN_DELETED',
  CAMPAIGN_RUN_STARTED: 'CAMPAIGN_RUN_STARTED',
  CAMPAIGN_RUN_COMPLETED: 'CAMPAIGN_RUN_COMPLETED',
  CAMPAIGN_RUN_FAILED: 'CAMPAIGN_RUN_FAILED',

  // Subscription actions
  PLAN_CHANGED: 'PLAN_CHANGED',
  SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',

  // Admin actions
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_UPDATED: 'PLAN_UPDATED',
  PLAN_DELETED: 'PLAN_DELETED',
};

export const AUDIT_ENTITY_TYPES = {
  USER: 'user',
  PLAN: 'plan',
  CHANNEL: 'channel',
  CHATBOT_SETTINGS: 'chatbot_settings',
  KNOWLEDGE_BASE: 'knowledge_base',
  DOCUMENT: 'document',
  SUB_ASSISTANT: 'sub_assistant',
  CAMPAIGN: 'campaign',
  CAMPAIGN_RUN: 'campaign_run',
  SUBSCRIPTION: 'subscription',
  ORDER: 'order',
};

// Quick helper for common audit actions
export async function auditLog(req, action, entityType, entityId, details = {}) {
  return auditService.log({
    userId: req.user?.id,
    action,
    entityType,
    entityId,
    details,
    req,
  });
}

export default auditService;
