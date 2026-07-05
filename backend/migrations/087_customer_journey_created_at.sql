-- Migration: 087 — Add created_at to customer_journey.
--
-- user.repository.findProfileUsageCounts() groups events by cj.created_at,
-- but the production schema only has event_at (see migration 039 indexes).
-- Without this column, profile usage counters silently fall back to zero
-- for every user. Add a created_at column populated from event_at so
-- historical rows keep their original timestamp.

ALTER TABLE customer_journey
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE customer_journey
  SET created_at = event_at
  WHERE created_at IS NULL AND event_at IS NOT NULL;

ALTER TABLE customer_journey
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_journey_created_at
  ON customer_journey (created_at DESC);