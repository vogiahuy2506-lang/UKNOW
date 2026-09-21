-- Migration: Add Facebook token expiry tracking
-- Store token expiry info to enable proactive refresh before tokens expire.

-- Table to track Facebook token expiry information
CREATE TABLE IF NOT EXISTS facebook_token_tracking (
  id SERIAL PRIMARY KEY,
  channel_connection_id INTEGER NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  token_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  token_expires_at TIMESTAMP WITH TIME ZONE,
  last_refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_valid BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (channel_connection_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_facebook_token_tracking_connection
  ON facebook_token_tracking(channel_connection_id);

CREATE INDEX IF NOT EXISTS idx_facebook_token_tracking_expiry
  ON facebook_token_tracking(token_expires_at)
  WHERE token_expires_at IS NOT NULL;

-- Function to update token tracking when a token is refreshed
CREATE OR REPLACE FUNCTION update_facebook_token_tracking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.credentials ? 'page_access_token' AND OLD.credentials->>'page_access_token' IS DISTINCT FROM NEW.credentials->>'page_access_token' THEN
    -- Token was refreshed, update tracking
    INSERT INTO facebook_token_tracking (channel_connection_id, token_created_at, token_expires_at, last_refreshed_at)
    VALUES (NEW.id, NOW(), NOW() + INTERVAL '55 days', NOW())
    ON CONFLICT (channel_connection_id)
    DO UPDATE SET
      token_created_at = NOW(),
      token_expires_at = NOW() + INTERVAL '55 days',
      last_refreshed_at = NOW(),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update token tracking on credentials change
DROP TRIGGER IF EXISTS trg_facebook_token_tracking ON channel_connections;
CREATE TRIGGER trg_facebook_token_tracking
  AFTER UPDATE OF credentials ON channel_connections
  FOR EACH ROW
  WHEN (OLD.channel = 'facebook')
  EXECUTE FUNCTION update_facebook_token_tracking();
