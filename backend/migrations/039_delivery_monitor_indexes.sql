-- Indexes for the admin delivery monitoring dashboard.
-- These are intentionally defensive: some legacy databases may not have every
-- tracking table/column yet, so each block checks column existence before creating indexes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_runs' AND column_name = 'started_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_runs_started_at_desc ON campaign_runs (started_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_runs' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_runs' AND column_name = 'started_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_runs_status_started_at ON campaign_runs (status, started_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_journey' AND column_name = 'event_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_journey' AND column_name = 'event_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_journey_type_at ON customer_journey (event_type, event_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_journey' AND column_name = 'event_channel'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_journey' AND column_name = 'event_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_journey_channel_at ON customer_journey (event_channel, event_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_executions' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_executions' AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_executions_status_updated ON campaign_executions (status, updated_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_executions' AND column_name = 'updated_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_executions' AND column_name = 'error_message'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_executions_error_updated ON campaign_executions (updated_at DESC) WHERE error_message IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_messages' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_messages' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_messages_status_created ON email_messages (status, created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_zalo_messages_status_created ON zalo_messages (status, created_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'channel'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_zalo_messages_channel_created ON zalo_messages (channel, created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_unreachable_phones' AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_zalo_unreachable_updated ON zalo_unreachable_phones (updated_at DESC)';
  END IF;
END $$;
