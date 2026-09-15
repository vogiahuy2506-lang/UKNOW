-- Migration 224: Khung giờ chatbot được phép trả lời (active_hours)
-- Lưu dạng JSONB: { start: "HH:MM", end: "HH:MM", outsideAction: "silent" | "message", outsideMessage: "..." }
-- NULL = trả lời 24/7 (mặc định)

ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS active_hours JSONB DEFAULT NULL;

ALTER TABLE custom_chatbots
  DROP CONSTRAINT IF EXISTS check_custom_chatbots_active_hours_object;

ALTER TABLE custom_chatbots
  ADD CONSTRAINT check_custom_chatbots_active_hours_object
  CHECK (active_hours IS NULL OR jsonb_typeof(active_hours) = 'object');
