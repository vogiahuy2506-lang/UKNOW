-- Migration 029: Chatbot Knowledge Base & Sub-Assistant Infrastructure
-- Mục đích: Train Your AI (Knowledge Base), Web Chat Widget, Zalo OA / Facebook webhooks.
--
-- Yêu cầu: PostgreSQL với extension pgvector đã được cài (migration 010).

BEGIN;

-- 1. Sub-assistants (con bot con)
CREATE TABLE IF NOT EXISTS sub_assistants (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  avatar_url      TEXT,
  greeting_msg    TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  is_active       BOOLEAN DEFAULT true,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_assistants_user ON sub_assistants(id_user);

-- 2. Knowledge Bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  is_active        BOOLEAN DEFAULT true,
  chunking_mode    VARCHAR(20) DEFAULT 'paragraph',
  chunk_size       INTEGER DEFAULT 500,
  embedding_model  VARCHAR(50) DEFAULT 'gemini-embedding-004',
  settings         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_bases(id_user);
CREATE INDEX IF NOT EXISTS idx_kb_sub ON knowledge_bases(id_sub_assistant);

-- 3. KB Documents (uploaded files + manual entries)
CREATE TABLE IF NOT EXISTS kb_documents (
  id             BIGSERIAL PRIMARY KEY,
  id_kb          BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  id_user        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(500),
  source_type    VARCHAR(20) NOT NULL, -- 'file' | 'url' | 'text'
  source_url     TEXT,
  content_text   TEXT,
  file_name      VARCHAR(500),
  file_size      BIGINT,
  mime_type      VARCHAR(100),
  status         VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'processing' | 'ready' | 'error'
  error_message  TEXT,
  chunk_count    INTEGER DEFAULT 0,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_doc_kb ON kb_documents(id_kb);
CREATE INDEX IF NOT EXISTS idx_kb_doc_user ON kb_documents(id_user);
CREATE INDEX IF NOT EXISTS idx_kb_doc_status ON kb_documents(status);

-- 4. KB Chunks (vector embeddings)
CREATE TABLE IF NOT EXISTS kb_chunks (
  id            BIGSERIAL PRIMARY KEY,
  id_document   BIGINT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  id_kb         BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text    TEXT NOT NULL,
  embedding     vector(768),
  chunk_index   INTEGER,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON kb_chunks(id_kb);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_user ON kb_chunks(id_user);

-- IVFFlat index cho cosine similarity search
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON kb_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

-- 5. Chatbot Settings (per user, per channel)
CREATE TABLE IF NOT EXISTS chatbot_settings (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  channel          VARCHAR(20) NOT NULL, -- 'web' | 'zalo_oa' | 'facebook' | 'zalo_personal'
  is_enabled       BOOLEAN DEFAULT true,
  welcome_message  TEXT,
  ai_model         VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  temperature      DECIMAL(3,2) DEFAULT 0.7,
  max_tokens       INTEGER DEFAULT 2048,
  response_style   VARCHAR(20) DEFAULT 'friendly', -- 'friendly' | 'professional' | 'casual'
  settings         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chatbot_user_channel UNIQUE (id_user, channel)
);

-- 6. Channel Connections (Zalo OA, Facebook Page)
CREATE TABLE IF NOT EXISTS channel_connections (
  id           BIGSERIAL PRIMARY KEY,
  id_user      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      VARCHAR(20) NOT NULL, -- 'zalo_oa' | 'facebook' | 'zalo_personal'
  display_name VARCHAR(255),
  is_active    BOOLEAN DEFAULT true,
  credentials  JSONB DEFAULT '{}',
  webhook_url  TEXT,
  settings     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_channel_user_channel UNIQUE (id_user, channel)
);

CREATE INDEX IF NOT EXISTS idx_channel_conn_user ON channel_connections(id_user);
CREATE INDEX IF NOT EXISTS idx_channel_conn_channel ON channel_connections(channel);

-- 7. Web Widget Config
CREATE TABLE IF NOT EXISTS web_widget_configs (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  widget_key       VARCHAR(100) UNIQUE NOT NULL,
  display_name     VARCHAR(255),
  theme_color      VARCHAR(7) DEFAULT '#3B82F6',
  position         VARCHAR(20) DEFAULT 'bottom-right',
  welcome_message  TEXT,
  is_active        BOOLEAN DEFAULT true,
  allowed_domains  TEXT[],
  settings         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widget_user ON web_widget_configs(id_user);
CREATE INDEX IF NOT EXISTS idx_widget_key ON web_widget_configs(widget_key);

-- 8. Web Chat Conversations
CREATE TABLE IF NOT EXISTS webchat_conversations (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_widget_config BIGINT NOT NULL REFERENCES web_widget_configs(id) ON DELETE CASCADE,
  session_id       VARCHAR(100),
  visitor_name     VARCHAR(255),
  visitor_email    VARCHAR(255),
  visitor_info     JSONB DEFAULT '{}',
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_message_at  TIMESTAMPTZ DEFAULT NOW(),
  status           VARCHAR(20) DEFAULT 'active',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webchat_conv_user ON webchat_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_webchat_conv_widget ON webchat_conversations(id_widget_config);
CREATE INDEX IF NOT EXISTS idx_webchat_conv_session ON webchat_conversations(session_id);

-- 9. Web Chat Messages
CREATE TABLE IF NOT EXISTS webchat_messages (
  id              BIGSERIAL PRIMARY KEY,
  id_conversation BIGINT NOT NULL REFERENCES webchat_conversations(id) ON DELETE CASCADE,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL, -- 'visitor' | 'bot' | 'agent'
  content         TEXT NOT NULL,
  attachments     JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webchat_messages_conv ON webchat_messages(id_conversation);

-- 10. Channel Conversations (Zalo OA, Facebook)
CREATE TABLE IF NOT EXISTS channel_conversations (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_channel    BIGINT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  external_id   VARCHAR(255),
  visitor_name  VARCHAR(255),
  visitor_info  JSONB DEFAULT '{}',
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_channel_external_id UNIQUE (id_channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_conv_user ON channel_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_channel_conv_channel ON channel_conversations(id_channel);

-- 11. Channel Messages (Zalo OA, Facebook)
CREATE TABLE IF NOT EXISTS channel_messages (
  id             BIGSERIAL PRIMARY KEY,
  id_conversation BIGINT NOT NULL REFERENCES channel_conversations(id) ON DELETE CASCADE,
  id_user        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_channel     BIGINT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  role           VARCHAR(20) NOT NULL, -- 'visitor' | 'bot' | 'agent'
  content        TEXT NOT NULL,
  message_type   VARCHAR(20) DEFAULT 'text',
  external_id    VARCHAR(255),
  external_ts    TIMESTAMPTZ,
  attachments    JSONB DEFAULT '[]',
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_conv ON channel_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(id_channel);

COMMIT;
