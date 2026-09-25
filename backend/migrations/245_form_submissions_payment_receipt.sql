-- Migration 245: Thêm các cột lưu biên lai chuyển khoản vào bảng form_submissions (PR-5)
-- Bắt buộc ảnh chuyển khoản trước khi bấm "Tôi xác nhận đã chuyển khoản"

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS payment_receipt_key TEXT;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS payment_receipt_uploaded_at TIMESTAMPTZ;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS payment_receipt_waived_reason VARCHAR(40);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS payment_receipt_upload_count SMALLINT NOT NULL DEFAULT 0;
