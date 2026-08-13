-- 121: Add marketplace_origin column to campaigns
-- Track whether a campaign was self-created or purchased from marketplace

BEGIN;

-- Add column to track marketplace purchase origin
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS marketplace_purchase_id BIGINT
REFERENCES marketplace_purchases(id) ON DELETE SET NULL;

-- Add column for quick filtering without JOIN
-- 'self_created' = user created themselves
-- 'marketplace_purchased' = bought from marketplace
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'self_created'
CHECK (origin IN ('self_created', 'marketplace_purchased'));

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_origin ON campaigns(origin);
CREATE INDEX IF NOT EXISTS idx_campaigns_marketplace_purchase ON campaigns(marketplace_purchase_id);

-- Update existing campaigns (they're all self-created)
UPDATE campaigns SET origin = 'self_created' WHERE origin IS NULL;

-- Trigger to auto-set origin when cloning from marketplace purchase
CREATE OR REPLACE FUNCTION set_campaign_origin_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- If marketplace_purchase_id is set, mark as marketplace_purchased
    IF NEW.marketplace_purchase_id IS NOT NULL THEN
        NEW.origin = 'marketplace_purchased';
    ELSE
        NEW.origin = 'self_created';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_campaign_origin ON campaigns;
CREATE TRIGGER trg_set_campaign_origin
    BEFORE INSERT OR UPDATE OF marketplace_purchase_id ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION set_campaign_origin_trigger();

COMMIT;
