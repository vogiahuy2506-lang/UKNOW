-- Migration 171: Unique index on courses by workspace owner and course_code
-- Ngăn ngừa nhân đôi sản phẩm / khóa học khi đồng bộ WooCommerce chạy nhiều lượt đồng thời

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_unique_workspace_code
  ON courses ((COALESCE(workspace_owner_id, id_user)), course_code)
  WHERE course_code IS NOT NULL;
