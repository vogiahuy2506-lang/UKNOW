-- Migration 012: Create refresh_tokens table
-- Description: Supports session management and token rotation for user authentication.

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id             BIGSERIAL PRIMARY KEY,
    id_user        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     VARCHAR(255) NOT NULL,
    device_info    TEXT,
    ip_address     VARCHAR(45),
    is_revoked     BOOLEAN DEFAULT FALSE,
    revoked_at     TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster token lookups during refresh/logout
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
-- Index for cleaning up expired tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
-- Index for user-specific session management
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(id_user);

COMMIT;
