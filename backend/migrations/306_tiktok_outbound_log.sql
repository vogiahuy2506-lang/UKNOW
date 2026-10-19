-- Migration 306: bảng tiktok_outbound_log để audit rate limit 10/48h (Bẫy 3 plan).
-- Pattern copy từ các bảng audit khác (email_log, notification_log, ...). Mỗi row = 1 tin
-- bot gửi tới user qua TikTok Business Messaging API. Dùng cho:
--   1. Fallback khi Redis miss/fail (count trong 48h gần nhất)
--   2. Audit cross-check (so sánh Redis count vs SQL count phát hiện race condition)
--   3. Cron nightly xoá log cũ > 7 ngày (tiktokRateLimit.service.js:cleanupOldLogs)
--
-- Khác với bảng `chatbot_messages` (lưu NỘI DUNG tin nhắn UKNOW ↔ user), bảng này chỉ
-- lưu metadata (who, when, conversation) — KHÔNG lưu body để tránh PII + giảm volume.

CREATE TABLE IF NOT EXISTS tiktok_outbound_log (
  id BIGSERIAL PRIMARY KEY,
  business_id TEXT NOT NULL,            -- tiktok_business_accounts.business_id
  unique_identifier TEXT NOT NULL,      -- user open_id từ webhook
  conversation_id TEXT NOT NULL,        -- để trace
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho count 48h theo (business, user) — pattern tối ưu cho rate limit query
CREATE INDEX IF NOT EXISTS idx_tiktok_outbound_log_business_user_recent
  ON tiktok_outbound_log (business_id, unique_identifier, sent_at DESC);

-- Index cho cron cleanup
CREATE INDEX IF NOT EXISTS idx_tiktok_outbound_log_sent_at
  ON tiktok_outbound_log (sent_at);
