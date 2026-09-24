-- Migration 243: Thêm cột is_fallback cho model dự phòng do super admin chọn
-- Mỗi thời điểm có tối đa 1 model dự phòng (hoặc không có model nào)

ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- Tối đa MỘT model dự phòng
CREATE UNIQUE INDEX IF NOT EXISTS ai_models_one_fallback ON ai_models ((is_fallback)) WHERE is_fallback;
