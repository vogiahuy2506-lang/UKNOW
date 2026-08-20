-- Migration: Add origin column to custom_chatbots to track source
-- origin values: 'self_created' (default), 'marketplace_purchased', 'shared'
-- When a chatbot is shared via clone, it gets origin='shared'
-- When purchased from marketplace, it gets origin='marketplace_purchased'

ALTER TABLE custom_chatbots
ADD COLUMN IF NOT EXISTS origin VARCHAR(50) DEFAULT 'self_created';

-- Index for filtering by origin
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_origin ON custom_chatbots(origin) WHERE is_active = true;

-- Update existing chatbots to self_created (they're all self-created)
UPDATE custom_chatbots SET origin = 'self_created' WHERE origin IS NULL OR origin = '';
