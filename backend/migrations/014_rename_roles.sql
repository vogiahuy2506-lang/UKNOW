-- Migration 014: Đổi tên role cho gọn
-- user_admin → user   (người dùng thông thường với plan riêng)
-- super_admin → admin  (quản trị viên hệ thống)
--
-- Thứ tự bắt buộc: DROP constraint cũ → UPDATE rows → ADD constraint mới.
-- (Nếu UPDATE trước thì các giá trị 'user'/'admin' mới sẽ vi phạm constraint cũ
-- vốn chỉ cho phép 'super_admin' và 'user_admin'.)

BEGIN;

-- 1. Bỏ constraint cũ + default cũ để cho phép update giá trị
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- 2. Đổi giá trị hiện có
UPDATE users SET role = 'user'  WHERE role = 'user_admin';
UPDATE users SET role = 'admin' WHERE role = 'super_admin';

-- 3. Thêm constraint mới + default mới
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

COMMIT;
