-- Migration 247: Tạo chatbot_shares (PR-3) — cho phép share chatbot với email ngoài hệ thống.
--
-- PR-3 đổi semantics share chatbot từ "clone ngay khi bấm" sang "share pending + clone khi user
-- đăng ký". Lý do: chatbot share dùng cơ chế clone toàn bộ (config + chunks + embedding) nên
-- không thể clone cho email chưa có user. Pattern mới giống landing_page_shares / campaign_shares:
--   - id_recipient NULL + status='pending' → share cho email ngoài, chờ user đăng ký.
--   - id_recipient NOT NULL + status='active' → user đã có tài khoản, clone ngay.
--   - Auto-claim khi user vừa đăng ký: trigger service tự clone + gửi mail thông báo.
--
-- Lưu ý: bảng này không nhân bản chatbot — chỉ là "lời mời" lưu trong DB. Clone thật sự xảy
-- ra khi claim (auth.controller auto-claim) hoặc khi service gọi clone từ pending.

BEGIN;

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

-- Index cho các truy vấn thường gặp:
--   - list share của 1 chatbot (owner xem danh sách)
--   - auto-claim WHERE id_recipient IS NULL AND status='pending' AND LOWER(recipient_email)=...
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
