-- Migration 247: Tạo chatbot_shares (PR-3) — cho phép share chatbot với email ngoài hệ thống.
--
-- PR-3 đổi semantics share chatbot từ "clone ngay khi bấm" sang "share pending + clone khi user
-- đăng ký". Lý do: chatbot share dùng cơ chế clone toàn bộ (config + chunks + embedding) nên
-- không thể clone cho email chưa có user. Pattern mới giống landing_page_shares / campaign_shares:
--   - id_recipient NULL + status='pending' → share cho email ngoài, chờ user đăng ký.
--   - id_recipient NOT NULL + status='active' → user đã có tài khoản, clone ngay.
--   - Auto-claim khi user vừa đăng ký: trigger service tự clone + gửi mail thông báo.
--
--   - Auto-claim khi user vừa đăng ký: trigger service tự clone + gửi mail thông báo.
--
-- Lưu ý: bảng này không nhân bản chatbot — chỉ là "lời mời" lưu trong DB. Clone thật sự xảy
-- ra khi claim (auth.controller auto-claim) hoặc khi service gọi clone từ pending.
--
-- Bảng này ĐÃ có thể tồn tại từ trước ở phiên bản cũ (thiếu status, kiểu cột INTEGER), nên toàn
-- bộ thao tác bên dưới phải idempotent. Chi tiết ở comment sát phần ALTER.

-- Bảng này ĐÃ có thể tồn tại từ trước: commit 153af8c9 (marketplace redesign) tạo
-- chatbot_shares với cột `share_type` và kiểu cột INTEGER, chưa có `status`. Vì vậy KHÔNG
-- dùng CREATE TABLE ở đây — mọi thao tác phải idempotent để chạy được trên cả DB mới
-- (bảng chưa tồn tại) lẫn DB cũ (bảng đã có share_type). Pattern đúng theo migration 245.
--
-- `share_type` (view/edit) và `status` (pending/active/revoked) là hai trục độc lập, cùng tồn
-- tại trên landing_page_shares / campaign_shares — nên giữ nguyên share_type, chỉ thêm status.

BEGIN;

-- 1) Tạo bảng nếu chưa có. Dùng IF NOT EXISTS + đầy đủ cột status để lần chạy đầu (DB mới)
--    cho ra đúng schema mà các index bên dưới cần.
CREATE TABLE IF NOT EXISTS chatbot_shares (
  id              BIGSERIAL PRIMARY KEY,
  id_chatbot      BIGINT       NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  id_owner        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_recipient    BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'revoked')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2) Bảng đã tồn tại (DB cũ) thì bổ sung cột status — đây là phần thực sự cần cho
--    migration này. IF NOT EXISTS + NOT NULL DEFAULT: PostgreSQL điền 'active' cho dòng cũ
--    ngay trong lúc ALTER, nên không có cửa sổ để cột tồn tại với NULL.
ALTER TABLE chatbot_shares
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'revoked'));

-- 3) Backfill tường minh: mọi share có id_recipient NOT NULL đã được claim từ trước nên
--    status='active'. Chỉ share cho email ngoài hệ thống (id_recipient NULL) mới là 'pending'.
UPDATE chatbot_shares
   SET status = 'active'
 WHERE id_recipient IS NOT NULL
   AND status IS DISTINCT FROM 'active';

-- Index cho các truy vấn thường gặp:
--   - list share của 1 chatbot (owner xem danh sách)
--   - auto-claim WHERE id_recipient IS NULL AND status='pending' AND LOWER(recipient_email)=...
-- Tạo SAU khi cột status đã tồn tại — index partial tham chiếu status sẽ fail nếu tạo trước.
CREATE INDEX IF NOT EXISTS idx_chatbot_shares_chatbot
  ON chatbot_shares(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_chatbot_shares_recipient
  ON chatbot_shares(id_recipient);
CREATE INDEX IF NOT EXISTS idx_chatbot_shares_owner
  ON chatbot_shares(id_owner);
CREATE INDEX IF NOT EXISTS idx_chatbot_shares_pending_email
  ON chatbot_shares (lower(recipient_email))
  WHERE id_recipient IS NULL AND status = 'pending';

-- De-dup: cùng (chatbot, recipient) chỉ giữ 1 share active.
-- Với pending (id_recipient NULL) thì dùng partial unique index riêng.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_shares_chatbot_recipient
  ON chatbot_shares(id_chatbot, id_recipient)
  WHERE id_recipient IS NOT NULL;

COMMIT;
