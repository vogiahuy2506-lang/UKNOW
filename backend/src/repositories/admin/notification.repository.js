import db from '../../config/database.js';

/**
 * Notification Repository
 * Handles all database operations for notifications
 */
export default {
  /**
   * Create a new notification
   */
  async create(data) {
    const {
      type = 'announcement',
      title,
      title_en = null,
      message,
      message_en = null,
      html_content = null,
      html_content_en = null,
      metadata = {},
      priority = 'normal',
      target_roles = null,
      target_plans = null,
      target_statuses = null,
      target_user_ids = null,
      target_emails = null,
      registered_before = null,
      registered_after = null,
      schedule_type = 'now',
      scheduled_at = null,
      recurrence_pattern = null,
      recurrence_end_date = null,
      is_recurring = false,
      created_by = null
    } = data;

    const { rows } = await db.query(
      `INSERT INTO notifications (
        type, title, title_en, message, message_en,
        html_content, html_content_en, metadata, priority,
        target_roles, target_plans, target_statuses,
        target_user_ids, target_emails,
        registered_before, registered_after,
        schedule_type, scheduled_at, recurrence_pattern,
        recurrence_end_date, is_recurring, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *`,
      [
        type, title, title_en, message, message_en,
        html_content, html_content_en, JSON.stringify(metadata), priority,
        target_roles, target_plans, target_statuses,
        target_user_ids, target_emails,
        registered_before, registered_after,
        schedule_type, scheduled_at, recurrence_pattern,
        recurrence_end_date, is_recurring, created_by
      ]
    );
    return rows[0];
  },

  /**
   * Update notification by ID
   */
  async updateById(id, data) {
    const allowedFields = [
      'type', 'title', 'title_en', 'message', 'message_en',
      'html_content', 'html_content_en', 'metadata', 'priority',
      'target_roles', 'target_plans', 'target_statuses',
      'target_user_ids', 'target_emails',
      'registered_before', 'registered_after',
      'schedule_type', 'scheduled_at', 'recurrence_pattern',
      'recurrence_end_date', 'is_recurring',
      'status', 'recipient_count', 'sent_count', 'failed_count',
      'delivered_count', 'opened_count', 'open_rate',
      'sent_at'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await db.query(
      `UPDATE notifications SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return rows[0];
  },

  /**
   * Find notification by ID
   */
  async findById(id) {
    const { rows } = await db.query(
      `SELECT n.*, u.full_name as creator_name
       FROM notifications n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.id = $1`,
      [id]
    );
    return rows[0];
  },

  /**
   * Delete notification by ID
   */
  async deleteById(id) {
    const { rows } = await db.query(
      'DELETE FROM notifications WHERE id = $1 RETURNING id',
      [id]
    );
    return rows[0];
  },

  /**
   * Find all notifications with pagination and filters
   */
  async findAll({ page = 1, limit = 20, type, status, search, startDate, endDate }) {
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const values = [];
    let paramIndex = 1;

    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`(title ILIKE $${paramIndex} OR message ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT COUNT(*) FROM notifications WHERE ${whereClause}`;
    const { rows: countRows } = await db.query(countQuery, values);
    const total = parseInt(countRows[0].count, 10);

    const dataQuery = `
      SELECT n.*, u.full_name as creator_name
      FROM notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(limit, offset);

    const { rows } = await db.query(dataQuery, values);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Count notifications by filters
   */
  async countAll({ type, status }) {
    const conditions = ['1=1'];
    const values = [];
    let paramIndex = 1;

    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    const { rows } = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE ${conditions.join(' AND ')}`,
      values
    );
    return parseInt(rows[0].count, 10);
  },

  /**
   * Get eligible recipients based on targeting criteria
   */
  async getEligibleRecipients({
    roles = null,
    plans = null,
    statuses = null,
    userIds = null,
    emails = null,
    registeredBefore = null,
    registeredAfter = null,
    limit = null,
    offset = 0
  }) {
    const conditions = ['1=1'];
    const values = [];
    let paramIndex = 1;

    if (roles && roles.length > 0) {
      conditions.push(`role = ANY($${paramIndex++})`);
      values.push(roles);
    }

    let joinClause = '';
    if (plans && plans.length > 0) {
      joinClause = 'INNER JOIN plans ON users.active_plan_id = plans.id';
      conditions.push(`plans.code = ANY($${paramIndex++})`);
      values.push(plans);
    }

    if (statuses && statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(statuses);
    }

    if (userIds && userIds.length > 0) {
      conditions.push(`id = ANY($${paramIndex++})`);
      values.push(userIds);
    }

    if (emails && emails.length > 0) {
      conditions.push(`email = ANY($${paramIndex++})`);
      values.push(emails);
    }

    if (registeredBefore) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(registeredBefore);
    }

    if (registeredAfter) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(registeredAfter);
    }

    conditions.push('email IS NOT NULL', "email != ''");

    let query = `
      SELECT DISTINCT ON (email) id, email, full_name, username, role, active_plan_id, status, created_at
      FROM users
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ORDER BY email, created_at ASC
    `;

    if (limit) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      values.push(limit, offset);
    }

    const { rows } = await db.query(query, values);
    return rows;
  },

  /**
   * Count eligible recipients
   */
  async countEligibleRecipients({
    roles = null,
    plans = null,
    statuses = null,
    userIds = null,
    emails = null,
    registeredBefore = null,
    registeredAfter = null
  }) {
    const conditions = ['1=1'];
    const values = [];
    let paramIndex = 1;

    if (roles && roles.length > 0) {
      conditions.push(`role = ANY($${paramIndex++})`);
      values.push(roles);
    }

    let joinClause = '';
    if (plans && plans.length > 0) {
      joinClause = 'INNER JOIN plans ON users.active_plan_id = plans.id';
      conditions.push(`plans.code = ANY($${paramIndex++})`);
      values.push(plans);
    }

    if (statuses && statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(statuses);
    }

    if (userIds && userIds.length > 0) {
      conditions.push(`id = ANY($${paramIndex++})`);
      values.push(userIds);
    }

    if (emails && emails.length > 0) {
      conditions.push(`email = ANY($${paramIndex++})`);
      values.push(emails);
    }

    if (registeredBefore) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(registeredBefore);
    }

    if (registeredAfter) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(registeredAfter);
    }

    conditions.push('email IS NOT NULL', "email != ''");

    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT email) as total FROM users ${joinClause} WHERE ${conditions.join(' AND ')}`,
      values
    );
    return parseInt(rows[0].total, 10);
  },

  /**
   * Update notification stats
   * - Cộng dồn sent/failed/delivered/opened
   * - Tính lại open_rate sau khi cộng
   */
  async updateStats(id, { sent = 0, failed = 0, delivered = 0, opened = 0 }) {
    const { rows } = await db.query(
      `UPDATE notifications
       SET sent_count       = sent_count + $2,
           failed_count     = failed_count + $3,
           delivered_count  = delivered_count + $4,
           opened_count     = opened_count + $5,
           open_rate        = CASE
             WHEN sent_count + $2 > 0 THEN
               ROUND((opened_count + $5)::DECIMAL / (sent_count + $2) * 100, 2)
             ELSE 0
           END,
           updated_at       = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, sent, failed, delivered, opened]
    );
    return rows[0];
  },

  /**
   * Mark notification as sent
   */
  async markAsSent(id) {
    const { rows } = await db.query(
      `UPDATE notifications
       SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return rows[0];
  },

  /**
   * Mark notification as failed
   */
  async markAsFailed(id) {
    const { rows } = await db.query(
      `UPDATE notifications
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return rows[0];
  },

  /**
   * Get scheduled notifications that are due
   */
  async getScheduledNotifications(now = new Date()) {
    const { rows } = await db.query(
      `SELECT * FROM notifications
       WHERE status = 'scheduled'
         AND scheduled_at <= $1
       ORDER BY scheduled_at ASC`,
      [now]
    );
    return rows;
  },

  /**
   * Update schedule status
   */
  async updateScheduleStatus(id, status) {
    const { rows } = await db.query(
      `UPDATE notifications
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return rows[0];
  },

  /**
   * Get dashboard stats
   */
  async getDashboardStats() {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE status = 'scheduled') as total_scheduled,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COUNT(*) as total,
        COALESCE(SUM(sent_count), 0) as total_emails_sent,
        COALESCE(SUM(delivered_count), 0) as total_delivered,
        COALESCE(SUM(opened_count), 0) as total_opened,
        AVG(open_rate) FILTER (WHERE open_rate > 0) as avg_open_rate
      FROM notifications
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    return rows[0];
  },

  /**
   * Create a recurring child notification
   */
  async createRecurringChild(parentId, nextSendAt) {
    const parent = await this.findById(parentId);
    if (!parent) return null;

    const { rows } = await db.query(
      `INSERT INTO notifications (
        type, title, title_en, message, message_en,
        html_content, html_content_en, metadata, priority,
        target_roles, target_plans, target_statuses,
        target_user_ids, target_emails,
        registered_before, registered_after,
        schedule_type, scheduled_at, recurrence_pattern,
        recurrence_end_date, is_recurring, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        parent.type, parent.title, parent.title_en, parent.message, parent.message_en,
        parent.html_content, parent.html_content_en, parent.metadata, parent.priority,
        parent.target_roles, parent.target_plans, parent.target_statuses,
        parent.target_user_ids, parent.target_emails,
        parent.registered_before, parent.registered_after,
        'scheduled', nextSendAt, parent.recurrence_pattern,
        parent.recurrence_end_date, false, parent.created_by
      ]
    );
    return rows[0];
  },

  /**
   * Get all types with counts
   */
  async getTypesWithCounts() {
    const { rows } = await db.query(`
      SELECT type, COUNT(*) as count
      FROM notifications
      GROUP BY type
      ORDER BY count DESC
    `);
    return rows;
  },

  /**
   * Get recent notifications
   */
  async getRecent(limit = 10) {
    const { rows } = await db.query(
      `SELECT n.*, u.full_name as creator_name
       FROM notifications n
       LEFT JOIN users u ON n.created_by = u.id
       ORDER BY n.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }
};
