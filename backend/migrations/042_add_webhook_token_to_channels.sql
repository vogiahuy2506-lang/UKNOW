-- Add webhook_token column to channel_connections for multi-channel support
-- Each channel will have its own unique webhook URL

ALTER TABLE channel_connections
ADD COLUMN IF NOT EXISTS webhook_token VARCHAR(64) UNIQUE;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_channel_connections_webhook_token
ON channel_connections(webhook_token) WHERE webhook_token IS NOT NULL;

-- Add external_id to support multiple channels of same type per user
ALTER TABLE channel_connections
ADD COLUMN IF NOT EXISTS external_channel_id VARCHAR(128);

COMMENT ON COLUMN channel_connections.webhook_token IS 'Unique token for webhook URL routing';
COMMENT ON COLUMN channel_connections.external_channel_id IS 'External channel ID (e.g., Zalo OA ID, Facebook Page ID)';
