-- Chatbot Channel Connections
-- Mỗi chatbot có thể kết nối 1 Zalo OA và 1 Facebook Messenger

CREATE TABLE IF NOT EXISTS chatbot_channel_connections (
    id SERIAL PRIMARY KEY,
    id_chatbot INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
    channel_type VARCHAR(32) NOT NULL CHECK (channel_type IN ('zalo_oa', 'facebook')),
    
    -- Credentials (encrypted in production)
    credentials JSONB NOT NULL DEFAULT '{}',
    
    -- Webhook
    webhook_token VARCHAR(64) UNIQUE NOT NULL,
    webhook_url TEXT,
    
    -- Display info
    display_name VARCHAR(255),
    external_channel_id VARCHAR(128), -- Zalo OA ID or Facebook Page ID
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Mỗi chatbot chỉ có 1 kết nối mỗi loại channel
    UNIQUE(id_chatbot, channel_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_chatbot ON chatbot_channel_connections(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_token ON chatbot_channel_connections(webhook_token);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_type ON chatbot_channel_connections(channel_type);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_active ON chatbot_channel_connections(id_chatbot, channel_type, is_active) WHERE is_active = true;

COMMENT ON TABLE chatbot_channel_connections IS 'Kết nối kênh (Zalo/Facebook) cho mỗi chatbot';
COMMENT ON COLUMN chatbot_channel_connections.credentials IS 'Lưu trữ access_token, page_id, etc - nên mã hóa trong production';
COMMENT ON COLUMN chatbot_channel_connections.webhook_token IS 'Token duy nhất cho webhook URL';
