-- Migration 013: Unified Role — bỏ role 'employee', mọi user đều là user_admin
-- Quan hệ employer-employee giờ chỉ tồn tại trong user_members, không phải role cố định.
-- Các user cũ với role='employee' được nâng lên user_admin để có thể tự mua plan.

BEGIN;

-- 1. Nâng tất cả employee hiện tại lên user_admin
UPDATE users SET role = 'user_admin', updated_at = CURRENT_TIMESTAMP WHERE role = 'employee';

-- 2. Thay constraint role — bỏ 'employee'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'user_admin'));

-- 3. users_role_check có thể có tên khác trên production — thử cả tên từ migration 003
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check1;

-- 4. pending_activation vẫn là trạng thái hợp lệ cho user mới được mời nhưng chưa set password
-- (không cần đổi gì — status và role là 2 cột khác nhau)

COMMIT;
