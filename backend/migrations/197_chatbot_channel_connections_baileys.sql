-- Extend CHECK constraint on chatbot_channel_connections to include Baileys
ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check;

ALTER TABLE chatbot_channel_connections
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
  CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys'));
