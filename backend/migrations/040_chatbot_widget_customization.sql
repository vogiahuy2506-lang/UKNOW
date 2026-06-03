-- Add widget customization and suggested questions to custom_chatbots table
-- Chỉ chạy ALTER nếu bảng đã tồn tại (migration 041 tạo bảng)

BEGIN;

-- Only add columns if table exists (for existing installations)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'custom_chatbots') THEN
    -- Widget UI customization fields
    ALTER TABLE custom_chatbots
    ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#6366F1',
    ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) DEFAULT '#FFFFFF',
    ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) DEFAULT '#1F2937',
    ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#60A5FA',
    ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS show_avatar BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS position VARCHAR(20) DEFAULT 'bottom-right',
    ADD COLUMN IF NOT EXISTS border_radius INTEGER DEFAULT 16,
    ADD COLUMN IF NOT EXISTS chat_height VARCHAR(10) DEFAULT '600px';

    -- Suggested questions (up to 5) - applies to all deployment types
    ALTER TABLE custom_chatbots
    ADD COLUMN IF NOT EXISTS suggested_questions TEXT[] DEFAULT '{}';

    -- AI settings
    ALTER TABLE custom_chatbots
    ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7,
    ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 2048,
    ADD COLUMN IF NOT EXISTS ai_model VARCHAR(50) DEFAULT 'gemini-2.5-flash';

    -- Widget key
    ALTER TABLE custom_chatbots
    ADD COLUMN IF NOT EXISTS widget_key VARCHAR(100) UNIQUE DEFAULT NULL;

    -- Comments
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
  END IF;
END $$;

COMMIT;
