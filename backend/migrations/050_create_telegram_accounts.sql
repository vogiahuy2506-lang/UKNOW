-- Migration 050: Telegram personal-account integration
--
-- Stores per-user Telegram accounts (via QR login) and per-chatbot
-- enable flags. The Python `telegram-gateway` service holds the MTProto
-- session strings on disk; this table just mirrors the lightweight
-- profile + ownership mapping so the Node.js backend can route messages.

CREATE TABLE IF NOT EXISTS telegram_accounts (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_user_id BIGINT NOT NULL,
    phone VARCHAR(32),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    username VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One Telegram user_id is uniquely tied to the first account that
    -- linked it (avoids duplicate rows if QR flow races).
    UNIQUE(telegram_user_id),
    -- A given UKNOW user can only have ONE row per Telegram account,
    -- but in practice the (id_user, telegram_user_id) pair should be unique
    -- too — duplicates would confuse ownership checks.
    UNIQUE(id_user, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user
    ON telegram_accounts(id_user);

CREATE INDEX IF NOT EXISTS idx_telegram_accounts_active
    ON telegram_accounts(id_user, is_active);

CREATE TABLE IF NOT EXISTS telegram_chatbot_settings (
    id SERIAL PRIMARY KEY,
    id_telegram_account INTEGER NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,
    id_chatbot INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT false,
    -- When false, incoming messages from private chats are ignored even
    -- if the (account, chatbot) tuple is enabled.
    is_enabled_dm BOOLEAN DEFAULT true,
    -- When true, the chatbot also answers inside groups/channels the
    -- Telegram account is part of. Off by default — Telegram group
    -- chat tends to be much noisier.
    is_enabled_group BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(id_telegram_account, id_chatbot)
);

CREATE INDEX IF NOT EXISTS idx_telegram_settings_account
    ON telegram_chatbot_settings(id_telegram_account);

CREATE INDEX IF NOT EXISTS idx_telegram_settings_chatbot
    ON telegram_chatbot_settings(id_chatbot);

CREATE INDEX IF NOT EXISTS idx_telegram_settings_enabled
    ON telegram_chatbot_settings(id_chatbot)
    WHERE is_enabled = true;

-- Conversations table mirrors zalo_personal_conversations so that
-- the unified inbox + AI-pause flow works the same way for Telegram.
CREATE TABLE IF NOT EXISTS telegram_personal_conversations (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_telegram_account INTEGER NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,
    external_id VARCHAR(128) NOT NULL,   -- Telegram chat id (user or group)
    display_name VARCHAR(255),
    visitor_name VARCHAR(255),
    visitor_info JSONB DEFAULT '{}',
    id_chatbot INTEGER REFERENCES custom_chatbots(id) ON DELETE SET NULL,
    ai_paused BOOLEAN DEFAULT false,
    ai_paused_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(16) DEFAULT 'open',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One open row per (account, peer). New message after close opens a
    -- fresh conversation (handled by app code, not the constraint).
    UNIQUE(id_telegram_account, external_id, status)
);

CREATE INDEX IF NOT EXISTS idx_telegram_conv_user
    ON telegram_personal_conversations(id_user);

CREATE INDEX IF NOT EXISTS idx_telegram_conv_account_peer
    ON telegram_personal_conversations(id_telegram_account, external_id);

CREATE INDEX IF NOT EXISTS idx_telegram_conv_chatbot
    ON telegram_personal_conversations(id_chatbot);

CREATE TABLE IF NOT EXISTS telegram_personal_messages (
    id SERIAL PRIMARY KEY,
    id_conversation INTEGER NOT NULL REFERENCES telegram_personal_conversations(id) ON DELETE CASCADE,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_message_id VARCHAR(64),
    role VARCHAR(16) NOT NULL CHECK (role IN ('visitor', 'bot', 'agent', 'system')),
    content TEXT,
    message_type VARCHAR(16) DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_msg_conv
    ON telegram_personal_messages(id_conversation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_msg_user
    ON telegram_personal_messages(id_user);

COMMENT ON TABLE telegram_accounts IS
    'Telegram personal accounts linked via QR login (MTProto). The session_string is held by the Python telegram-gateway service — only the lightweight profile lives here.';
COMMENT ON COLUMN telegram_accounts.telegram_user_id IS
    'Telegram user_id (bigint) — stable across re-logins of the same account.';
COMMENT ON TABLE telegram_chatbot_settings IS
    'Per-chatbot enable flag for a Telegram personal account. Mirrors the pattern used by chatbot_zalo_account_settings.';
COMMENT ON TABLE telegram_personal_conversations IS
    'One row per (Telegram account, peer chat) — drives unified inbox + AI-pause for the Telegram channel.';
