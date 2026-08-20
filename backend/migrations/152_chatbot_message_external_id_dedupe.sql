-- Prevent provider retries from creating duplicate visitor rows and AI replies.
BEGIN;

DELETE FROM chatbot_messages newer
USING chatbot_messages older
WHERE newer.id_conversation = older.id_conversation
  AND newer.external_id IS NOT NULL
  AND newer.external_id = older.external_id
  AND newer.id > older.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_chatbot_message_conversation_external
  ON chatbot_messages (id_conversation, external_id)
  WHERE external_id IS NOT NULL;

COMMIT;
