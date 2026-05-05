-- Migration 009: Đổi verification_codes.code từ VARCHAR(6) sang TEXT
-- Cần thiết để lưu invitation token (64 ký tự hex) và password reset token

ALTER TABLE verification_codes ALTER COLUMN code TYPE TEXT;
