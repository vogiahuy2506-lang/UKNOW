-- Migration: backfill_whatsapp_baileys_system_instruction
--
-- Context (Bug 22/09 — Zalo parity):
-- WhatsApp Baileys có bảng riêng `chatbot_whatsapp_baileys_settings`
-- với column `system_instruction`. Nếu user tạo chatbot trong Studio
-- (custom_chatbots) nhưng CHƯA bật chatbot cho WhatsApp Baileys session
-- nào thì row chưa tồn tại → `findEnabledChatbots` trả rỗng → AI
-- không trả lời dù chatbot đã cấu hình.
--
-- Fix:
-- - repo `setEnabled`: snap `custom_chatbots.system_instruction` khi
--   user bật chatbot cho session.
-- - Migration này: backfill cho user đã bật TRƯỚC fix (CHỈ khi
--   system_instruction trống, không ghi đè).
--
-- Down:
-- (No down — data backfill is best-effort only.)

UPDATE chatbot_whatsapp_baileys_settings wa
   SET system_instruction = cb.system_instruction,
       updated_at = NOW()
  FROM custom_chatbots cb
 WHERE cb.id = wa.id_chatbot
   AND cb.is_active = true
   AND cb.system_instruction IS NOT NULL
   AND NULLIF(BTRIM(cb.system_instruction), '') IS NOT NULL
   AND (wa.system_instruction IS NULL
        OR NULLIF(BTRIM(wa.system_instruction), '') IS NULL);
