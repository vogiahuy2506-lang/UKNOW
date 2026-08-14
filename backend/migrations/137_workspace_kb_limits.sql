BEGIN;

-- Product defaults approved for the PR-2-KB shadow rollout. Unknown/custom plan
-- codes intentionally receive the trial fail-safe and can be adjusted later.
UPDATE plans
SET max_kb_documents = CASE LOWER(COALESCE(code, ''))
      WHEN 'starter' THEN 10
      WHEN 'basic' THEN 25
      WHEN 'professional' THEN 75
      WHEN 'enterprise' THEN 200
      ELSE 3
    END,
    max_kb_extracted_chars = CASE LOWER(COALESCE(code, ''))
      WHEN 'starter' THEN 500000
      WHEN 'basic' THEN 1500000
      WHEN 'professional' THEN 5000000
      WHEN 'enterprise' THEN 20000000
      ELSE 100000
    END;

ALTER TABLE plans
  ALTER COLUMN max_kb_documents SET DEFAULT 3,
  ALTER COLUMN max_kb_documents SET NOT NULL,
  ALTER COLUMN max_kb_extracted_chars SET DEFAULT 100000,
  ALTER COLUMN max_kb_extracted_chars SET NOT NULL;

ALTER TABLE plans
  ADD CONSTRAINT plans_max_kb_documents_positive CHECK (max_kb_documents > 0),
  ADD CONSTRAINT plans_max_kb_extracted_chars_positive CHECK (max_kb_extracted_chars > 0);

ALTER TABLE kb_documents
  ADD COLUMN extracted_chars BIGINT NOT NULL DEFAULT 0 CHECK (extracted_chars >= 0);

-- Normalize legacy employee-created KB rows to the billing workspace when the
-- owner can be resolved unambiguously. A sub-assistant owner is the strongest
-- parent signal; otherwise accept exactly one active workspace membership.
WITH unique_employee_owner AS (
  SELECT employee_id, MIN(owner_id) AS owner_id
  FROM user_members
  WHERE status = 'active'
  GROUP BY employee_id
  HAVING COUNT(*) = 1
), resolved_kb_owner AS (
  SELECT kb.id, COALESCE(sa.id_user, ueo.owner_id) AS owner_id
  FROM knowledge_bases kb
  JOIN users actor ON actor.id = kb.id_user
  LEFT JOIN unique_employee_owner ueo ON ueo.employee_id = actor.id
  LEFT JOIN sub_assistants sa ON sa.id = kb.id_sub_assistant
)
UPDATE knowledge_bases kb
SET id_user = resolved.owner_id,
    updated_at = NOW()
FROM resolved_kb_owner resolved
WHERE resolved.id = kb.id
  AND resolved.owner_id IS NOT NULL
  AND kb.id_user <> resolved.owner_id;

UPDATE kb_documents d
SET id_user = kb.id_user,
    updated_at = NOW()
FROM knowledge_bases kb
WHERE kb.id = d.id_kb AND d.id_user <> kb.id_user;

UPDATE kb_chunks c
SET id_user = kb.id_user
FROM knowledge_bases kb
WHERE kb.id = c.id_kb AND c.id_user <> kb.id_user;

UPDATE kb_documents d
SET extracted_chars = COALESCE(
  NULLIF(char_length(d.content_text), 0),
  (SELECT SUM(char_length(c.chunk_text)) FROM kb_chunks c WHERE c.id_document = d.id),
  0
);

CREATE INDEX idx_kb_documents_owner_usage
  ON kb_documents(id_user, status, extracted_chars);

CREATE TABLE custom_chatbot_documents (
  id              BIGSERIAL PRIMARY KEY,
  chatbot_id      BIGINT NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  owner_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     VARCHAR(20) NOT NULL CHECK (source_type IN ('file', 'text', 'url')),
  source_key      VARCHAR(500) NOT NULL,
  title           VARCHAR(500),
  content_text    TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message   TEXT,
  extracted_chars BIGINT NOT NULL DEFAULT 0 CHECK (extracted_chars >= 0),
  chunk_count     INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chatbot_id, source_key)
);

CREATE INDEX idx_custom_chatbot_documents_owner_usage
  ON custom_chatbot_documents(owner_user_id, status, extracted_chars);
CREATE INDEX idx_custom_chatbot_documents_chatbot
  ON custom_chatbot_documents(chatbot_id, created_at DESC);

-- The historical custom_chatbot_chunks.sql file is unnumbered and sorts after
-- numbered migrations on a fresh install, so make this migration self-contained.
CREATE TABLE IF NOT EXISTS custom_chatbot_chunks (
  id SERIAL PRIMARY KEY,
  chatbot_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding JSONB,
  chunk_index INTEGER NOT NULL,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE custom_chatbot_chunks ADD COLUMN document_id BIGINT;

-- Preserve legacy custom-chat documents by cataloging each chatbot/source group.
INSERT INTO custom_chatbot_documents
  (chatbot_id, owner_user_id, source_type, source_key, title, content_text,
   status, extracted_chars, chunk_count, created_at, updated_at)
SELECT c.chatbot_id,
       cb.id_user,
       'file',
       COALESCE(c.source, 'legacy-' || MIN(c.id)::text),
       COALESCE(c.source, 'Legacy document'),
       string_agg(c.chunk_text, E'\n\n' ORDER BY c.chunk_index, c.id),
       'ready',
       SUM(char_length(c.chunk_text)),
       COUNT(*)::integer,
       MIN(c.created_at),
       NOW()
FROM custom_chatbot_chunks c
JOIN custom_chatbots cb ON cb.id = c.chatbot_id
GROUP BY c.chatbot_id, cb.id_user, c.source
ON CONFLICT (chatbot_id, source_key) DO NOTHING;

UPDATE custom_chatbot_chunks c
SET document_id = d.id,
    user_id = d.owner_user_id
FROM custom_chatbot_documents d
WHERE d.chatbot_id = c.chatbot_id
  AND d.source_key = COALESCE(c.source, 'legacy-' || c.id::text);

-- NULL legacy sources cannot share the generated per-row key in the grouped insert;
-- create a final catalog row for any remaining chunk without attribution.
INSERT INTO custom_chatbot_documents
  (chatbot_id, owner_user_id, source_type, source_key, title, content_text,
   status, extracted_chars, chunk_count, created_at, updated_at)
SELECT c.chatbot_id, cb.id_user, 'file', 'legacy-' || c.id::text,
       'Legacy document', c.chunk_text, 'ready', char_length(c.chunk_text), 1,
       c.created_at, NOW()
FROM custom_chatbot_chunks c
JOIN custom_chatbots cb ON cb.id = c.chatbot_id
WHERE c.document_id IS NULL
ON CONFLICT (chatbot_id, source_key) DO NOTHING;

UPDATE custom_chatbot_chunks c
SET document_id = d.id,
    user_id = d.owner_user_id
FROM custom_chatbot_documents d
WHERE c.document_id IS NULL
  AND d.chatbot_id = c.chatbot_id
  AND d.source_key = 'legacy-' || c.id::text;

ALTER TABLE custom_chatbot_chunks
  ADD CONSTRAINT custom_chatbot_chunks_document_fk
    FOREIGN KEY (document_id) REFERENCES custom_chatbot_documents(id) ON DELETE CASCADE;

-- Keep document_id nullable for any pre-existing chunk whose chatbot parent was
-- already missing. New application writes always provide the catalog FK; legacy
-- unknown rows remain reviewable instead of making deployment destructive.

CREATE INDEX idx_custom_chatbot_chunks_document
  ON custom_chatbot_chunks(document_id, chunk_index);

COMMIT;
