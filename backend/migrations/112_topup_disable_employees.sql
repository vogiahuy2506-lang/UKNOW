-- Tạm dừng bán slot nhân viên: đang bán "/tháng" nhưng chưa có cơ chế thu hồi.
-- Chờ quyết định: bán đứt (không cần khoá) hay giữ theo tháng + khoá có ân hạn.
UPDATE topup_pricing
   SET is_active = FALSE, updated_at = NOW()
 WHERE item_key = 'employees';
