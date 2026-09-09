-- allow-destructive-ddl: PostgreSQL CHECK doesn't support ADD VALUE — only DROP+ADD is possible.
-- allow-destructive-ddl: This is a metadata-only SUPERSET CHECK (no table rewrite, no data scan).
-- allow-destructive-ddl: Existing rows remain valid under the broader enum.
DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check;

ALTER TABLE chatbot_channel_connections
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
  CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys'));
