-- Migration 189: Thêm mốc thời gian chấm dứt tài khoản (deleted_at) phục vụ chính sách lưu trữ dữ liệu (PR-N4)

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;
