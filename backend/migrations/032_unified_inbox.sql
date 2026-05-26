-- Migration 030: Add is_read tracking to messages tables
-- Purpose: Track read status for unified inbox

BEGIN;

-- Add is_read and read_at to channel_messages
ALTER TABLE channel_messages
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

ALTER TABLE channel_messages
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Add is_read and read_at to webchat_messages
ALTER TABLE webchat_messages
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

ALTER TABLE webchat_messages
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Create audit_logs table for tracking important actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50),
  entity_id     BIGINT,
  details       JSONB DEFAULT '{}',
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(id_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Add conversation_type column for easier querying
ALTER TABLE channel_conversations
ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT NULL;

-- Update channel column from joined channel_connections
UPDATE channel_conversations cc
SET channel = ch.channel
FROM channel_connections ch
WHERE cc.id_channel = ch.id;

-- Make channel column NOT NULL after population
ALTER TABLE channel_conversations
ALTER COLUMN channel SET NOT NULL;

-- Add indexes for better performance on inbox queries
CREATE INDEX IF NOT EXISTS idx_channel_conversations_status ON channel_conversations(status);
CREATE INDEX IF NOT EXISTS idx_channel_conversations_last_message ON channel_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_webchat_conversations_status ON webchat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_webchat_conversations_last_message ON webchat_conversations(last_message_at DESC);

-- Add composite index for user + status queries (common inbox pattern)
CREATE INDEX IF NOT EXISTS idx_channel_conv_user_status ON channel_conversations(id_user, status);
CREATE INDEX IF NOT EXISTS idx_webchat_conv_user_status ON webchat_conversations(id_user, status);

COMMIT;
