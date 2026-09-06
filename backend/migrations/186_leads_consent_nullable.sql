-- Migration 186: leads.marketing_consent nullable (Nghị định 330/2026/NĐ-CP)
-- Cho phép lưu 3 trạng thái:
--   TRUE:  form có ô checkbox, người dùng đã tick
--   FALSE: form có ô checkbox, người dùng chủ động bỏ trống (từ chối)
--   NULL:  form không có ô checkbox (chưa hỏi, không tự suy đoán đồng ý)

ALTER TABLE leads ALTER COLUMN marketing_consent DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN marketing_consent DROP DEFAULT;
