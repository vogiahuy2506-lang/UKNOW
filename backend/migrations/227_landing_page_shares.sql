-- 227: Create landing_page_shares table for sharing landing pages between users
-- Users can share their landing pages with others by email invitation

BEGIN;

CREATE TABLE IF NOT EXISTS landing_page_shares (
    id BIGSERIAL PRIMARY KEY,
    id_landing_page BIGINT NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
    id_owner BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_recipient BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    share_type VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (share_type IN ('view', 'edit')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_landing_page, id_recipient)
);

CREATE INDEX IF NOT EXISTS idx_landing_page_shares_landing ON landing_page_shares(id_landing_page);
CREATE INDEX IF NOT EXISTS idx_landing_page_shares_recipient ON landing_page_shares(id_recipient);
CREATE INDEX IF NOT EXISTS idx_landing_page_shares_owner ON landing_page_shares(id_owner);

ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_landing_page_share_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE landing_pages SET share_count = COALESCE(share_count, 0) + 1 WHERE id = NEW.id_landing_page;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE landing_pages SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0) WHERE id = OLD.id_landing_page;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_landing_page_share_count ON landing_page_shares;
CREATE TRIGGER trg_update_landing_page_share_count
    AFTER INSERT OR DELETE ON landing_page_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_landing_page_share_count();

CREATE OR REPLACE FUNCTION update_landing_page_shares_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_landing_page_shares_updated_at ON landing_page_shares;
CREATE TRIGGER trg_landing_page_shares_updated_at
    BEFORE UPDATE ON landing_page_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_landing_page_shares_timestamp();

COMMIT;
