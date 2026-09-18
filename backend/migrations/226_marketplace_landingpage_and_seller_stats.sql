-- 226: Marketplace Enhancement - landing_page resource_type và seller_stats
-- Thêm landing_page làm resource_type mới
-- Thêm bảng theo dõi stats của seller

BEGIN;

-- 1. Thêm landing_page vào resource_type CHECK constraint
ALTER TABLE marketplace_listings 
DROP CONSTRAINT IF EXISTS marketplace_listings_resource_type_check;

ALTER TABLE marketplace_listings 
ADD CONSTRAINT marketplace_listings_resource_type_check 
CHECK (resource_type IN ('campaign', 'chatbot', 'landing_page'));

-- 2. Tạo bảng theo dõi stats của seller
CREATE TABLE IF NOT EXISTS marketplace_seller_stats (
    id_user BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_earnings INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    available_balance INTEGER DEFAULT 0,
    pending_payout INTEGER DEFAULT 0,
    lifetime_paid_out INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes cho seller_stats
CREATE INDEX IF NOT EXISTS idx_seller_stats_user ON marketplace_seller_stats(id_user);

-- 3. Tạo bảng payout requests
CREATE TABLE IF NOT EXISTS marketplace_payout_requests (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    payment_method VARCHAR(50),
    payment_details JSONB,
    admin_notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by BIGINT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON marketplace_payout_requests(id_user);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON marketplace_payout_requests(status);

-- 4. Trigger để update updated_at cho seller_stats
-- Function đã được định nghĩa trong bootstrap.sql; chỉ cần tạo trigger
DROP TRIGGER IF EXISTS trg_seller_stats_updated_at ON marketplace_seller_stats;
CREATE TRIGGER trg_seller_stats_updated_at
    BEFORE UPDATE ON marketplace_seller_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_seller_stats_timestamp();

-- 5. Insert initial stats cho những seller hiện có (từ purchases)
INSERT INTO marketplace_seller_stats (id_user, total_earnings, total_sales, available_balance)
SELECT 
    p.seller_id,
    SUM(CEILING(p.credits_spent * 0.9)) as total_earnings,
    COUNT(*) as total_sales,
    SUM(CEILING(p.credits_spent * 0.9)) as available_balance
FROM marketplace_purchases p
WHERE p.transaction_type = 'purchase'
AND p.credits_spent > 0
GROUP BY p.seller_id
ON CONFLICT (id_user) DO NOTHING;

COMMIT;
