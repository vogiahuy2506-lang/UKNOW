-- Migration 158: courses/products belong to a workspace and retain their creator.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE courses
SET workspace_owner_id = id_user,
    created_by = id_user
WHERE workspace_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_courses_workspace_owner
  ON courses(workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_courses_effective_workspace_owner
  ON courses((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX IF NOT EXISTS idx_courses_created_by
  ON courses(created_by) WHERE created_by IS NOT NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE products
SET workspace_owner_id = id_user,
    created_by = id_user
WHERE workspace_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_workspace_owner
  ON products(workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_products_effective_workspace_owner
  ON products((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX IF NOT EXISTS idx_products_created_by
  ON products(created_by) WHERE created_by IS NOT NULL;
