-- Chatbot Conversations - lưu trữ cuộc trò chuyện từ các kênh (Zalo, Facebook)
CREATE TABLE IF NOT EXISTS chatbot_conversations (
    id SERIAL PRIMARY KEY,
    id_chatbot INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
    id_channel INTEGER REFERENCES chatbot_channel_connections(id) ON DELETE SET NULL,
    channel_type VARCHAR(32) DEFAULT 'web', -- web, zalo, facebook
    external_id VARCHAR(128), -- PSID hoặc Zalo OpenID
    source VARCHAR(32), -- Nguồn: web, zalo_oa, facebook
    
    -- Visitor info
    visitor_name VARCHAR(255),
    visitor_info JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(32) DEFAULT 'active', -- active, closed
    unread_count INTEGER DEFAULT 0,
    
    -- Timestamps
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    UNIQUE(id_channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_conv_chatbot ON chatbot_conversations(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_channel ON chatbot_conversations(id_channel);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_external ON chatbot_conversations(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_status ON chatbot_conversations(id_chatbot, status);

-- Chatbot Messages - lưu trữ tin nhắn trong cuộc trò chuyện
CREATE TABLE IF NOT EXISTS chatbot_messages (
    id SERIAL PRIMARY KEY,
    id_conversation INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
    
    -- Message content
    role VARCHAR(32) NOT NULL, -- visitor, bot
    content TEXT,
    message_type VARCHAR(32) DEFAULT 'text', -- text, image, file, quick_reply
    
    -- External info (từ platform)
    external_id VARCHAR(128),
    external_ts TIMESTAMP WITH TIME ZONE,
    
    -- Attachments
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    -- AI response metadata
    ai_model VARCHAR(64),
    ai_tokens_used INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conv ON chatbot_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_created ON chatbot_messages(id_conversation, created_at DESC);
