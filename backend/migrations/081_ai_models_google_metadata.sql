-- Replace opaque tier_rank with Google ListModels metadata for plan gating.
-- Catalog rows are populated by sync (scheduler / admin), not hardcoded model IDs.

BEGIN;

ALTER TABLE ai_models
  ADD COLUMN IF NOT EXISTS input_token_limit INTEGER,
  ADD COLUMN IF NOT EXISTS output_token_limit INTEGER,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS thinking BOOLEAN;

-- One-time backfill for rows created before sync metadata existed.
UPDATE ai_models
SET
  input_token_limit = COALESCE(input_token_limit, 1048576),
  output_token_limit = COALESCE(
    output_token_limit,
    CASE tier_rank
      WHEN 10 THEN 8192
      WHEN 20 THEN 65536
      WHEN 30 THEN 65536
      ELSE 8192
    END
  )
WHERE input_token_limit IS NULL OR output_token_limit IS NULL;

DROP INDEX IF EXISTS idx_ai_models_enabled_rank;

ALTER TABLE ai_models DROP COLUMN IF EXISTS tier_rank;

CREATE INDEX IF NOT EXISTS idx_ai_models_enabled_output
  ON ai_models (is_enabled, supports_generate_content, output_token_limit, model_id);

COMMENT ON COLUMN ai_models.input_token_limit IS 'Max input/context tokens from Google ListModels.';
COMMENT ON COLUMN ai_models.output_token_limit IS 'Max output tokens from Google ListModels; used for plan capability gating.';
COMMENT ON COLUMN ai_models.thinking IS 'TRUE when Google reports a thinking/reasoning model.';
COMMENT ON TABLE ai_models IS 'Gemini catalog synced from Google; admin enables models for production use.';

COMMIT;
