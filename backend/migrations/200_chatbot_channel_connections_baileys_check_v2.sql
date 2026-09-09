-- Migration 200: widen chatbot_channel_connections.channel_type CHECK constraint to include 'whatsapp_baileys' as a superset.
-- allow-destructive-ddl: metadata-only SUPERSET CHECK (DROP+ADD ngay trong cùng transaction, không table rewrite, không data scan; giá trị mới bao trùm giá trị cũ nên existing rows vẫn valid).

ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check,
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
    CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys'));
