-- Migration: Add system_instruction to chatbot_settings
-- Purpose: Allow custom system prompt for chatbot

ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS system_instruction TEXT;

ALTER TABLE chatbot_zalo_account_settings 
ADD COLUMN IF NOT EXISTS system_instruction TEXT;
