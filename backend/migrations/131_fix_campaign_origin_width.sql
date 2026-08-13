-- 123: Fix campaigns.origin column width
-- 'marketplace_purchased' is 21 chars but column was VARCHAR(20)

BEGIN;

ALTER TABLE campaigns
    ALTER COLUMN origin TYPE VARCHAR(30);

-- Defensive: re-set any rows that may have failed to update due to the bug
UPDATE campaigns
SET origin = 'marketplace_purchased'
WHERE marketplace_purchase_id IS NOT NULL
  AND origin <> 'marketplace_purchased';

UPDATE campaigns
SET origin = 'self_created'
WHERE marketplace_purchase_id IS NULL
  AND origin IS NULL;

COMMIT;
