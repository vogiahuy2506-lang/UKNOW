-- Migration: 089 — customer_journey.created_at cần DEFAULT NOW().
--
-- Migration 087 thêm cột created_at rồi SET NOT NULL nhưng KHÔNG đặt DEFAULT.
-- Toàn bộ 11 câu INSERT vào customer_journey trong codebase chỉ set event_at,
-- không set created_at → mọi insert (zalo_sent, email_sent, purchase, tracking
-- mở/click, founderai sync...) vi phạm NOT NULL và ném lỗ
-- 'null value in column "created_at"'.
--
-- Triệu chứng thực tế: tin Zalo nhóm GỬI THÀNH CÔNG nhưng bước ghi journey sau
-- khi gửi crash → lần gửi bị đánh dấu failed → chiến dịch tự dừng.
--
-- Fix tận gốc: đặt DEFAULT NOW() để mọi insert tự điền, không cần sửa từng câu
-- lệnh. Các insert đang dùng event_at = CURRENT_TIMESTAMP nên created_at mặc
-- định NOW() trùng đúng thời điểm — không lệch dữ liệu.

ALTER TABLE customer_journey
  ALTER COLUMN created_at SET DEFAULT NOW();
