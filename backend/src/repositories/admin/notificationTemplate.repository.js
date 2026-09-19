import db from '../../config/database.js';

/**
 * Repository cho bảng notification_templates.
 * Pham vi: global, khong gan workspace. Service xử lý slugify / validate.
 */
const TABLE = 'notification_templates';

export default {
  async listAll() {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE} ORDER BY created_at DESC`
    );
    return rows;
  },

  async listByType(typeKey) {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE} WHERE type_key = $1 AND is_active = TRUE ORDER BY created_at DESC`,
      [typeKey]
    );
    return rows;
  },

  async getById(id) {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async getByTypeAndSlug(typeKey, slug) {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE} WHERE type_key = $1 AND slug = $2 LIMIT 1`,
      [typeKey, slug]
    );
    return rows[0] || null;
  },

  async create(input) {
    const {
      type_key,
      slug,
      name,
      description = null,
      subject,
      body_html,
      schedule_type = 'now',
      scheduled_at = null,
      recurrence_pattern = null,
      recurrence_end_date = null,
      created_by = null,
    } = input;

    const { rows } = await db.query(
      `INSERT INTO ${TABLE}
         (type_key, slug, name, description, subject, body_html,
          schedule_type, scheduled_at, recurrence_pattern, recurrence_end_date,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        type_key,
        slug,
        name,
        description,
        subject,
        body_html,
        schedule_type,
        scheduled_at,
        recurrence_pattern,
        recurrence_end_date,
        created_by,
      ]
    );
    return rows[0];
  },

  async findDueScheduled(now) {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE}
        WHERE schedule_type = 'scheduled'
          AND is_active = TRUE
          AND scheduled_at IS NOT NULL
          AND scheduled_at <= $1
        ORDER BY scheduled_at ASC`,
      [now]
    );
    return rows;
  },

  async findDueRecurring(now) {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLE}
        WHERE schedule_type = 'recurring'
          AND is_active = TRUE
          AND scheduled_at IS NOT NULL
          AND scheduled_at <= $1
          AND (recurrence_end_date IS NULL OR recurrence_end_date >= $1)
        ORDER BY scheduled_at ASC`,
      [now]
    );
    return rows;
  },

  async markDispatched(id, nextRunAt) {
    if (nextRunAt === null) {
      // Hết hạn hoặc chỉ gửi một lần — tắt active.
      const { rows } = await db.query(
        `UPDATE ${TABLE}
            SET last_dispatched_at = NOW(),
                updated_at = NOW(),
                is_active = FALSE
          WHERE id = $1
        RETURNING *`,
        [id]
      );
      return rows[0];
    }
    const { rows } = await db.query(
      `UPDATE ${TABLE}
          SET last_dispatched_at = NOW(),
              scheduled_at = $2,
              updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [id, nextRunAt]
    );
    return rows[0];
  },
};

