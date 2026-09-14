CREATE TABLE IF NOT EXISTS chatbot_contact_alerts (
  id                     BIGSERIAL PRIMARY KEY,
  id_user                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_type           VARCHAR(10) NOT NULL CHECK (contact_type IN ('phone', 'email')),
  contact_value          VARCHAR(255) NOT NULL,          -- đã chuẩn hoá: 0xxxxxxxxx / chữ thường
  first_seen_at          TIMESTAMPTZ NOT NULL,
  last_seen_at           TIMESTAMPTZ NOT NULL,
  seen_count             INTEGER NOT NULL DEFAULT 1,
  last_source            VARCHAR(20) NOT NULL,           -- 'web' | 'channel' | 'zalo_personal'
  last_conversation_id   BIGINT NOT NULL,
  last_message_id        BIGINT NOT NULL,
  last_excerpt           TEXT,                           -- ≤ 200 ký tự tin khách
  pending_notify         BOOLEAN NOT NULL DEFAULT true,
  suppressed_reason      VARCHAR(30),                    -- 'human_active' | 'owner_own_contact' | NULL
  last_notified_at       TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chatbot_contact_alert UNIQUE (id_user, contact_type, contact_value)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_contact_alerts_pending
  ON chatbot_contact_alerts (id_user) WHERE pending_notify = true;
CREATE INDEX IF NOT EXISTS idx_chatbot_contact_alerts_conv
  ON chatbot_contact_alerts (id_user, last_source, last_conversation_id);

CREATE TABLE IF NOT EXISTS chatbot_contact_scan_cursors (
  source           VARCHAR(20) PRIMARY KEY,               -- 'web' | 'channel' | 'zalo_personal'
  last_message_id  BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
