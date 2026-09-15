-- Migration 225: forms.landing_page_id (PR-5b-2a) — biết một Biểu mẫu do AI dựng landing tạo ra
-- đang gắn với landing page nào, để lúc lưu landing tái dùng đúng form thay vì đẻ form mồ côi, và
-- phục vụ PR-5b-2b (trợ lý AI chiến dịch hiểu "người đăng ký landing X" = node biểu mẫu của landing đó).

ALTER TABLE forms ADD COLUMN IF NOT EXISTS landing_page_id BIGINT REFERENCES landing_pages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forms_landing_page_id ON forms (landing_page_id)
  WHERE landing_page_id IS NOT NULL;
