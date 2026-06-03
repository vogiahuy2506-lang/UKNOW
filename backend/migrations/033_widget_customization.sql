-- Add customization fields to web_widget_configs
BEGIN;

-- Widget appearance customization
ALTER TABLE web_widget_configs 
ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) DEFAULT '#1F2937',
ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#60A5FA';

-- Suggested questions (up to 5)
ALTER TABLE web_widget_configs 
ADD COLUMN IF NOT EXISTS suggested_questions TEXT[] DEFAULT '{}';

-- Compact mode options
ALTER TABLE web_widget_configs 
ADD COLUMN IF NOT EXISTS border_radius INTEGER DEFAULT 16,
ADD COLUMN IF NOT EXISTS show_avatar BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS chat_height VARCHAR(10) DEFAULT '500px';

COMMENT ON COLUMN web_widget_configs.logo_url IS 'Custom logo URL for the chatbot header';
COMMENT ON COLUMN web_widget_configs.primary_color IS 'Primary button/header color';
COMMENT ON COLUMN web_widget_configs.background_color IS 'Chat bubble background color';
COMMENT ON COLUMN web_widget_configs.text_color IS 'Default text color';
COMMENT ON COLUMN web_widget_configs.accent_color IS 'Accent/highlight color';
COMMENT ON COLUMN web_widget_configs.suggested_questions IS 'Array of up to 5 suggested questions';
COMMENT ON COLUMN web_widget_configs.border_radius IS 'Border radius in pixels';
COMMENT ON COLUMN web_widget_configs.show_avatar IS 'Show/hide bot avatar';
COMMENT ON COLUMN web_widget_configs.chat_height IS 'Chat window height';

COMMIT;
