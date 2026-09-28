-- Migration 258: admin_menu_layouts.links — link ngoài (YouTube/link bất kỳ) super admin chèn
-- vào menu khách /app, mỗi link là một "tab" đặc biệt có key dạng link-<chuỗi> nằm trong itemKeys
-- của một chuyên mục như mọi tab khác (PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28).
--
-- Chỉ scope 'app_user' dùng cột này; scope 'super_admin' luôn giữ mảng rỗng mặc định.
-- ADD COLUMN IF NOT EXISTS + DO-block bọc ADD CONSTRAINT để idempotent khi lỡ chạy lại.

ALTER TABLE admin_menu_layouts ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_menu_layouts_links_array_check'
  ) THEN
    ALTER TABLE admin_menu_layouts ADD CONSTRAINT admin_menu_layouts_links_array_check
      CHECK (jsonb_typeof(links) = 'array');
  END IF;
END $$;
