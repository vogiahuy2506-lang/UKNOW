-- Migration 241: Thêm cột actor_user_id vào email_messages và zalo_messages,
-- và tạo index phục vụ truy vấn hạn mức nhân viên.
-- LƯU Ý VẬN HÀNH: Tách riêng DDL để transaction kết thúc ngay sau ALTER TABLE,
-- tránh giữ khoá ACCESS EXCLUSIVE trên email_messages/zalo_messages suốt quá trình backfill.

ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE zalo_messages  ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_owner_actor_sent ON email_messages(workspace_owner_id, actor_user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_owner_actor_sent  ON zalo_messages(workspace_owner_id, actor_user_id, sent_at);
