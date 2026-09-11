import db from '../../config/database.js';

const SUPER_ADMIN_SCOPE = 'super_admin';

export async function findSuperAdminLayout(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT categories, updated_by, updated_at
     FROM admin_menu_layouts
     WHERE scope = $1
     LIMIT 1`,
    [SUPER_ADMIN_SCOPE]
  );
  return rows[0] || null;
}

export async function saveSuperAdminLayout(categories, updatedBy, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO admin_menu_layouts (scope, categories, updated_by)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (scope) DO UPDATE SET
       categories = EXCLUDED.categories,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING categories, updated_by, updated_at`,
    [SUPER_ADMIN_SCOPE, JSON.stringify(categories), updatedBy]
  );
  return rows[0];
}
