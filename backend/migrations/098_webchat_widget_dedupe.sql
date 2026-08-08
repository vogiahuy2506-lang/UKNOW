-- Migration 098: dedupe auto-created web widgets + merge fragmented webchat sessions
-- Root cause: chatWithCustomChatbotById matched on id_sub_assistant (always miss) and
-- created chatbot_<id>_<timestamp> every message. CASCADE on widget delete — never
-- DELETE widgets before retargeting conversations.

BEGIN;

-- B0. Backfill missing custom_chatbots.widget_key (deterministic embed key)
UPDATE custom_chatbots
SET widget_key = 'chatbot_' || id::text
WHERE widget_key IS NULL OR btrim(widget_key) = '';

-- B1. Ensure each chatbot_* group has a row whose key equals the chatbot's canonical key.
-- Group by chatbot id parsed from widget_key (NOT by id_user — one user may own many bots).
-- If a widget with the canonical key already exists, keep it. Otherwise rename the oldest
-- garbage row in the group (avoids UNIQUE collision on web_widget_configs.widget_key).
WITH groups AS (
  SELECT DISTINCT (regexp_match(widget_key, '^chatbot_([0-9]+)'))[1]::bigint AS chatbot_id
  FROM web_widget_configs
  WHERE widget_key ~ '^chatbot_[0-9]+'
),
canon_keys AS (
  SELECT
    g.chatbot_id,
    COALESCE(NULLIF(btrim(cc.widget_key), ''), 'chatbot_' || g.chatbot_id::text) AS canon_key
  FROM groups g
  LEFT JOIN custom_chatbots cc ON cc.id = g.chatbot_id
),
existing_canon AS (
  SELECT ck.chatbot_id
  FROM canon_keys ck
  JOIN web_widget_configs wc ON wc.widget_key = ck.canon_key
),
oldest_in_group AS (
  SELECT DISTINCT ON ((regexp_match(widget_key, '^chatbot_([0-9]+)'))[1]::bigint)
    (regexp_match(widget_key, '^chatbot_([0-9]+)'))[1]::bigint AS chatbot_id,
    id AS widget_id
  FROM web_widget_configs
  WHERE widget_key ~ '^chatbot_[0-9]+'
  ORDER BY (regexp_match(widget_key, '^chatbot_([0-9]+)'))[1]::bigint,
           created_at ASC NULLS LAST,
           id ASC
),
to_rename AS (
  SELECT o.widget_id, ck.canon_key
  FROM oldest_in_group o
  JOIN canon_keys ck ON ck.chatbot_id = o.chatbot_id
  WHERE NOT EXISTS (
    SELECT 1 FROM existing_canon e WHERE e.chatbot_id = o.chatbot_id
  )
)
UPDATE web_widget_configs wc
SET widget_key = tr.canon_key,
    updated_at = NOW()
FROM to_rename tr
WHERE wc.id = tr.widget_id
  AND wc.widget_key IS DISTINCT FROM tr.canon_key;

-- B2. Point conversations at the canonical widget for each chatbot_* group
UPDATE webchat_conversations wconv
SET id_widget_config = map.canon_id
FROM (
  SELECT g.id AS garbage_id, c.id AS canon_id
  FROM web_widget_configs g
  JOIN custom_chatbots cc
    ON cc.id = (regexp_match(g.widget_key, '^chatbot_([0-9]+)'))[1]::bigint
  JOIN web_widget_configs c
    ON c.widget_key = COALESCE(NULLIF(btrim(cc.widget_key), ''), 'chatbot_' || cc.id::text)
  WHERE g.widget_key ~ '^chatbot_[0-9]+'
    AND g.id <> c.id
) map
WHERE wconv.id_widget_config = map.garbage_id;

-- B3. Merge duplicate active sessions on the same widget (keep oldest)
WITH dups AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY id_widget_config, session_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS keep_id
  FROM webchat_conversations
  WHERE session_id IS NOT NULL
    AND status = 'active'
),
movers AS (
  SELECT id AS from_id, keep_id
  FROM dups
  WHERE id <> keep_id
),
moved_messages AS (
  UPDATE webchat_messages wm
  SET id_conversation = m.keep_id
  FROM movers m
  WHERE wm.id_conversation = m.from_id
  RETURNING wm.id
),
merged_meta AS (
  UPDATE webchat_conversations keep
  SET
    last_message_at = GREATEST(
      keep.last_message_at,
      COALESCE(agg.max_last, keep.last_message_at)
    ),
    ai_paused = keep.ai_paused OR COALESCE(agg.any_paused, false),
    ai_paused_at = CASE
      WHEN keep.ai_paused OR COALESCE(agg.any_paused, false)
        THEN COALESCE(keep.ai_paused_at, agg.max_paused_at)
      ELSE keep.ai_paused_at
    END
  FROM (
    SELECT
      m.keep_id,
      BOOL_OR(c.ai_paused) AS any_paused,
      MAX(c.ai_paused_at) AS max_paused_at,
      MAX(c.last_message_at) AS max_last
    FROM movers m
    JOIN webchat_conversations c ON c.id = m.from_id OR c.id = m.keep_id
    GROUP BY m.keep_id
  ) agg
  WHERE keep.id = agg.keep_id
  RETURNING keep.id
)
DELETE FROM webchat_conversations wc
WHERE wc.id IN (SELECT from_id FROM movers);

-- B4. Delete orphan garbage widgets only (never touch rows still referenced)
DELETE FROM web_widget_configs wc
WHERE wc.widget_key ~ '^chatbot_[0-9]+'
  AND NOT EXISTS (
    SELECT 1
    FROM custom_chatbots cc
    WHERE COALESCE(NULLIF(btrim(cc.widget_key), ''), 'chatbot_' || cc.id::text) = wc.widget_key
  )
  AND NOT EXISTS (
    SELECT 1
    FROM webchat_conversations c
    WHERE c.id_widget_config = wc.id
  );

-- B5. Prevent active-session fragmentation going forward (create only after B3)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_webchat_active_session
  ON webchat_conversations (id_widget_config, session_id)
  WHERE session_id IS NOT NULL AND status = 'active';

COMMIT;
