-- Migration: Optimize KB performance indexes
-- 1. Composite indexes for RAG queries
-- 2. Optimize IVFFlat index for better recall
-- 3. Partial indexes for active documents

BEGIN;

-- Composite index cho RAG search (user + kb thường dùng cùng nhau)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_user_kb
  ON kb_chunks(id_user, id_kb);

-- Index cho document lookup nhanh (chỉ đánh index docs đang ready)
CREATE INDEX IF NOT EXISTS idx_kb_documents_kb_status
  ON kb_documents(id_kb, status)
  WHERE status = 'ready';

-- Index cho document status tracking
CREATE INDEX IF NOT EXISTS idx_kb_documents_status_user
  ON kb_documents(status, id_user);

-- Index cho conversation lookups (chatbot)
CREATE INDEX IF NOT EXISTS idx_webchat_messages_conv_created
  ON webchat_messages(id_conversation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_messages_conv_created
  ON channel_messages(id_conversation, created_at DESC);

-- Index cho chatbot_settings lookup (user + channel)
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_user_channel
  ON chatbot_settings(id_user, channel);

-- Index cho sub_assistant lookup
CREATE INDEX IF NOT EXISTS idx_sub_assistants_user_active
  ON sub_assistants(id_user)
  WHERE is_active = true;

-- Index cho business_profile_chunks (vector search)
CREATE INDEX IF NOT EXISTS idx_business_profile_chunks_user
  ON business_profile_chunks(user_id);

CREATE INDEX IF NOT EXISTS idx_business_profile_chunks_embedding
  ON business_profile_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Analyze tables để update statistics (giúp query planner đưa ra plan tốt hơn)
ANALYZE kb_chunks;
ANALYZE kb_documents;
ANALYZE knowledge_bases;
ANALYZE webchat_messages;
ANALYZE channel_messages;
ANALYZE chatbot_settings;
ANALYZE business_profile_chunks;

COMMIT;
