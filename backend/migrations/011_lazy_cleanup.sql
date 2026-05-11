-- Migration 011: Chuyển toàn bộ lazy migrations từ index.js vào đây
-- Tất cả dùng IF NOT EXISTS nên an toàn khi chạy trên DB mới hoặc cũ.

-- campaign_customers: cột uknow_status
ALTER TABLE campaign_customers
  ADD COLUMN IF NOT EXISTS uknow_status VARCHAR(20) DEFAULT NULL;

-- verification_codes: tạo bảng nếu chưa có
-- code dùng TEXT (theo migration 009 đã đổi từ VARCHAR(6))
CREATE TABLE IF NOT EXISTS verification_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(255) NOT NULL,
  code       TEXT NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'email_verification',
  expires_at TIMESTAMP NOT NULL,
  is_used    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id    UUID
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email   ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- users: cột is_verified và verified_at
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMP;
