import db from '../config/database.js';

class TemplateLabelRepository {
  async findAll(userId) {
    const { rows } = await db.query(
      'SELECT id, name, color, created_at FROM template_labels WHERE created_by = $1 ORDER BY name ASC',
      [userId]
    );
    return rows;
  }

  async create({ name, color, createdBy }) {
    const { rows } = await db.query(
      `INSERT INTO template_labels (name, color, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, color, created_at`,
      [name, color, createdBy]
    );
    return rows[0];
  }

  async deleteById(id, userId) {
    const { rowCount } = await db.query(
      'DELETE FROM template_labels WHERE id = $1 AND created_by = $2',
      [id, userId]
    );
    return rowCount > 0;
  }
}

export default new TemplateLabelRepository();
