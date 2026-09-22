-- Migration: backfill_telegram_personal_chatbot_settings
--
-- Context (Bug 22/09): frontend ChatbotConfigModal.ALL_CHANNELS trước
-- đây không có 'telegram_personal' → khi user lưu chatbot qua Studio thì
-- `chatbot_settings` không có row `channel='telegram_personal'` →
-- Telegram pipeline đọc `getSettings(userId, 'telegram_personal')` trả
-- null → AI không thấy system_instruction đã cấu hình.
--
-- Sau khi frontend thêm 'telegram_personal' vào ALL_CHANNELS, mọi lần
-- save tới sẽ upsert row mới. Migration này backfill cho user ĐÃ lưu
-- trước đó (custom_chatbots.system_instruction đã có nhưng chưa được
-- mirror sang chatbot_settings).
--
-- Semantics: CHỈ copy khi row chatbot_settings.channel='telegram_personal'
-- CHƯA TỒN TẠI hoặc system_instruction của nó đang NULL/rỗng. Không
-- ghi đè dữ liệu đã có (user có thể đã cấu hình riêng).

INSERT INTO chatbot_settings (
  id_user,
  channel,
  id_sub_assistant,
  is_enabled,
  welcome_message,
  ai_model,
  temperature,
  max_tokens,
  response_style,
  system_instruction,
  settings
)
SELECT
  cb.id_user,
  'telegram_personal' AS channel,
  cb.id_sub_assistant,
  cb.is_active AS is_enabled,
  cb.welcome_message,
  cb.ai_model,
  cb.temperature,
  cb.max_tokens,
  cb.response_style,
  cb.system_instruction,
  '{}'::jsonb AS settings
FROM custom_chatbots cb
WHERE cb.is_active = true
  AND cb.system_instruction IS NOT NULL
  AND NULLIF(BTRIM(cb.system_instruction), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chatbot_settings cs
    WHERE cs.id_user = cb.id_user
      AND cs.channel = 'telegram_personal'
      AND cs.system_instruction IS NOT NULL
      AND NULLIF(BTRIM(cs.system_instruction), '') IS NOT NULL
  )
ON CONFLICT (id_user, channel) DO NOTHING;

-- Down migration (rollback): xóa các row do migration này tạo ra.
-- Cẩn thận: chỉ xóa row có system_instruction GIỐNG custom_chatbots
-- để tránh xóa nhầm dữ liệu user đã sửa sau khi migration chạy.
-- (Best-effort: dùng updated_at gần đây để xác định row do migration.)
