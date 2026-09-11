-- Super-admin sidebar layout. The available route/icon catalog remains in the
-- frontend; this table only stores category names and the order/assignment of
-- stable item keys. That keeps admins from injecting arbitrary navigation URLs.
CREATE TABLE IF NOT EXISTS admin_menu_layouts (
  scope       VARCHAR(32) PRIMARY KEY,
  categories  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_menu_layouts_scope_check CHECK (scope = 'super_admin'),
  CONSTRAINT admin_menu_layouts_categories_array_check CHECK (jsonb_typeof(categories) = 'array')
);
