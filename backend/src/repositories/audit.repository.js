import db from '../config/database.js';

class AuditRepository {
  async createLog({
    userId,
    ownerId,
    category,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
    userAgent,
  }) {
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
        JSON.stringify(details || {}),
        ipAddress || null,
        userAgent || null,
      ]
    );
  }

  buildWorkspaceFilters({ ownerId, actorId, action, entityType, startDate, endDate } = {}) {
    const conditions = ['(owner_id = $1 OR (id_user = $1 AND category = \'workspace\'))'];
    const params = [ownerId];
    let i = 2;

    if (actorId) { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action) { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate) { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate) { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    return { conditions, params, nextIndex: i };
  }

  buildSystemFilters({ actorId, action, entityType, startDate, endDate } = {}) {
    const conditions = [`category = 'system'`];
    const params = [];
    let i = 1;

    if (actorId) { conditions.push(`id_user = $${i++}`); params.push(actorId); }
    if (action) { conditions.push(`action = $${i++}`); params.push(action); }
    if (entityType) { conditions.push(`entity_type = $${i++}`); params.push(entityType); }
    if (startDate) { conditions.push(`created_at >= $${i++}`); params.push(startDate); }
    if (endDate) { conditions.push(`created_at <= $${i++}`); params.push(endDate); }

    return { conditions, params, nextIndex: i };
  }

  async getWorkspaceLogs(input = {}) {
    const { limit = 50, offset = 0 } = input;
    const { conditions, params, nextIndex } = this.buildWorkspaceFilters(input);
    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details,
              al.ip_address, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username, u.avatar_url AS actor_avatar
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.id_user
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      params
    );
    return rows;
  }

  async countWorkspaceLogs(input = {}) {
    const { conditions, params } = this.buildWorkspaceFilters(input);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params
    );
    return rows[0].total;
  }

  async getSystemLogs(input = {}) {
    const { limit = 50, offset = 0 } = input;
    const { conditions, params, nextIndex } = this.buildSystemFilters(input);
    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details,
              al.ip_address, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username, u.email AS actor_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.id_user
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      params
    );
    return rows;
  }

  async countSystemLogs(input = {}) {
    const { conditions, params } = this.buildSystemFilters(input);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params
    );
    return rows[0].total;
  }
}

export default new AuditRepository();
