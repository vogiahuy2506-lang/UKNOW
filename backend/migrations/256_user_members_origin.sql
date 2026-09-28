-- Migration 256: user_members.origin — membership này do chủ TẠO tài khoản ('created') hay LIÊN KẾT một
-- tài khoản có sẵn ('linked').
--
-- RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1. Hai nút "Đặt lại mật khẩu" và "Sửa thông tin" (đổi email
-- đăng nhập) được viết cho tài khoản do chủ tạo ra (createEmployeeWithLink), nhưng bảng không ghi membership
-- sinh ra từ đường nào, nên chúng áp luôn cho tài khoản độc lập vừa bị liên kết qua POST /employees/invite —
-- chủ nhóm đặt lại mật khẩu rồi đăng nhập được vào tài khoản người khác. Cột này là chỗ để code phân biệt.
--
-- Backfill theo dấu vết giao dịch: createEmployeeWithLink chèn users (CURRENT_TIMESTAMP) và user_members
-- (DEFAULT NOW()) trong CÙNG một transaction nên hai created_at bằng nhau; tài khoản có sẵn bị liên kết thì
-- users.created_at sớm hơn hẳn. Nới ±5 giây cho chắc. Mặc định của cột là 'linked' (an toàn: nhầm thì chủ chỉ
-- mất nút reset — nhân viên vẫn tự "Quên mật khẩu" được), nhầm chiều ngược lại mới là lỗ.
--
-- Không DROP/RENAME gì. Idempotent: ADD COLUMN IF NOT EXISTS; constraint chỉ thêm khi chưa có.

BEGIN;

ALTER TABLE user_members
  ADD COLUMN IF NOT EXISTS origin VARCHAR(16) NOT NULL DEFAULT 'linked';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_members_origin') THEN
    ALTER TABLE user_members
      ADD CONSTRAINT chk_user_members_origin CHECK (origin IN ('created', 'linked'));
  END IF;
END $$;

UPDATE user_members um
SET origin = 'created'
FROM users u
WHERE u.id = um.employee_id
  AND um.origin = 'linked'
  AND u.created_at BETWEEN um.created_at - INTERVAL '5 seconds' AND um.created_at + INTERVAL '5 seconds';

COMMIT;
