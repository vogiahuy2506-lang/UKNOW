-- Migration 006: Add is_custom flag to plans
-- is_custom = true  → gói riêng tạo cho 1 doanh nghiệp cụ thể, ẩn khỏi trang pricing
-- is_custom = false → gói đại trà, hiển thị công khai

ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;

-- Make code nullable (custom plans don't have a public code)
ALTER TABLE plans ALTER COLUMN code DROP NOT NULL;
