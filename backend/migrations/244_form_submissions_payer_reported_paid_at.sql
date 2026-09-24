-- Migration 244: Thêm cột payer_reported_paid_at vào bảng form_submissions (PR-2)
-- Lưu thời điểm người đặt bấm "Tôi xác nhận đã chuyển khoản" để gia hạn giữ chỗ và báo chủ form.

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS payer_reported_paid_at TIMESTAMPTZ;
