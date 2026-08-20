import db from '../config/database.js';

class TemplateLabelRepository {
  async findAll(workspaceOwnerId) {
    const { rows } = await db.query(
      'SELECT id, name, color, created_at FROM template_labels WHERE workspace_owner_id = $1 ORDER BY name ASC',
      [workspaceOwnerId]
    );
    return rows;
  }

  async create({ name, color, workspaceOwnerId, createdBy }) {
    const { rows } = await db.query(
      `INSERT INTO template_labels (name, color, workspace_owner_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, color, created_at`,
      [name, color, workspaceOwnerId, createdBy]
    );
    return rows[0];
  }

  async deleteById(id, workspaceOwnerId) {
    const { rowCount } = await db.query(
      'DELETE FROM template_labels WHERE id = $1 AND workspace_owner_id = $2',
      [id, workspaceOwnerId]
    );
    return rowCount > 0;
  }
}

export default new TemplateLabelRepository();
