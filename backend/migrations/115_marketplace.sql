-- 108: Marketplace - chia sẻ & mua/bán chiến dịch
-- Bảng listings, purchases, reviews, favorites

BEGIN;

-- 1. marketplace_listings (listing chính)
CREATE TABLE marketplace_listings (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('campaign', 'chatbot')),
    resource_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50), -- 'marketing', 'automation', 'support'
    tags TEXT[],
    price_credits INTEGER DEFAULT 0, -- 0 = miễn phí
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'team')),
    view_count INTEGER DEFAULT 0,
    purchase_count INTEGER DEFAULT 0,
    rating_avg DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_listings_status ON marketplace_listings(status);
CREATE INDEX idx_listings_type ON marketplace_listings(resource_type);
CREATE INDEX idx_listings_category ON marketplace_listings(category);
CREATE INDEX idx_listings_rating ON marketplace_listings(rating_avg DESC);
CREATE INDEX idx_listings_user ON marketplace_listings(id_user);

-- 2. marketplace_purchases (lịch sử mua)
CREATE TABLE marketplace_purchases (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    seller_id BIGINT NOT NULL REFERENCES users(id),
    credits_spent INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'refund')),
    cloned_resource_id BIGINT,
    cloned_resource_type VARCHAR(20),
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_user, listing_id)
);

CREATE INDEX idx_purchases_user ON marketplace_purchases(id_user);
CREATE INDEX idx_purchases_listing ON marketplace_purchases(listing_id);
CREATE INDEX idx_purchases_seller ON marketplace_purchases(seller_id);

-- 3. marketplace_reviews (đánh giá)
CREATE TABLE marketplace_reviews (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_user, listing_id)
);

CREATE INDEX idx_reviews_listing ON marketplace_reviews(listing_id);
CREATE INDEX idx_reviews_user ON marketplace_reviews(id_user);

-- 4. marketplace_favorites (yêu thích)
CREATE TABLE marketplace_favorites (
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id_user, listing_id)
);

CREATE INDEX idx_favorites_user ON marketplace_favorites(id_user);
CREATE INDEX idx_favorites_listing ON marketplace_favorites(listing_id);

-- Functions & Triggers for updated_at
CREATE OR REPLACE FUNCTION update_marketplace_listing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_marketplace_reviews_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketplace_listings_updated_at
    BEFORE UPDATE ON marketplace_listings
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_listing_timestamp();

CREATE TRIGGER trg_marketplace_reviews_updated_at
    BEFORE UPDATE ON marketplace_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_reviews_timestamp();

COMMIT;
