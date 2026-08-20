import db from '../../config/database.js';

export class ScheduledPlanChangeRepository {
  constructor(database = db) {
    this.db = database;
  }

  /**
   * Find active pending scheduled plan change for a user.
   * @param {number|string} userId
   * @param {import('pg').PoolClient} [client]
   */
  async findPendingByUserId(userId, client = null) {
    const database = client || this.db;
    const query = `
      SELECT
        spc.id,
        spc.user_id,
        spc.plan_id,
        spc.billing_period,
        spc.order_id,
        spc.amount_paid,
        spc.status,
        spc.activate_after,
        spc.activated_at,
        spc.created_at,
        spc.updated_at,
        p.name AS plan_name,
        p.price AS plan_price,
        p.price_yearly AS plan_price_yearly
      FROM scheduled_plan_changes spc
      JOIN plans p ON p.id = spc.plan_id
      WHERE spc.user_id = $1 AND spc.status = 'pending'
      LIMIT 1;
    `;
    const result = await database.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Find scheduled plan change by order ID (for idempotent webhook/poll handling).
   * @param {number|string} orderId
   * @param {import('pg').PoolClient} [client]
   */
  async findByOrderId(orderId, client = null) {
    if (!orderId) return null;
    const database = client || this.db;
    const query = `SELECT * FROM scheduled_plan_changes WHERE order_id = $1 LIMIT 1;`;
    const result = await database.query(query, [orderId]);
    return result.rows[0] || null;
  }

  /**
   * Create a new scheduled plan change.
   * @param {Object} data
   * @param {import('pg').PoolClient} [client]
   */
  async create({
    userId,
    planId,
    billingPeriod,
    orderId = null,
    amountPaid = 0,
    activateAfter,
  }, client = null) {
    const database = client || this.db;
    const query = `
      INSERT INTO scheduled_plan_changes (
        user_id,
        plan_id,
        billing_period,
        order_id,
        amount_paid,
        status,
        activate_after,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW())
      RETURNING *;
    `;
    const result = await database.query(query, [
      userId,
      planId,
      billingPeriod,
      orderId,
      amountPaid,
      activateAfter,
    ]);
    return result.rows[0];
  }

  /**
   * Mark any existing pending scheduled plan changes for a user as superseded.
   * @param {number|string} userId
   * @param {import('pg').PoolClient} [client]
   */
  async supersedePendingByUserId(userId, client = null) {
    const database = client || this.db;
    const query = `
      UPDATE scheduled_plan_changes
      SET status = 'superseded', updated_at = NOW()
      WHERE user_id = $1 AND status = 'pending'
      RETURNING *;
    `;
    const result = await database.query(query, [userId]);
    return result.rows;
  }

  /**
   * Find all scheduled plan changes ready for activation (status = 'pending' AND activate_after <= NOW()).
   * @param {import('pg').PoolClient} [client]
   */
  async findDueChanges(client = null) {
    const database = client || this.db;
    const query = `
      SELECT
        spc.id,
        spc.user_id,
        spc.plan_id,
        spc.billing_period,
        spc.order_id,
        spc.amount_paid,
        spc.activate_after,
        u.email AS user_email,
        u.full_name AS user_full_name,
        p.name AS plan_name,
        p.duration_days AS plan_duration_days
      FROM scheduled_plan_changes spc
      JOIN users u ON u.id = spc.user_id
      JOIN plans p ON p.id = spc.plan_id
      WHERE spc.status = 'pending' AND spc.activate_after <= NOW()
      ORDER BY spc.activate_after ASC;
    `;
    const result = await database.query(query);
    return result.rows;
  }

  /**
   * Mark a scheduled plan change as activated.
   * @param {number|string} id
   * @param {import('pg').PoolClient} [client]
   */
  async markActivated(id, client = null) {
    const database = client || this.db;
    const query = `
      UPDATE scheduled_plan_changes
      SET status = 'activated', activated_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const result = await database.query(query, [id]);
    return result.rows[0] || null;
  }
}

export const scheduledPlanChangeRepository = new ScheduledPlanChangeRepository();
