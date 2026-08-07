-- Migration 114: owner-configurable AI handoff auto-resume timeout
-- NULL = off (manual resume only). Allowed: 5, 15, 30, 60 minutes.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_handoff_auto_resume_minutes INTEGER;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_ai_handoff_auto_resume_minutes_allowed;

ALTER TABLE users
  ADD CONSTRAINT users_ai_handoff_auto_resume_minutes_allowed CHECK (
    ai_handoff_auto_resume_minutes IS NULL
    OR ai_handoff_auto_resume_minutes IN (5, 15, 30, 60)
  );

COMMENT ON COLUMN users.ai_handoff_auto_resume_minutes IS
  'Phút tự bật lại AI sau handoff (kể từ ai_paused_at). NULL = tắt, phải bật tay. Áp dụng mọi chatbot/kênh.';

COMMIT;
