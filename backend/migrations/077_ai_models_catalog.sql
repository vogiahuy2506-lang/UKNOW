-- Dynamic Gemini model catalog.

CREATE TABLE IF NOT EXISTS ai_models (
  model_id                  TEXT PRIMARY KEY,
  display_name              TEXT NOT NULL,
  tier_rank                 INTEGER NOT NULL DEFAULT 100,
  is_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  supports_generate_content BOOLEAN NOT NULL DEFAULT TRUE,
  source                    TEXT NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('google', 'manual')),
  last_seen_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_models_enabled_rank
  ON ai_models (is_enabled, tier_rank, model_id);

INSERT INTO ai_models
  (model_id, display_name, tier_rank, is_enabled, supports_generate_content, source, last_seen_at)
VALUES
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 10, TRUE, TRUE, 'manual', NOW()),
  ('gemini-2.5-flash',      'Gemini 2.5 Flash',      20, TRUE, TRUE, 'manual', NOW()),
  ('gemini-2.5-pro',        'Gemini 2.5 Pro',        30, TRUE, TRUE, 'manual', NOW())
ON CONFLICT (model_id) DO UPDATE SET
  display_name = COALESCE(NULLIF(ai_models.display_name, ''), EXCLUDED.display_name),
  tier_rank = CASE
    WHEN ai_models.tier_rank IS NULL OR ai_models.tier_rank = 100 THEN EXCLUDED.tier_rank
    ELSE ai_models.tier_rank
  END,
  supports_generate_content = TRUE,
  updated_at = NOW();

COMMENT ON TABLE ai_models IS 'Catalog động các model Gemini, sync từ Google và quản trị bật/tắt theo toàn hệ thống.';
COMMENT ON COLUMN ai_models.tier_rank IS 'Thứ tự tier thấp đến cao; plan chọn model tối đa theo rank.';
COMMENT ON COLUMN ai_models.is_enabled IS 'TRUE nếu model được phép dùng trong app.';
