-- 100: Help center — tài liệu hệ thống + RAG (không dùng knowledge_bases)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS help_articles (
  id            BIGSERIAL PRIMARY KEY,
  slug          VARCHAR(120) NOT NULL UNIQUE,
  title         VARCHAR(255) NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  body_md       TEXT NOT NULL DEFAULT '',
  feature_key   VARCHAR(80) NOT NULL,
  primary_route VARCHAR(255),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_articles_feature
  ON help_articles (feature_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_help_articles_published
  ON help_articles (is_published) WHERE is_published = TRUE;

CREATE TABLE IF NOT EXISTS help_article_media (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('image', 'video')),
  url         TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_article_media_article
  ON help_article_media (article_id, sort_order);

CREATE TABLE IF NOT EXISTS help_article_chunks (
  id            BIGSERIAL PRIMARY KEY,
  article_id    BIGINT NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content_text  TEXT NOT NULL,
  embedding     vector(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT help_article_chunks_unique UNIQUE (article_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_help_article_chunks_article
  ON help_article_chunks (article_id);

-- IVFFlat: lists thấp vì kho tài liệu hệ thống nhỏ (PR1 ~ vài chục đoạn)
CREATE INDEX IF NOT EXISTS idx_help_article_chunks_embedding
  ON help_article_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

CREATE TABLE IF NOT EXISTS help_unanswered (
  id              BIGSERIAL PRIMARY KEY,
  question        TEXT NOT NULL,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  top_similarity  REAL
);

CREATE INDEX IF NOT EXISTS idx_help_unanswered_asked
  ON help_unanswered (asked_at DESC);

COMMENT ON TABLE help_articles IS 'Tài liệu hướng dẫn hệ thống (shared, không thuộc user).';
COMMENT ON TABLE help_article_chunks IS 'Đoạn nhúng vector(768) — mô phỏng kb_chunks, không dùng JSONB.';
COMMENT ON TABLE help_unanswered IS 'Câu hỏi hướng dẫn chưa có tài liệu — backlog viết bài.';
