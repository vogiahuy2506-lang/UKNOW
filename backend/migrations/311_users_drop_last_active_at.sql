-- Migration: bỏ cột chết users.last_active_at.
--
-- Cột có từ sớm nhưng chưa bao giờ có đường ghi: production 27/10/2026 0/398 tài khoản có giá trị, backend không
-- SELECT/UPDATE cột này ở câu SQL nào (mốc "hoạt động gần nhất" của thành viên tính từ last_login_at + refresh token,
-- xem repositories/admin/adminMembers.repository.js; teamOverview.repository.js chỉ dùng tên alias trùng).
-- Mirror: tests/integration/sql/bootstrap.sql + fixtures/productionSchemaInventory.json cùng bỏ cột.
--
-- allow-destructive-ddl: không câu SQL nào trong backend/src chạm cột (grep last_active_at chỉ ra bootstrap/fixture),
-- nên container cũ còn chạy lúc migrate cũng không có lệnh nào đọc/ghi nó; DROP COLUMN chỉ sửa metadata, không rewrite bảng.

ALTER TABLE users DROP COLUMN IF EXISTS last_active_at;
