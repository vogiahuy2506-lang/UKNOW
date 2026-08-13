-- 122: Create campaign_shares table for sharing campaigns between users
-- Users can share their campaigns with others by email invitation

BEGIN;

-- Campaign shares table
CREATE TABLE IF NOT EXISTS campaign_shares (
    id BIGSERIAL PRIMARY KEY,
    id_campaign BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    id_owner BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_recipient BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    share_type VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (share_type IN ('view', 'edit')),
    can_run BOOLEAN DEFAULT FALSE, -- recipient can run the campaign
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_campaign, id_recipient)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_campaign_shares_campaign ON campaign_shares(id_campaign);
CREATE INDEX IF NOT EXISTS idx_campaign_shares_recipient ON campaign_shares(id_recipient);
CREATE INDEX IF NOT EXISTS idx_campaign_shares_owner ON campaign_shares(id_owner);

-- Add share_count to campaigns table for quick display
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

-- Function to update share_count
CREATE OR REPLACE FUNCTION update_campaign_share_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE campaigns SET share_count = COALESCE(share_count, 0) + 1 WHERE id = NEW.id_campaign;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE campaigns SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0) WHERE id = OLD.id_campaign;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_campaign_share_count ON campaign_shares;
CREATE TRIGGER trg_update_campaign_share_count
    AFTER INSERT OR DELETE ON campaign_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_share_count();

-- Functions for updated_at
CREATE OR REPLACE FUNCTION update_campaign_shares_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_shares_updated_at ON campaign_shares;
CREATE TRIGGER trg_campaign_shares_updated_at
    BEFORE UPDATE ON campaign_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_shares_timestamp();

COMMIT;
