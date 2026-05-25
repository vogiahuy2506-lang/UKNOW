-- AI Chat Sessions: lưu lịch sử hội thoại per-user để giữ qua reload và quản lý nhiều session
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user ON ai_chat_sessions(id_user, updated_at DESC);

-- AI Chat Messages: mỗi lượt user/assistant trong 1 session
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id             BIGSERIAL PRIMARY KEY,
  session_id     BIGINT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content        TEXT NOT NULL DEFAULT '',
  type           VARCHAR(50),
  data           JSONB,
  missing_fields JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session ON ai_chat_messages(session_id, id ASC);
