import db from '../../config/database.js';

const SUPER_ADMIN_SCOPE = 'super_admin';

export async function findLayout({ scope = SUPER_ADMIN_SCOPE, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `SELECT categories, links, updated_by, updated_at
     FROM admin_menu_layouts
     WHERE scope = $1
     LIMIT 1`,
    [scope]
  );
  return rows[0] || null;
}

/**
 * `links = null` là sentinel "không đổi" — INSERT lần đầu (chưa có dòng) coi như rỗng, UPDATE
 * COALESCE về giá trị `links` đang có sẵn trong DB thay vì ghi đè mất (xem updateAppMenuLayout
 * ở service — dùng khi client cũ gửi PUT không kèm trường `links`).
 */
export async function saveLayout({ categories, links = null, updatedBy, scope = SUPER_ADMIN_SCOPE, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `INSERT INTO admin_menu_layouts (scope, categories, links, updated_by)
     VALUES ($1, $2::jsonb, COALESCE($3::jsonb, '[]'::jsonb), $4)
     ON CONFLICT (scope) DO UPDATE SET
       categories = EXCLUDED.categories,
       links = COALESCE($3::jsonb, admin_menu_layouts.links),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING categories, links, updated_by, updated_at`,
    [scope, JSON.stringify(categories), links !== null ? JSON.stringify(links) : null, updatedBy]
  );
  return rows[0];
}

export async function findSuperAdminLayout(queryable = db) {
  return findLayout({ scope: SUPER_ADMIN_SCOPE, queryable });
}

export async function saveSuperAdminLayout(categories, updatedBy, queryable = db) {
  return saveLayout({ categories, updatedBy, scope: SUPER_ADMIN_SCOPE, queryable });
}
