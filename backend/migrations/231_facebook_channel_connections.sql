-- Migration 231: Facebook Channel Connections
-- Extends channel_connections to support multiple Facebook Pages per user.
-- Adds fb_user_id / fb_page_id / fb_page_name columns + widens UNIQUE constraint.
-- Pattern mirrors WhatsApp: channel_connections = per-user (pages),
-- chatbot_channel_connections = per-chatbot (AI enable per page).

-- Step 1: Drop the old single-page-per-user UNIQUE constraint
-- Old: (id_user, channel) — one row per user per channel.
ALTER TABLE channel_connections
  DROP CONSTRAINT IF EXISTS uq_channel_user_channel;

-- Step 2: Add Facebook-specific columns (nullable for zalo/email/telegram rows)
ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS fb_user_id   TEXT,
  ADD COLUMN IF NOT EXISTS fb_page_id   TEXT,
  ADD COLUMN IF NOT EXISTS fb_page_name TEXT;

-- Step 3: Add new multi-page UNIQUE constraint
-- A user can have multiple Facebook pages: UNIQUE per (id_user, channel, fb_page_id).
-- Rows for non-Facebook channels have NULL fb_page_id → no conflict.
ALTER TABLE channel_connections
  ADD CONSTRAINT uq_channel_user_channel_fb_page
    UNIQUE (id_user, channel, fb_page_id);

-- Step 4: Add partial indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_channel_conn_fb_user
  ON channel_connections(fb_user_id)
  WHERE fb_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_conn_fb_page
  ON channel_connections(fb_page_id)
  WHERE fb_page_id IS NOT NULL;

-- Step 5: Backfill existing facebook rows (user-level, no specific page)
-- Rows created before this migration have NULL fb_page_id — that's fine,
-- they represent a single-page connection and can be upgraded on next OAuth.

-- Step 6: Add comment for documentation
COMMENT ON COLUMN channel_connections.fb_user_id  IS 'Facebook user ID who owns the page (from /me)';
COMMENT ON COLUMN channel_connections.fb_page_id   IS 'Facebook Page ID';
COMMENT ON COLUMN channel_connections.fb_page_name IS 'Facebook Page display name';
