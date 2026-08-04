import db from '../../config/database.js';

/**
 * Notification Email Log Repository
 * Tracks individual email delivery and open status
 */
export default {
  /**
   * Create a single email log
   */
  async create(log) {
    const {
      notification_id,
      user_id = null,
      email,
      message_id = null,
      status = 'pending',
      sent_at = null,
      delivered_at = null,
      opened_at = null,
      bounced_at = null,
      error_message = null,
      retry_count = 0
    } = log;

    const { rows } = await db.query(
      `INSERT INTO notification_email_logs (
        notification_id, user_id, email, message_id, status,
        sent_at, delivered_at, opened_at, bounced_at,
        error_message, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        notification_id, user_id, email, message_id, status,
        sent_at, delivered_at, opened_at, bounced_at,
        error_message, retry_count
      ]
    );
    return rows[0];
  },

  /**
   * Create multiple email logs in batch
   */
  async createBatch(logs) {
    if (!logs || logs.length === 0) return [];

    const values = logs.map((log, index) => {
      const offset = index * 11;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`;
    }).join(', ');

    const params = logs.flatMap(log => [
      log.notification_id,
      log.user_id || null,
      log.email,
      log.message_id || null,
      log.status || 'pending',
      log.sent_at || null,
      log.delivered_at || null,
      log.opened_at || null,
      log.bounced_at || null,
      log.error_message || null,
      log.retry_count || 0
    ]);

    const { rows } = await db.query(
      `INSERT INTO notification_email_logs (
        notification_id, user_id, email, message_id, status,
        sent_at, delivered_at, opened_at, bounced_at,
        error_message, retry_count
      ) VALUES ${values}
      RETURNING *`,
      params
    );
    return rows;
  },

  /**
   * Update status by ID
   */
  async updateStatus(id, status, metadata = {}) {
    if (!id) return null;
    
    let query = 'UPDATE notification_email_logs SET status = $2';
    const params = [id, status];
    let paramIndex = 3;

    if (metadata.sent_at) {
      query += `, sent_at = $${paramIndex++}`;
      params.push(metadata.sent_at);
    }
    if (metadata.delivered_at) {
      query += `, delivered_at = $${paramIndex++}`;
      params.push(metadata.delivered_at);
    }
    if (metadata.opened_at) {
      query += `, opened_at = $${paramIndex++}`;
      params.push(metadata.opened_at);
    }
    if (metadata.bounced_at) {
      query += `, bounced_at = $${paramIndex++}`;
      params.push(metadata.bounced_at);
    }
    if (metadata.error_message) {
      query += `, error_message = $${paramIndex++}`;
      params.push(metadata.error_message);
    }
    if (typeof metadata.retry_count === 'number') {
      query += `, retry_count = $${paramIndex++}`;
      params.push(metadata.retry_count);
    }

    query += ` WHERE id = $1 RETURNING *`;

    const { rows } = await db.query(query, params);
    return rows[0];
  },

  /**
   * Update message_id (from SMTP provider)
   */
  async updateMessageId(id, messageId) {
    const { rows } = await db.query(
      'UPDATE notification_email_logs SET message_id = $2 WHERE id = $1 RETURNING *',
      [id, messageId]
    );
    return rows[0];
  },

  /**
   * Mark as delivered
   */
  async markAsDelivered(id, deliveredAt = new Date()) {
    return this.updateStatus(id, 'delivered', { delivered_at: deliveredAt });
  },

  /**
   * Mark as opened
   */
  async markAsOpened(id, openedAt = new Date()) {
    return this.updateStatus(id, 'opened', { opened_at: openedAt });
  },

  /**
   * Mark as bounced
   */
  async markAsBounced(id, errorMessage) {
    return this.updateStatus(id, 'bounced', {
      bounced_at: new Date(),
      error_message: errorMessage
    });
  },

  /**
   * Mark as failed
   */
  async markAsFailed(id, errorMessage) {
    return this.updateStatus(id, 'failed', { error_message: errorMessage });
  },

  /**
   * Find logs by notification ID with pagination
   */
  async findByNotificationId(notificationId, { page = 1, limit = 50, status = null }) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT l.*, u.full_name, u.username
      FROM notification_email_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.notification_id = $1
    `;
    const params = [notificationId];
    let paramIndex = 2;

    if (status) {
      query += ` AND l.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);

    const countQuery = `SELECT COUNT(*) FROM notification_email_logs WHERE notification_id = $1`;
    const countParams = status ? [notificationId, status] : [notificationId];
    const { rows: countRows } = await db.query(
      status
        ? `${countQuery} AND status = $2`
        : countQuery,
      countParams
    );

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRows[0].count, 10),
        totalPages: Math.ceil(parseInt(countRows[0].count, 10) / limit)
      }
    };
  },

  /**
   * Find logs by user ID
   */
  async findByUserId(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT l.*, n.title, n.type
       FROM notification_email_logs l
       JOIN notifications n ON l.notification_id = n.id
       WHERE l.user_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  },

  /**
   * Get stats by notification ID
   */
  async getStatsByNotificationId(notificationId) {
    const { rows } = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'opened') as opened,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM notification_email_logs
      WHERE notification_id = $1`,
      [notificationId]
    );
    return rows[0];
  },

  /**
   * Find log by message_id (for webhook processing)
   */
  async findByMessageId(messageId) {
    const { rows } = await db.query(
      'SELECT * FROM notification_email_logs WHERE message_id = $1',
      [messageId]
    );
    return rows[0];
  },

  /**
   * Update status by message_id
   */
  async updateStatusByMessageId(messageId, status, metadata = {}) {
    const { rows } = await db.query(
      `UPDATE notification_email_logs
       SET status = $2,
           ${metadata.delivered_at ? 'delivered_at = $3,' : ''}
           ${metadata.opened_at ? 'opened_at = $' + (metadata.delivered_at ? '4' : '3') + ',' : ''}
           ${metadata.bounced_at ? 'bounced_at = $' + (metadata.delivered_at ? (metadata.opened_at ? '5' : '4') : '3') + ',' : ''}
           ${metadata.error_message ? 'error_message = $' + (metadata.delivered_at ? (metadata.opened_at ? (metadata.bounced_at ? '6' : '5') : '4') : '3') + ',' : ''}
           updated_at = NOW()
       WHERE message_id = $1
       RETURNING *`,
      this.buildUpdateParams(messageId, status, metadata)
    );
    return rows[0];
  },

  /**
   * Helper to build update params
   */
  buildUpdateParams(messageId, status, metadata) {
    const params = [messageId, status];
    if (metadata.delivered_at) params.push(metadata.delivered_at);
    if (metadata.opened_at) params.push(metadata.opened_at);
    if (metadata.bounced_at) params.push(metadata.bounced_at);
    if (metadata.error_message) params.push(metadata.error_message);
    return params;
  },

  /**
   * Retry failed emails
   */
  async getFailedEmails(notificationId, maxRetries = 3) {
    const { rows } = await db.query(
      `SELECT * FROM notification_email_logs
       WHERE notification_id = $1
         AND status IN ('failed', 'bounced')
         AND retry_count < $2
       ORDER BY created_at ASC`,
      [notificationId, maxRetries]
    );
    return rows;
  },

  /**
   * Increment retry count
   */
  async incrementRetryCount(id) {
    const { rows } = await db.query(
      `UPDATE notification_email_logs
       SET retry_count = retry_count + 1
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return rows[0];
  },

  /**
   * Get email delivery stats overview
   */
  async getDeliveryStats(days = 30) {
    const { rows } = await db.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'opened') as opened,
        COUNT(*) FILTER (WHERE status IN ('failed', 'bounced')) as failed
      FROM notification_email_logs
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC`,
      [days]
    );
    return rows;
  }
};
