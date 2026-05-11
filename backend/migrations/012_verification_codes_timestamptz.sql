-- Migration 012: Đổi expires_at và created_at trong verification_codes từ TIMESTAMP → TIMESTAMPTZ
-- Lý do: TIMESTAMP WITHOUT TIME ZONE gây lỗi "hết hạn ngay lập tức" khi session timezone
-- không được áp dụng nhất quán (async pool connect handler là fire-and-forget).
-- TIMESTAMPTZ lưu UTC tuyệt đối, so sánh luôn chính xác bất kể timezone session.

ALTER TABLE verification_codes
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ
    USING expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE verification_codes
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
