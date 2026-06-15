-- Chatbot AI Studio Conversations - lưu trữ cuộc trò chuyện từ chatbot studio
CREATE TABLE IF NOT EXISTS chatbot_studio_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
    id_chatbot INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
    
    -- Session info
    session_id VARCHAR(128) UNIQUE,
    title VARCHAR(255), -- Tên cuộc hội thoại (tự động tạo từ tin nhắn đầu tiên)
    
    -- Status
    status VARCHAR(32) DEFAULT 'active', -- active, archived
    
    -- Message counts
    message_count INTEGER DEFAULT 0,
    
    -- Timestamps
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_studio_conv_user ON chatbot_studio_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_studio_conv_chatbot ON chatbot_studio_conversations(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_studio_conv_session ON chatbot_studio_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_conv_status ON chatbot_studio_conversations(id_user, status);
CREATE INDEX IF NOT EXISTS idx_studio_conv_last_msg ON chatbot_studio_conversations(id_user, last_message_at DESC);

-- Chatbot AI Studio Messages - lưu trữ tin nhắn trong cuộc trò chuyện studio
CREATE TABLE IF NOT EXISTS chatbot_studio_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conversation UUID NOT NULL REFERENCES chatbot_studio_conversations(id) ON DELETE CASCADE,
    
    -- Message content
    role VARCHAR(32) NOT NULL, -- user, assistant
    content TEXT,
    message_type VARCHAR(32) DEFAULT 'text', -- text, image, file
    
    -- AI metadata
    ai_model VARCHAR(64),
    ai_tokens_used INTEGER,
    ai_latency_ms INTEGER,
    
    -- Attachments
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_studio_msg_conv ON chatbot_studio_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_studio_msg_created ON chatbot_studio_messages(id_conversation, created_at DESC);
