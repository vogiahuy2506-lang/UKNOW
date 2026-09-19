-- Migration 228: Mẫu email do superadmin tạo, có tên riêng + lịch gửi đi kèm.
-- Phạm vi: global (không gắn workspace). Mẫu gốc (system_email_templates / TYPE_TEMPLATES) KHÔNG bị ảnh hưởng.

CREATE TABLE IF NOT EXISTS notification_templates (
  id                   SERIAL PRIMARY KEY,
  type_key             VARCHAR(32)  NOT NULL,
  slug                 VARCHAR(64)  NOT NULL,
  name                 VARCHAR(120) NOT NULL,
  description          TEXT,
  subject              VARCHAR(200) NOT NULL,
  body_html            TEXT         NOT NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  schedule_type        VARCHAR(16)  NOT NULL DEFAULT 'now',
  scheduled_at         TIMESTAMPTZ,
  recurrence_pattern   VARCHAR(16),
  recurrence_end_date  TIMESTAMPTZ,
  last_dispatched_at   TIMESTAMPTZ,
  created_by           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_templates_type_check
    CHECK (type_key IN ('maintenance','announcement','promotion','warning','reminder','security')),
  CONSTRAINT notification_templates_schedule_check
    CHECK (schedule_type IN ('now','scheduled','recurring')),
  CONSTRAINT notification_templates_recurrence_check
    CHECK (recurrence_pattern IS NULL
        OR recurrence_pattern IN ('daily','weekly','monthly')),
  CONSTRAINT notification_templates_slug_unique UNIQUE (type_key, slug)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_type_active
  ON notification_templates(type_key) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_notification_templates_due
  ON notification_templates(schedule_type, scheduled_at)
  WHERE schedule_type IN ('scheduled','recurring') AND is_active = TRUE;
