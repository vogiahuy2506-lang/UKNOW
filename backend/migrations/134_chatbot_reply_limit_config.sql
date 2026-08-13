BEGIN;

ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS reply_limit_config JSONB NOT NULL DEFAULT '{"version":1,"windows":{}}'::jsonb;

ALTER TABLE custom_chatbots
  DROP CONSTRAINT IF EXISTS custom_chatbots_reply_limit_config_object;

ALTER TABLE custom_chatbots
  ADD CONSTRAINT custom_chatbots_reply_limit_config_object
  CHECK (jsonb_typeof(reply_limit_config) = 'object');

-- Preserve the previous owner-wide daily cap as a per-chatbot daily rule.
UPDATE custom_chatbots cc
SET reply_limit_config = jsonb_build_object(
  'version', 1,
  'windows', jsonb_build_object(
    'day', jsonb_build_object(
      'limit', u.bot_daily_reply_cap,
      'action', 'notify',
      'message', 'Trợ lý đã đạt giới hạn trả lời hôm nay. Bạn vui lòng quay lại sau.'
    )
  )
)
FROM users u
WHERE u.id = cc.id_user
  AND u.bot_daily_reply_cap IS NOT NULL
  AND COALESCE(cc.reply_limit_config->'windows', '{}'::jsonb) = '{}'::jsonb;

COMMENT ON COLUMN custom_chatbots.reply_limit_config IS
  'Per-chatbot aggregate AI reply limits for minute/hour/day/month and silent/notify behavior.';

COMMIT;
