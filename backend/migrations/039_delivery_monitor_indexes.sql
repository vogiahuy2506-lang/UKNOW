-- Indexes for the admin delivery monitoring dashboard.
-- These are intentionally defensive: some legacy databases may not have every
-- tracking table yet, so each block checks table existence before creating indexes.

DO $$
BEGIN
  IF to_regclass('public.campaign_runs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_campaign_runs_started_at_desc
      ON campaign_runs (started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_campaign_runs_status_started_at
      ON campaign_runs (status, started_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.customer_journey') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customer_journey_type_at
      ON customer_journey (event_type, event_at DESC);

    CREATE INDEX IF NOT EXISTS idx_customer_journey_channel_at
      ON customer_journey (event_channel, event_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.campaign_executions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_campaign_executions_status_updated
      ON campaign_executions (status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_campaign_executions_error_updated
      ON campaign_executions (updated_at DESC)
      WHERE error_message IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.email_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_email_messages_status_created
      ON email_messages (status, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.zalo_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_zalo_messages_status_created
      ON zalo_messages (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_zalo_messages_channel_created
      ON zalo_messages (channel, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.zalo_unreachable_phones') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_zalo_unreachable_updated
      ON zalo_unreachable_phones (updated_at DESC);
  END IF;
END $$;
