-- Migration 185: Them cot response_style vao custom_chatbots.
--
-- LY DO:
-- custom_chatbots da co temperature, max_tokens, ai_model (migration 040/041)
-- nhung THIEU response_style. Field nay chi ton tai tren chatbot_settings
-- (migration 031, default 'friendly') va chatbot_zalo_account_settings (052).
--
-- Hau qua truoc day: frontend GUI response_style qua PUT
-- /ai/chatbot/custom-chatbots/:id nhung repository updateChatbot KHONG COALESCE
-- cot nay (vi bang khong co cot) -> field bi silent drop khi reload row
-- custom_chatbots -> UI luon fallback 'friendly' ('Thân thiện') bat ke user
-- chon gi trong ChatbotConfigModal. Controller co sync vao chatbot_settings 7
-- channel nhung UI doc lai tu custom_chatbots nen van khong thay.
--
-- THEM: response_style VARCHAR(20) DEFAULT 'friendly' de:
-- 1) Repository co the COALESCE va ghi vao custom_chatbots.
-- 2) GET /custom-chatbots/:id tra ve dung response_style user da chon.
-- 3) UI doc dong bo voi database.

BEGIN;

ALTER TABLE custom_chatbots
ADD COLUMN IF NOT EXISTS response_style VARCHAR(20) DEFAULT 'friendly';

COMMENT ON COLUMN custom_chatbots.response_style IS
  'Phong cach tra loi: friendly | professional | casual | empathetic | concise | creative';

COMMIT;
