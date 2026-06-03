-- Add raw_data column to channel_messages to store original Zalo/Facebook message
ALTER TABLE channel_messages 
ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT NULL;

COMMENT ON COLUMN channel_messages.raw_data IS 'Original raw message data from Zalo/Facebook (includes sender type, group info, attachments, etc.)';
