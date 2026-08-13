-- 119_marketplace_indexes.sql
-- Bổ sung index tối ưu cho các truy vấn browse và tìm kiếm marketplace
-- Không thay đổi schema — chỉ thêm index để tăng tốc.

BEGIN;

-- Index phục vụ filter kết hợp status + resource_type + category (browse)
-- dùng cho truy vấn phổ biến nhất ở MarketplaceContent.jsx
CREATE INDEX IF NOT EXISTS idx_listings_status_type_category
    ON marketplace_listings(status, resource_type, category);

-- Index phục vụ sort theo purchase_count (popular) và view_count
CREATE INDEX IF NOT EXISTS idx_listings_purchase_count
    ON marketplace_listings(purchase_count DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_listings_view_count
    ON marketplace_listings(view_count DESC)
    WHERE status = 'published';

-- Index phục vụ sort theo created_at (newest)
CREATE INDEX IF NOT EXISTS idx_listings_created_at
    ON marketplace_listings(created_at DESC)
    WHERE status = 'published';

-- Index phục vụ sort theo price_credits (price_asc / price_desc)
CREATE INDEX IF NOT EXISTS idx_listings_price
    ON marketplace_listings(price_credits)
    WHERE status = 'published';

-- Index phục vụ truy vấn search bằng ILIKE trên title (description cũng đi kèm)
-- Dùng pg_trgm nếu có, fallback về btree. Đặt trong DO block để không vỡ nếu extension chưa bật.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        -- Đã có pg_trgm — thêm GIN index cho ILIKE search
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_listings_title_trgm
                 ON marketplace_listings USING gin (title gin_trgm_ops)';
    ELSE
        -- Fallback: btree trên lower(title) — phục vụ prefix-match, không full-text
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_listings_title_lower
                 ON marketplace_listings (lower(title))';
    END IF;
END$$;

-- Index phục vụ getUserListings: (id_user, status, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_listings_user_status_created
    ON marketplace_listings(id_user, status, created_at DESC);

-- Index phục vụ getUserPurchases: (id_user, transaction_type, purchased_at DESC)
CREATE INDEX IF NOT EXISTS idx_purchases_user_type_purchased
    ON marketplace_purchases(id_user, transaction_type, purchased_at DESC);

-- Index phục vụ getReviews: (listing_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_reviews_listing_created
    ON marketplace_reviews(listing_id, created_at DESC);

-- Index phục vụ getUserFavorites: (id_user, created_at DESC) — đã có idx_favorites_user
-- nhưng thiếu thứ tự sắp xếp, tạo bổ sung
CREATE INDEX IF NOT EXISTS idx_favorites_user_created
    ON marketplace_favorites(id_user, created_at DESC);

-- Index phục vụ admin: lọc theo status cho admin list
CREATE INDEX IF NOT EXISTS idx_listings_status_created
    ON marketplace_listings(status, created_at DESC);

COMMIT;