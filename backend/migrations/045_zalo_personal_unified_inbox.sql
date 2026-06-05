-- Migration 045: Zalo Personal Unified Inbox
-- Purpose: Store Zalo Personal conversations for unified inbox

BEGIN;

-- Zalo Personal Conversations (mirrors channel_conversations structure)
CREATE TABLE IF NOT EXISTS zalo_personal_conversations (
    id            BIGSERIAL PRIMARY KEY,
    id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_zalo_setting BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
    external_id   VARCHAR(255), -- Zalo UID của người chat
    visitor_name  VARCHAR(255),
    visitor_info  JSONB DEFAULT '{}',
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    status        VARCHAR(20) DEFAULT 'active',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_zalo_personal_external_id UNIQUE (id_zalo_setting, external_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_user ON zalo_personal_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_setting ON zalo_personal_conversations(id_zalo_setting);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_status ON zalo_personal_conversations(id_user, status);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_last_msg ON zalo_personal_conversations(last_message_at DESC);

-- Zalo Personal Messages (mirrors channel_messages structure)
CREATE TABLE IF NOT EXISTS zalo_personal_messages (
    id             BIGSERIAL PRIMARY KEY,
    id_conversation BIGINT NOT NULL REFERENCES zalo_personal_conversations(id) ON DELETE CASCADE,
    id_user        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_zalo_setting BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
    role           VARCHAR(20) NOT NULL, -- 'visitor' | 'bot' | 'agent'
    content        TEXT NOT NULL,
    message_type   VARCHAR(20) DEFAULT 'text',
    external_id    VARCHAR(255),
    external_ts    TIMESTAMPTZ,
    attachments    JSONB DEFAULT '[]',
    metadata       JSONB DEFAULT '{}',
    is_read        BOOLEAN DEFAULT false,
    read_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_conv ON zalo_personal_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_setting ON zalo_personal_messages(id_zalo_setting);

COMMIT;
