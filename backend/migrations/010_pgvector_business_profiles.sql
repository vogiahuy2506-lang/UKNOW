-- Migration 010: pgvector - Business Profile Embeddings
-- Mục đích: Lưu hồ sơ doanh nghiệp của từng user_admin và embedding vectors
-- phục vụ RAG Pipeline cho AI Assistant tạo landing page / campaign.
--
-- Yêu cầu: PostgreSQL với extension pgvector đã được cài đặt.
-- Cài: https://github.com/pgvector/pgvector

BEGIN;

-- 1. Bật extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Bảng hồ sơ doanh nghiệp có cấu trúc (1 user_admin = 1 hồ sơ)
CREATE TABLE IF NOT EXISTS business_profiles (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name    VARCHAR(255),
  industry        VARCHAR(100),
  products        TEXT,
  target_audience TEXT,
  tone            VARCHAR(50) DEFAULT 'professional',
  brand_color     VARCHAR(7),
  extra_context   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_business_profile_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles(user_id);

-- 3. Bảng chunks + embeddings phục vụ RAG (nhiều chunks / user)
--    Mỗi chunk là 1 đoạn text từ hồ sơ doanh nghiệp đã được embed thành vector 768 chiều
--    (Gemini text-embedding-004 mặc định 768 dimensions)
CREATE TABLE IF NOT EXISTS business_profile_chunks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  embedding   vector(768),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpc_user ON business_profile_chunks(user_id);

-- IVFFlat index cho cosine similarity search (lists=10 phù hợp cho dữ liệu nhỏ-vừa)
CREATE INDEX IF NOT EXISTS idx_bpc_embedding
  ON business_profile_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

COMMIT;
