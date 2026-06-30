-- Notifications System Migration
-- Supports multi-type notifications with targeting, scheduling, and tracking

-- Drop existing tables if they exist
DROP TABLE IF EXISTS notification_email_logs;
DROP TABLE IF EXISTS notifications;

-- Enums
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'maintenance', 'announcement', 'promotion', 'warning', 'reminder', 'security'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_type AS ENUM ('now', 'scheduled', 'recurring');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE recurrence_pattern AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Main notifications table
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  type notification_type NOT NULL DEFAULT 'announcement',
  title VARCHAR(255) NOT NULL,
  title_en VARCHAR(255),
  message TEXT NOT NULL,
  message_en TEXT,
  html_content TEXT,
  html_content_en TEXT,
  metadata JSONB DEFAULT '{}',
  priority notification_priority DEFAULT 'normal',

  -- Targeting
  target_roles TEXT[] DEFAULT NULL,
  target_plans TEXT[] DEFAULT NULL,
  target_statuses TEXT[] DEFAULT NULL,
  target_user_ids INTEGER[] DEFAULT NULL,
  target_emails TEXT[] DEFAULT NULL,
  registered_before TIMESTAMP,
  registered_after TIMESTAMP,

  -- Scheduling
  schedule_type schedule_type DEFAULT 'now',
  scheduled_at TIMESTAMP,
  recurrence_pattern VARCHAR(20),
  recurrence_end_date TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,

  -- Stats
  recipient_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,

  -- Status
  status notification_status DEFAULT 'draft',
  sent_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email logs with tracking
CREATE TABLE notification_email_logs (
  id SERIAL PRIMARY KEY,
  notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  message_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  bounced_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_type_status ON notifications(type, status);
CREATE INDEX idx_notifications_created_by ON notifications(created_by);

CREATE INDEX idx_email_logs_notification ON notification_email_logs(notification_id);
CREATE INDEX idx_email_logs_user ON notification_email_logs(user_id);
CREATE INDEX idx_email_logs_email ON notification_email_logs(email);
CREATE INDEX idx_email_logs_status ON notification_email_logs(status);
CREATE INDEX idx_email_logs_created ON notification_email_logs(created_at);

-- Comments
COMMENT ON TABLE notifications IS 'Stores bulk notification campaigns with targeting and scheduling';
COMMENT ON COLUMN notifications.type IS 'Notification type: maintenance, announcement, promotion, warning, reminder, security';
COMMENT ON COLUMN notifications.target_roles IS 'NULL = all roles, otherwise array of roles like {user,admin}';
COMMENT ON COLUMN notifications.target_plans IS 'NULL = all plans, otherwise array like {free,starter,pro}';
COMMENT ON COLUMN notifications.target_statuses IS 'NULL = all statuses, otherwise array like {active,inactive}';
COMMENT ON COLUMN notifications.target_user_ids IS 'Specific user IDs to send to';
COMMENT ON COLUMN notifications.target_emails IS 'Specific email addresses to send to';
COMMENT ON COLUMN notifications.registered_before IS 'Filter users registered before this date';
COMMENT ON COLUMN notifications.registered_after IS 'Filter users registered after this date';
COMMENT ON COLUMN notifications.recurrence_pattern IS 'For recurring: daily, weekly, or monthly';
COMMENT ON COLUMN notifications.recurrence_end_date IS 'End date for recurring notifications';

COMMENT ON TABLE notification_email_logs IS 'Tracks individual email delivery and open status';
COMMENT ON COLUMN notification_email_logs.message_id IS 'SendGrid message ID for tracking';
COMMENT ON COLUMN notification_email_logs.status IS 'Email status: pending, sent, delivered, opened, bounced, failed';
