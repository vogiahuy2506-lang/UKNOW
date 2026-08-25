-- Migration 173: Thêm các cột theo dõi bounce bất đồng bộ (VERP DSN) và phân loại bounce cho email_messages
-- bounce_type: 'hard' | 'soft'
-- bounce_code: DSN status code, ví dụ '5.1.1', '4.2.2'
-- bounce_detected_via: 'smtp' (đồng bộ khi gọi sendMail) | 'dsn' (bất đồng bộ qua hộp thư bounce)

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bounce_code VARCHAR(15),
  ADD COLUMN IF NOT EXISTS bounce_detected_via VARCHAR(10);
