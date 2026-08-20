-- Migration 146: Cache bảng tóm tắt hoạt động AI trong ngày theo user và ngày

CREATE TABLE IF NOT EXISTS ai_activity_summaries (
  id BIGSERIAL PRIMARY KEY,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key VARCHAR(10) NOT NULL,
  last_message_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_ai_activity_user_day UNIQUE (id_user, day_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_activity_summaries_user_day
  ON ai_activity_summaries (id_user, day_key);
