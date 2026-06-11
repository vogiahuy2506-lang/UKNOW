-- Migration 057: Create missing knowledge base tables
-- These tables may not exist in all environments

BEGIN;

-- Create knowledge_bases table if it doesn't exist
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user ON knowledge_bases(id_user);

-- Create kb_documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS kb_documents (
  id            BIGSERIAL PRIMARY KEY,
  id_kb         BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(500),
  source_url    TEXT,
  source_type   VARCHAR(50),
  status        VARCHAR(20) DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_kb ON kb_documents(id_kb);
CREATE INDEX IF NOT EXISTS idx_kb_documents_user ON kb_documents(id_user);

-- Create kb_chunks table if it doesn't exist
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
CREATE INDEX IF NOT EXISTS idx_kb_chunks_document ON kb_chunks(id_document);

COMMIT;
