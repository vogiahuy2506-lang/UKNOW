-- Migration 250: Add CHECK constraint to prevent negative available_balance in marketplace_seller_stats
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_marketplace_seller_stats_available_balance_non_negative'
    ) THEN
        ALTER TABLE marketplace_seller_stats
        ADD CONSTRAINT chk_marketplace_seller_stats_available_balance_non_negative
        CHECK (available_balance >= 0);
    END IF;
END $$;
