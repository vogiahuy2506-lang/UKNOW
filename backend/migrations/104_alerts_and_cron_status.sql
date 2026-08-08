-- Migration 104: Alert rules/events + cron job status (PLAN_DO_LUONG_KPI Phần A)
BEGIN;

CREATE TABLE IF NOT EXISTS alert_rules (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(64) NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  threshold_value   NUMERIC,
  window_minutes    INT,
  channel           VARCHAR(32) NOT NULL DEFAULT 'email',
  severity          VARCHAR(16) NOT NULL DEFAULT 'warning',
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_minutes  INT NOT NULL DEFAULT 60,
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id              BIGSERIAL PRIMARY KEY,
  rule_id         INT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  measured_value  NUMERIC,
  message         TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notified        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_fired
  ON alert_events (rule_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_unresolved
  ON alert_events (resolved, fired_at DESC)
  WHERE resolved = FALSE;

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id             BIGSERIAL PRIMARY KEY,
  job_code       VARCHAR(64) NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  duration_ms    INT,
  status         VARCHAR(32) NOT NULL,
  result         JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
  ON cron_job_runs (job_code, started_at DESC);

-- Seed starter rules (idempotent)
INSERT INTO alert_rules (code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config)
VALUES
  (
    'campaign_fail_rate_high',
    'Tỉ lệ gửi thất bại cao',
    'failed_sends / total_recipients vượt ngưỡng trong cửa sổ thời gian',
    0.30, 60, 'email', 'warning', 60,
    '{"minRecipients": 20}'::jsonb
  ),
  (
    'zalo_inbound_silence',
    'Không có tin Zalo vào',
    '0 tin Zalo Personal inbound trong cửa sổ (chỉ giờ hành chính)',
    0, 360, 'email', 'warning', 60,
    '{"businessHoursOnly": true}'::jsonb
  ),
  (
    'cron_zalo_bg_sync_noop',
    'Cron Zalo bg sync không làm gì',
    'synced = 0 liên tiếp N lần gần nhất',
    3, NULL, 'email', 'warning', 60,
    '{"jobCode": "zalo_personal_bg_group_sync", "consecutiveNoops": 3}'::jsonb
  ),
  (
    'ai_cost_spike',
    'Chi phí AI vọt',
    'Token AI hôm nay > N× trung bình 7 ngày trước',
    3, NULL, 'email', 'warning', 120,
    '{"resourceType": "ai_token"}'::jsonb
  ),
  (
    'zalo_disconnected',
    'Tài khoản Zalo mất kết nối',
    'status != connected quá N phút',
    30, 30, 'email', 'critical', 60,
    '{}'::jsonb
  ),
  (
    'order_pending_stale',
    'Thanh toán treo',
    'Đơn pending quá N giờ',
    2, 120, 'email', 'warning', 60,
    '{}'::jsonb
  ),
  (
    'login_fail_flood',
    'Đăng nhập sai dồn dập',
    '> N lần login failed / cửa sổ / IP (login_history)',
    20, 10, 'email', 'critical', 30,
    '{}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

COMMIT;
