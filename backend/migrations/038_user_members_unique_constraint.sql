-- Thêm unique constraint (owner_id, employee_id) vào user_members nếu chưa có.
-- Xóa duplicate trước (giữ bản ghi mới nhất) để tránh lỗi khi tạo constraint.
DELETE FROM user_members a
USING user_members b
WHERE a.id < b.id
  AND a.owner_id = b.owner_id
  AND a.employee_id = b.employee_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_owner_employee'
      AND conrelid = 'user_members'::regclass
  ) THEN
    ALTER TABLE user_members
      ADD CONSTRAINT uq_owner_employee UNIQUE (owner_id, employee_id);
  END IF;
END $$;
