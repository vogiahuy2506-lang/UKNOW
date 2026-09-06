-- Migration 187: Bảng user_consents lưu bằng chứng đồng ý điều khoản & dữ liệu cá nhân (Nghị định 330/2026/NĐ-CP)
-- Bảng chỉ-thêm (append-only), ON DELETE RESTRICT để bảo toàn lịch sử chứng minh.
-- Rút lại đồng ý = INSERT dòng granted = FALSE, không UPDATE, không DELETE.

CREATE TABLE IF NOT EXISTS user_consents (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose          VARCHAR(40)  NOT NULL,   -- 'terms' | 'privacy' | 'dpa' | 'marketing'
  granted          BOOLEAN      NOT NULL,
  document_version VARCHAR(20)  NOT NULL,  -- phiên bản văn bản tại thời điểm đồng ý
  document_hash    CHAR(64),                -- SHA-256 nội dung văn bản
  source           VARCHAR(30)  NOT NULL,   -- 'register' | 'google_register' | 'settings' | ...
  ip_address       VARCHAR(64),
  user_agent       TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_purpose ON user_consents (user_id, purpose, created_at DESC);
