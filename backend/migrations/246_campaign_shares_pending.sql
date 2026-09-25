-- Migration 246: Cho phép share campaign với email ngoài hệ thống (PR-2).
-- Tách 3 việc (giống migration 245 landing page share):
--   1) Cho phép id_recipient NULL để lưu share khi email chưa có tài khoản.
--   2) Thêm cột status (pending / active / revoked).
--   3) Thêm partial index cho auto-claim khi user đăng ký.

BEGIN;

-- 1) Bỏ ràng buộc NOT NULL trên id_recipient (FK vẫn giữ — NULL là hợp lệ với FK).
ALTER TABLE campaign_shares
  ALTER COLUMN id_recipient DROP NOT NULL;

-- 2) Cột status với 3 giá trị.
ALTER TABLE campaign_shares
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'revoked'));

-- Backfill: mọi share hiện tại có id_recipient NOT NULL → đã claim từ trước, status='active'
-- (DEFAULT 'active' đã làm điều này; chỉ để an toàn khi cột thêm vào bảng có dữ liệu cũ).
UPDATE campaign_shares
   SET status = 'active'
 WHERE id_recipient IS NOT NULL
   AND status IS DISTINCT FROM 'active';

-- 3) Index cho auto-claim: WHERE id_recipient IS NULL AND status='pending'
--    LOWER(recipient_email) để dedup chữ hoa/thường.
CREATE INDEX IF NOT EXISTS idx_campaign_shares_pending_email
  ON campaign_shares (lower(recipient_email))
  WHERE id_recipient IS NULL AND status = 'pending';

COMMIT;
