-- Migration 041: Create custom_chatbots table for studio chatbot management
-- Table này lưu trữ chatbot được tạo từ UKnow Studio

BEGIN;

-- Custom Chatbots (Studio-managed)
CREATE TABLE IF NOT EXISTS custom_chatbots (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL DEFAULT 'New Chatbot',
  description         TEXT DEFAULT '',
  system_instruction  TEXT DEFAULT '',
  greeting_msg        TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  avatar_url          TEXT DEFAULT NULL,
  is_active           BOOLEAN DEFAULT true,
  
  -- Widget customization
  theme_color         VARCHAR(7) DEFAULT '#6366F1',
  position            VARCHAR(20) DEFAULT 'bottom-right',
  welcome_message     TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  
  -- Extended customization
  primary_color       VARCHAR(7) DEFAULT '#6366F1',
  background_color    VARCHAR(7) DEFAULT '#FFFFFF',
  text_color         VARCHAR(7) DEFAULT '#1F2937',
  accent_color       VARCHAR(7) DEFAULT '#60A5FA',
  logo_url           TEXT DEFAULT NULL,
  show_avatar        BOOLEAN DEFAULT true,
  border_radius      INTEGER DEFAULT 16,
  chat_height        VARCHAR(10) DEFAULT '600px',
  suggested_questions TEXT[] DEFAULT '{}',
  
  -- Widget key for embedding
  widget_key         VARCHAR(100) UNIQUE DEFAULT NULL,
  
  -- AI settings
  temperature        DECIMAL(3,2) DEFAULT 0.7,
  max_tokens         INTEGER DEFAULT 2048,
  ai_model           VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_user ON custom_chatbots(id_user);
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_key ON custom_chatbots(widget_key);
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_active ON custom_chatbots(is_active);

-- Comments
COMMENT ON TABLE custom_chatbots IS 'Chatbot instances managed in UKnow Studio';
COMMENT ON COLUMN custom_chatbots.widget_key IS 'Unique key for widget/iframe embedding';
COMMENT ON COLUMN custom_chatbots.primary_color IS 'Primary color for widget/iframe header and buttons';
COMMENT ON COLUMN custom_chatbots.background_color IS 'Background color for chat area';
COMMENT ON COLUMN custom_chatbots.text_color IS 'Text color for messages';
COMMENT ON COLUMN custom_chatbots.accent_color IS 'Accent/highlight color for gradients';
COMMENT ON COLUMN custom_chatbots.logo_url IS 'Custom logo URL displayed in chatbot header';
COMMENT ON COLUMN custom_chatbots.show_avatar IS 'Whether to show bot avatar in chat window';
COMMENT ON COLUMN custom_chatbots.position IS 'Widget position: bottom-right, bottom-left, top-right, top-left';
COMMENT ON COLUMN custom_chatbots.border_radius IS 'Border radius in pixels for chat window corners';
COMMENT ON COLUMN custom_chatbots.chat_height IS 'Chat window height (e.g., 600px)';
COMMENT ON COLUMN custom_chatbots.suggested_questions IS 'Array of up to 5 suggested questions shown to users';

COMMIT;
