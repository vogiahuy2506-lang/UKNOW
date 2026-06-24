-- Migration 074: Gỡ cột chết ai_credits_per_period (đã rename → ai_tokens_per_period ở migration 064/068)

BEGIN;

ALTER TABLE plans DROP COLUMN IF EXISTS ai_credits_per_period;

COMMIT;
