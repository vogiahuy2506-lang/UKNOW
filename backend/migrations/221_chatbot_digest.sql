-- Migration 221: Tùy chọn tần suất nhận thư tổng hợp hoạt động chatbot và bảng lưu lịch sử gửi
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS chatbot_digest_frequency VARCHAR(10) NOT NULL DEFAULT 'weekly'
    CHECK (chatbot_digest_frequency IN ('none', 'weekly', 'monthly'));

CREATE TABLE IF NOT EXISTS chatbot_digest_log (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key    VARCHAR(16) NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  stats         JSONB NOT NULL DEFAULT '{}',
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chatbot_digest_user_period UNIQUE (id_user, period_key)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_digest_log_user ON chatbot_digest_log(id_user);
