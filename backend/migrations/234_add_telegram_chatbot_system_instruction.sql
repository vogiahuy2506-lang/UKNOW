-- Migration: add_chatbot_system_instruction_to_telegram_chatbot_settings
--
-- Context (Bug 22/09 — full Zalo parity): Zalo cá nhân đã có fallback
-- chain `accountSettings.chatbot_system_instruction` →
-- `chatbotSettings.system_instruction`. Telegram thì không — bảng
-- `telegram_chatbot_settings` không carry `custom_chatbots.system_instruction`
-- theo per-(account, chatbot), nên pipeline không thể fallback đúng.
--
-- Sau migration này:
--   - Cột `chatbot_system_instruction` được snap từ `custom_chatbots.system_instruction`
--     tại thời điểm user bật chatbot cho account (DeployTab UI) hoặc qua
--     trigger tự động dưới đây.
--   - Khi AI chạy (`internal.routes.js`), repo sẽ JOIN cột này và merge
--     giống Zalo: `accountSettings.chatbot_system_instruction` đè lên
--     `chatbot_settings.system_instruction` nếu cái sau trống.
--
-- Forward path: cột này sẽ được populate đúng từ DeployTab UI (sửa JS
-- sau migration). Backfill ở đây chỉ là best-effort cho user đã bật
-- chatbot cho Telegram trước fix.

ALTER TABLE telegram_chatbot_settings
  ADD COLUMN IF NOT EXISTS chatbot_system_instruction TEXT;

-- Backfill: copy `custom_chatbots.system_instruction` cho mọi row
-- hiện tại (cả row đã enabled và chưa). Idempotent — chỉ fill khi cột
-- trống. Nếu user đã edit ở chỗ khác thì KHÔNG ghi đè (giữ nguyên giá
-- trị đã có để tránh clobber).
UPDATE telegram_chatbot_settings tcs
   SET chatbot_system_instruction = cb.system_instruction
  FROM custom_chatbots cb
 WHERE cb.id = tcs.id_chatbot
   AND cb.system_instruction IS NOT NULL
   AND NULLIF(BTRIM(cb.system_instruction), '') IS NOT NULL
   AND (tcs.chatbot_system_instruction IS NULL
        OR NULLIF(BTRIM(tcs.chatbot_system_instruction), '') IS NULL);

-- Down migration:
-- ALTER TABLE telegram_chatbot_settings DROP COLUMN IF EXISTS chatbot_system_instruction;
