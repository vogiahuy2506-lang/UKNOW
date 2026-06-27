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

-- Catalog rows are populated by Google sync (admin UI / scheduler), not seeded here.

COMMENT ON TABLE ai_models IS 'Catalog động các model Gemini, sync từ Google và quản trị bật/tắt theo toàn hệ thống.';
COMMENT ON COLUMN ai_models.tier_rank IS 'Deprecated in 081 — replaced by output_token_limit from Google.';
COMMENT ON COLUMN ai_models.is_enabled IS 'TRUE nếu model được phép dùng trong app.';
