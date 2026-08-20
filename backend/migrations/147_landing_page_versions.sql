-- Migration 147: Lưu lịch sử phiên bản landing page (file HTML lưu trên GCS, DB giữ con trỏ)

CREATE TABLE IF NOT EXISTS landing_page_versions (
  id BIGSERIAL PRIMARY KEY,
  id_landing_page BIGINT NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  title VARCHAR(255),
  html_hash VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_page_created
  ON landing_page_versions (id_landing_page, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_user
  ON landing_page_versions (id_user);
