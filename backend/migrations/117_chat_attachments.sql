-- Media library catalog for durable chat / assistant attachments (uploads/*/chat/).
CREATE TABLE IF NOT EXISTS chat_attachments (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source           VARCHAR(24) NOT NULL
                   CHECK (source IN ('chatbot_web', 'chatbot_studio', 'ai_assistant')),
  storage_key      TEXT NOT NULL UNIQUE,
  display_name     VARCHAR(255),
  mime_type        VARCHAR(120),
  size_bytes       BIGINT,
  conversation_ref VARCHAR(64),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_user
  ON chat_attachments (id_user, created_at DESC);
