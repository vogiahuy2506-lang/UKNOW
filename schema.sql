-- =====================================================================
-- Bootstrap schema cho integration test
-- =====================================================================
-- ÄÃ¢y lÃ  schema Tá»I THIá»‚U Ä‘á»§ Ä‘á»ƒ cháº¡y auth integration tests (register,
-- login, /me, refresh-token). KHÃ”NG pháº£i full schema production.
--
-- NguyÃªn táº¯c:
--   * Schema pháº£n Ã¡nh tráº¡ng thÃ¡i CUá»I CÃ™NG sau khi Ä‘Ã£ Ã¡p dá»¥ng Ä‘á»§
--     migrations 001-015 (vd: cá»™t `role` dÃ¹ng giÃ¡ trá»‹ 'admin'/'user',
--     khÃ´ng pháº£i 'superadmin'/'user_admin').
--   * Test setup sáº½ DROP toÃ n bá»™ schema public rá»“i cháº¡y file nÃ y 1 láº§n.
--   * Khi má»Ÿ rá»™ng test sang module khÃ¡c (campaigns, payments, ...) hÃ£y
--     thÃªm cÃ¡c báº£ng tÆ°Æ¡ng á»©ng vÃ o Ä‘Ã¢y.
-- =====================================================================

-- â”€â”€â”€ Users + RBAC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE users (
  id                      BIGSERIAL PRIMARY KEY,
  username                VARCHAR(50)  NOT NULL UNIQUE,
  email                   VARCHAR(255) NOT NULL UNIQUE,
  password_hash           TEXT         NOT NULL,
  full_name               VARCHAR(255),
  avatar_url              TEXT,
  phone                   VARCHAR(20),
  status                  VARCHAR(20)  NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'pending_activation')),
  role                    VARCHAR(20)  NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user', 'employee')),
  is_verified             BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_at             TIMESTAMPTZ,
  failed_login_attempts   INTEGER      NOT NULL DEFAULT 0,
  locked_until            TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  last_login_ip           VARCHAR(45),
  active_plan_id          BIGINT,
  subscription_expires_at TIMESTAMPTZ,
  -- Resource limits (migration 005-006)
  max_employees           INTEGER,
  max_campaigns           INTEGER,
  max_zalo_accounts       INTEGER,
  max_email_accounts      INTEGER,
  max_email_templates     INTEGER,
  max_zalo_templates      INTEGER,
  max_landing_pages       INTEGER,
  subscription_reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role  ON users(role);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE user_members (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB  NOT NULL DEFAULT '{}',
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  -- Send limits (migration 004)
  daily_email_limit    INTEGER,
  monthly_email_limit  INTEGER,
  daily_zalo_limit     INTEGER,
  monthly_zalo_limit   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_owner_employee UNIQUE (owner_id, employee_id),
  CONSTRAINT chk_no_self_member CHECK (owner_id <> employee_id)
);

-- â”€â”€â”€ Auth tokens & history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE refresh_tokens (
  id             BIGSERIAL PRIMARY KEY,
  id_user        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     VARCHAR(64) NOT NULL,
  device_info    TEXT,
  ip_address     VARCHAR(45),
  expires_at     TIMESTAMPTZ NOT NULL,
  is_revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  revoked_at     TIMESTAMPTZ,
  revoked_reason VARCHAR(50),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(id_user);

CREATE TABLE login_history (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email           VARCHAR(255),
  login_status    VARCHAR(20) NOT NULL CHECK (login_status IN ('success', 'failed')),
  failure_reason  TEXT,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- â”€â”€â”€ Verification codes (OTP/reset/invite) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE verification_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  code       VARCHAR(255) NOT NULL,
  type       VARCHAR(50)  NOT NULL DEFAULT 'email_verification',
  is_used    BOOLEAN      NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_codes_lookup ON verification_codes(email, code, type);

-- â”€â”€â”€ Plans + Orders (payment) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE plans (
  id                    BIGSERIAL PRIMARY KEY,
  code                  VARCHAR(50)  UNIQUE,
  name                  VARCHAR(100) NOT NULL,
  price                 BIGINT       NOT NULL DEFAULT 0,
  description           TEXT,
  features              JSONB        NOT NULL DEFAULT '[]',
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  is_custom             BOOLEAN      NOT NULL DEFAULT FALSE,
  max_employees         INTEGER      NOT NULL DEFAULT 0,
  daily_email_limit     INTEGER,
  monthly_email_limit   INTEGER,
  daily_zalo_limit      INTEGER,
  monthly_zalo_limit    INTEGER,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK sau khi plans tá»“n táº¡i: users.active_plan_id â†’ plans(id)
ALTER TABLE users
  ADD CONSTRAINT users_active_plan_fk
    FOREIGN KEY (active_plan_id) REFERENCES plans(id) ON DELETE SET NULL;

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  order_code  BIGINT       NOT NULL UNIQUE,
  plan_id     BIGINT       REFERENCES plans(id) ON DELETE SET NULL,
  amount      BIGINT       NOT NULL DEFAULT 0,
  user_email  VARCHAR(255),
  user_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'cancelled', 'failed')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_plan_id    ON orders(plan_id);
CREATE INDEX idx_orders_user_id    ON orders(user_id);
CREATE INDEX idx_orders_order_code ON orders(order_code);

-- â”€â”€â”€ Email module (settings + templates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Schema tá»‘i thiá»ƒu Ä‘á»ƒ test CRUD email-settings vÃ  email-templates.
-- CÃ¡c cá»™t tracking nÃ¢ng cao (sent_count counters, daily/hourly) Ä‘á»§ Ä‘á»ƒ test
-- side-effect cá»§a incrementSentCount.

CREATE TABLE email_settings (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  smtp_host        VARCHAR(255),
  smtp_port        INTEGER,
  smtp_username    VARCHAR(255),
  smtp_password    TEXT,
  use_tls          BOOLEAN      NOT NULL DEFAULT TRUE,
  daily_limit      INTEGER      NOT NULL DEFAULT 1000,
  hourly_limit     INTEGER      NOT NULL DEFAULT 100,
  daily_sent_count INTEGER      NOT NULL DEFAULT 0,
  total_sent_count INTEGER      NOT NULL DEFAULT 0,
  is_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_settings_user ON email_settings(id_user);

CREATE TABLE email_templates (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  template_code VARCHAR(100),
  subject       TEXT,
  body_html     TEXT,
  body_text     TEXT,
  attachments   JSONB        NOT NULL DEFAULT '[]',
  variables     JSONB        NOT NULL DEFAULT '[]',
  category      VARCHAR(100),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  usage_count   INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_templates_user ON email_templates(id_user);

-- â”€â”€â”€ Campaigns module â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Báº£ng tá»‘i thiá»ƒu Ä‘á»ƒ test CRUD campaign + publish/pause/duplicate + run
-- create-record. KHÃ”NG cover execute (cáº§n BullMQ + email/zalo senders).

CREATE TABLE campaigns (
  id                    BIGSERIAL PRIMARY KEY,
  id_user               BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_name         VARCHAR(255) NOT NULL,
  description           TEXT,
  campaign_type         VARCHAR(30)  NOT NULL DEFAULT 'email'
    CHECK (campaign_type IN ('email', 'zalo', 'zalo_group', 'mixed')),
  status                VARCHAR(50)  NOT NULL DEFAULT 'draft',
  id_data_source        BIGINT,
  flow_json             JSONB,
  landing_page_url      TEXT,
  landing_page_form_id  BIGINT,
  start_date            TIMESTAMPTZ,
  end_date              TIMESTAMPTZ,
  timezone              VARCHAR(50)  NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  total_customers       INTEGER      NOT NULL DEFAULT 0,
  total_sent            INTEGER      NOT NULL DEFAULT 0,
  total_delivered       INTEGER      NOT NULL DEFAULT 0,
  total_opened          INTEGER      NOT NULL DEFAULT 0,
  total_clicked         INTEGER      NOT NULL DEFAULT 0,
  total_converted       INTEGER      NOT NULL DEFAULT 0,
  total_revenue         BIGINT       NOT NULL DEFAULT 0,
  published_at          TIMESTAMPTZ,
  last_run_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaigns_user ON campaigns(id_user);
CREATE INDEX idx_campaigns_status ON campaigns(status);

CREATE TABLE campaign_nodes (
  id                BIGSERIAL PRIMARY KEY,
  id_campaign       BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  node_type         VARCHAR(50),
  node_subtype      VARCHAR(50),
  node_name         VARCHAR(255),
  node_description  TEXT,
  position_x        NUMERIC      DEFAULT 0,
  position_y        NUMERIC      DEFAULT 0,
  config            JSONB        NOT NULL DEFAULT '{}',
  execution_order   INTEGER      NOT NULL DEFAULT 1,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  id_email_template BIGINT,
  id_zalo_template  BIGINT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_nodes_campaign ON campaign_nodes(id_campaign);

CREATE TABLE campaign_connections (
  id                BIGSERIAL PRIMARY KEY,
  id_campaign       BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_node_id    BIGINT       NOT NULL REFERENCES campaign_nodes(id) ON DELETE CASCADE,
  target_node_id    BIGINT       NOT NULL REFERENCES campaign_nodes(id) ON DELETE CASCADE,
  connection_type   VARCHAR(50)  NOT NULL DEFAULT 'default',
  connection_label  VARCHAR(255),
  condition_config  JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_connections_campaign ON campaign_connections(id_campaign);

CREATE TABLE campaign_runs (
  id                BIGSERIAL PRIMARY KEY,
  id_campaign       BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id_schedule       BIGINT,
  run_name          VARCHAR(255),
  run_type          VARCHAR(20)  NOT NULL DEFAULT 'manual'
    CHECK (run_type IN ('manual', 'scheduled')),
  status            VARCHAR(20)  NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'stopped')),
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  total_recipients  INTEGER      NOT NULL DEFAULT 0,
  successful_sends  INTEGER      NOT NULL DEFAULT 0,
  failed_sends      INTEGER      NOT NULL DEFAULT 0,
  error_message     TEXT,
  run_metadata      JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_runs_campaign ON campaign_runs(id_campaign);
CREATE INDEX idx_campaign_runs_status ON campaign_runs(status);

-- Campaign executions â€” log tá»«ng node Ä‘Æ°á»£c engine xá»­ lÃ½ cho má»—i customer/run.
-- Báº£ng tá»‘i thiá»ƒu Ä‘á»ƒ GET /api/campaign-runs/:id khÃ´ng 500 khi chÆ°a cÃ³ run nÃ o.
CREATE TABLE campaign_executions (
  id                BIGSERIAL PRIMARY KEY,
  id_campaign       BIGINT       REFERENCES campaigns(id) ON DELETE CASCADE,
  id_run            BIGINT       REFERENCES campaign_runs(id) ON DELETE CASCADE,
  id_customer       BIGINT,
  status            VARCHAR(30),
  action_type       VARCHAR(50),
  path_taken        VARCHAR(50),
  execution_data    JSONB,
  error_message     TEXT,
  node_id           VARCHAR(100),
  node_name         VARCHAR(255),
  node_type         VARCHAR(50),
  node_subtype      VARCHAR(50),
  node_order        INTEGER,
  progress_current  INTEGER,
  progress_total    INTEGER,
  node_result_json  JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_executions_run ON campaign_executions(id_run);

-- Campaign schedules (cron) â€” `id_schedule` trÃªn campaign_runs trá» vá» Ä‘Ã¢y.
CREATE TABLE campaign_schedules (
  id              BIGSERIAL PRIMARY KEY,
  id_campaign     BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  schedule_name   VARCHAR(255) NOT NULL,
  schedule_type   VARCHAR(20)  NOT NULL
    CHECK (schedule_type IN ('once', 'daily', 'weekly', 'monthly', 'custom')),
  cron_expression VARCHAR(100) NOT NULL,
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_schedules_campaign ON campaign_schedules(id_campaign);

-- â”€â”€â”€ Zalo module (settings + templates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Schema tá»‘i thiá»ƒu Ä‘á»ƒ CRUD zalo_settings (chá»‰ cá»™t mÃ  controller truy váº¥n)
-- vÃ  zalo_templates. cookie_text lÆ°u plain text (production cÅ©ng plain â€”
-- khÃ´ng dÃ¹ng AES nhÆ° SMTP password).

CREATE TABLE zalo_settings (
  id                BIGSERIAL PRIMARY KEY,
  id_user           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name      VARCHAR(255) NOT NULL,
  zalo_user_id      VARCHAR(255),
  zalo_name         VARCHAR(255),
  zalo_phone        VARCHAR(50),
  login_method      VARCHAR(20)  NOT NULL DEFAULT 'qr',
  cookie_text       TEXT,
  status            VARCHAR(20)  NOT NULL DEFAULT 'disconnected',
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  is_default        BOOLEAN      NOT NULL DEFAULT FALSE,
  notes             TEXT,
  last_connected_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_zalo_settings_user ON zalo_settings(id_user);

CREATE TABLE zalo_templates (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  template_code VARCHAR(100),
  subject       TEXT,
  body_html     TEXT,
  body_text     TEXT,
  attachments   JSONB        NOT NULL DEFAULT '[]',
  variables     JSONB        NOT NULL DEFAULT '[]',
  category      VARCHAR(100),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  usage_count   INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_zalo_templates_user ON zalo_templates(id_user);

-- â”€â”€â”€ Contact submissions (migration 015) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE contact_submissions (
  id           BIGSERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  phone        VARCHAR(50),
  company      VARCHAR(255),
  company_size VARCHAR(50),
  message      TEXT,
  status       VARCHAR(50) DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  notes        TEXT,
  ip_address   VARCHAR(50),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_submissions_email ON contact_submissions(email);

-- â”€â”€â”€ Tracking short links â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- MÃ£ rÃºt gá»n `/t/:code` redirect 302 sang `destination_url`.
CREATE TABLE tracking_short_links (
  id              BIGSERIAL PRIMARY KEY,
  short_code      VARCHAR(32)  NOT NULL UNIQUE,
  destination_url TEXT         NOT NULL,
  channel         VARCHAR(50),
  tracking_token  VARCHAR(255),
  link_key        VARCHAR(255),
  click_count     INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tracking_short_links_code ON tracking_short_links(short_code);

-- â”€â”€â”€ Landing page leads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Form lead landing public â€” khÃ´ng gáº¯n vá»›i user (cáº¥u trÃºc multi-tenant
-- shared trÃªn trang public, khÃ´ng chia theo owner).
CREATE TABLE leads (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT,
  last_name           VARCHAR(255),
  first_name          VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  occupation          VARCHAR(100),
  interest_area       VARCHAR(100),
  marketing_consent   BOOLEAN      NOT NULL DEFAULT FALSE,
  landing_page_slug   VARCHAR(100),
  utm_source          VARCHAR(255),
  utm_medium          VARCHAR(255),
  utm_campaign        VARCHAR(255),
  utm_content         VARCHAR(255),
  utm_term            VARCHAR(255),
  ip_address          VARCHAR(45),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_leads_slug ON leads(landing_page_slug);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_user ON leads(id_user);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Landing page events â€” view/click/submit tracking cho landing page.
-- LeadService.createPublicLead ghi 1 event 'submit' náº¿u cÃ³ slug.
CREATE TABLE landing_page_events (
  id                BIGSERIAL PRIMARY KEY,
  id_user           BIGINT,
  event_type        VARCHAR(20)  NOT NULL,
  landing_page_slug VARCHAR(100),
  target_url        TEXT,
  utm_source        VARCHAR(255),
  utm_medium        VARCHAR(255),
  utm_campaign      VARCHAR(255),
  utm_content       VARCHAR(255),
  utm_term          VARCHAR(255),
  visitor_id        VARCHAR(64),
  referrer          VARCHAR(2000),
  user_agent        TEXT,
  ip_address        VARCHAR(45),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_landing_page_events_slug ON landing_page_events(landing_page_slug);
CREATE INDEX idx_landing_page_events_user ON landing_page_events(id_user);

-- â”€â”€â”€ Customers (Batch B) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Báº£ng khÃ¡ch hÃ ng end-user (target list cho campaign). Multi-tenant theo id_user.
CREATE TABLE customers (
  id                      BIGSERIAL PRIMARY KEY,
  id_user                 BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email                   VARCHAR(255),
  phone                   VARCHAR(50),
  zalo_id                 VARCHAR(255),
  zalo_phone              VARCHAR(50),
  facebook_id             VARCHAR(255),
  full_name               VARCHAR(255),
  gender                  VARCHAR(10),
  customer_source         VARCHAR(50),
  source_landing_page     VARCHAR(255),
  source_form_id          VARCHAR(255),
  utm_source              VARCHAR(255),
  utm_medium              VARCHAR(255),
  utm_campaign            VARCHAR(255),
  has_purchased           BOOLEAN      NOT NULL DEFAULT FALSE,
  total_orders            INTEGER      NOT NULL DEFAULT 0,
  total_spent             BIGINT       NOT NULL DEFAULT 0,
  last_order_at           TIMESTAMPTZ,
  email_subscribed        BOOLEAN      NOT NULL DEFAULT TRUE,
  email_unsubscribed_at   TIMESTAMPTZ,
  email_hard_bounced      BOOLEAN      NOT NULL DEFAULT FALSE,
  last_email_sent_at      TIMESTAMPTZ,
  last_email_opened_at    TIMESTAMPTZ,
  last_email_clicked_at   TIMESTAMPTZ,
  last_zalo_sent_at       TIMESTAMPTZ,
  last_zalo_read_at       TIMESTAMPTZ,
  zalo_in_group           BOOLEAN,
  id_zalo_group           BIGINT,
  zalo_group_joined_at    TIMESTAMPTZ,
  zalo_is_friend          BOOLEAN,
  zalo_friend_added_at    TIMESTAMPTZ,
  notes                   TEXT,
  custom_fields           JSONB,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_user  ON customers(id_user);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- â”€â”€â”€ Courses (WooCommerce sync) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE courses (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  course_code     VARCHAR(100),
  course_name     VARCHAR(500),
  product_id      INTEGER,
  price           BIGINT,
  original_price  BIGINT,
  description     TEXT,
  category        VARCHAR(255),
  thumbnail_url   TEXT,
  status          VARCHAR(50),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_courses_user       ON courses(id_user);
CREATE INDEX idx_courses_code       ON courses(course_code);
CREATE INDEX idx_courses_product_id ON courses(product_id);

-- â”€â”€â”€ Email messages â€” outbound emails (tracking ready) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE email_messages (
  id                      BIGSERIAL PRIMARY KEY,
  id_user                 BIGINT,
  id_campaign             BIGINT       REFERENCES campaigns(id) ON DELETE SET NULL,
  id_run                  BIGINT       REFERENCES campaign_runs(id) ON DELETE SET NULL,
  id_customer             BIGINT       REFERENCES customers(id) ON DELETE SET NULL,
  id_email_template       BIGINT,
  id_email_setting        BIGINT,
  id_node                 BIGINT,
  message_id              VARCHAR(255),
  tracking_token          VARCHAR(255) UNIQUE,
  recipient_email         VARCHAR(255),
  recipient_name          VARCHAR(255),
  sender_email            VARCHAR(255),
  sender_name             VARCHAR(255),
  subject                 TEXT,
  body_html               TEXT,
  body_text               TEXT,
  email_step              INTEGER,
  sequence_message_order  INTEGER,
  status                  VARCHAR(30)  NOT NULL DEFAULT 'pending',
  open_count              INTEGER      NOT NULL DEFAULT 0,
  click_count             INTEGER      NOT NULL DEFAULT 0,
  first_opened_at         TIMESTAMPTZ,
  last_opened_at          TIMESTAMPTZ,
  first_clicked_at        TIMESTAMPTZ,
  last_clicked_at         TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_messages_customer ON email_messages(id_customer);
CREATE INDEX idx_email_messages_token    ON email_messages(tracking_token);
CREATE INDEX idx_email_messages_run      ON email_messages(id_run);

-- â”€â”€â”€ Zalo messages â€” outbound (group/person) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE zalo_messages (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT,
  id_campaign         BIGINT       REFERENCES campaigns(id) ON DELETE SET NULL,
  id_run              BIGINT       REFERENCES campaign_runs(id) ON DELETE SET NULL,
  id_customer         BIGINT       REFERENCES customers(id) ON DELETE SET NULL,
  id_zalo_template    BIGINT,
  id_node             BIGINT,
  channel             VARCHAR(50),
  group_id            VARCHAR(100),
  tracking_token      VARCHAR(255) UNIQUE,
  tracking_metadata   JSONB,
  recipient_phone     VARCHAR(50),
  recipient_uid       VARCHAR(255),
  recipient_name      VARCHAR(255),
  message_content     TEXT,
  click_count         INTEGER      NOT NULL DEFAULT 0,
  status              VARCHAR(30)  NOT NULL DEFAULT 'pending',
  sent_at             TIMESTAMPTZ,
  first_clicked_at    TIMESTAMPTZ,
  last_clicked_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_zalo_messages_customer ON zalo_messages(id_customer);
CREATE INDEX idx_zalo_messages_token    ON zalo_messages(tracking_token);

-- â”€â”€â”€ Campaign-customer pivot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Theo dÃµi tham gia + counters tÆ°Æ¡ng tÃ¡c per (campaign, customer).
CREATE TABLE campaign_customers (
  id                          BIGSERIAL PRIMARY KEY,
  id_campaign                 BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id_customer                 BIGINT       NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status                      VARCHAR(30),
  uknow_status                VARCHAR(30),
  has_opened                  BOOLEAN      NOT NULL DEFAULT FALSE,
  has_clicked                 BOOLEAN      NOT NULL DEFAULT FALSE,
  email_received_count        INTEGER      NOT NULL DEFAULT 0,
  email_opened_count          INTEGER      NOT NULL DEFAULT 0,
  email_clicked_count         INTEGER      NOT NULL DEFAULT 0,
  joined_at                   TIMESTAMPTZ,
  first_email_sent_at         TIMESTAMPTZ,
  last_email_sent_at          TIMESTAMPTZ,
  first_email_opened_at       TIMESTAMPTZ,
  last_email_opened_at        TIMESTAMPTZ,
  first_email_clicked_at      TIMESTAMPTZ,
  last_email_clicked_at       TIMESTAMPTZ,
  last_activity_at            TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_customer UNIQUE (id_campaign, id_customer)
);
CREATE INDEX idx_campaign_customers_customer ON campaign_customers(id_customer);
CREATE INDEX idx_campaign_customers_campaign ON campaign_customers(id_campaign);

-- â”€â”€â”€ Campaign participation (1-1 record per campaign+customer) â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE campaign_participations (
  id            BIGSERIAL PRIMARY KEY,
  id_customer   BIGINT       NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  id_campaign   BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id_run        BIGINT       REFERENCES campaign_runs(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_participation UNIQUE (id_customer, id_campaign)
);
CREATE INDEX idx_campaign_participations_customer ON campaign_participations(id_customer);
CREATE INDEX idx_campaign_participations_campaign ON campaign_participations(id_campaign);

-- â”€â”€â”€ Customer purchases (order from WooCommerce or campaign-attributed) â”€
CREATE TABLE customer_purchases (
  id                BIGSERIAL PRIMARY KEY,
  id_customer       BIGINT       NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  id_campaign       BIGINT       REFERENCES campaigns(id) ON DELETE SET NULL,
  id_run            BIGINT       REFERENCES campaign_runs(id) ON DELETE SET NULL,
  id_email_message  BIGINT       REFERENCES email_messages(id) ON DELETE SET NULL,
  id_zalo_message   BIGINT       REFERENCES zalo_messages(id) ON DELETE SET NULL,
  id_course         BIGINT       REFERENCES courses(id) ON DELETE SET NULL,
  order_id          VARCHAR(100),
  order_key         VARCHAR(255),
  order_status      VARCHAR(50),
  product_name      VARCHAR(500),
  product_type      VARCHAR(50),
  amount            BIGINT,
  currency          VARCHAR(10),
  payment_method    VARCHAR(100),
  purchase_date     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_purchases_customer ON customer_purchases(id_customer);
CREATE INDEX idx_customer_purchases_campaign ON customer_purchases(id_campaign);
CREATE INDEX idx_customer_purchases_order    ON customer_purchases(order_id);

-- â”€â”€â”€ Customer journey â€” event log (open/click/purchase/etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE customer_journey (
  id                BIGSERIAL PRIMARY KEY,
  id_customer       BIGINT       NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  id_campaign       BIGINT       REFERENCES campaigns(id) ON DELETE SET NULL,
  id_run            BIGINT       REFERENCES campaign_runs(id) ON DELETE SET NULL,
  id_node           BIGINT,
  id_email_message  BIGINT       REFERENCES email_messages(id) ON DELETE SET NULL,
  id_zalo_message   BIGINT       REFERENCES zalo_messages(id) ON DELETE SET NULL,
  event_type        VARCHAR(50)  NOT NULL,
  event_channel     VARCHAR(30),
  event_data        JSONB,
  ip_address        VARCHAR(45),
  user_agent        TEXT,
  device_type       VARCHAR(50),
  country           VARCHAR(50),
  city              VARCHAR(100),
  event_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_journey_customer ON customer_journey(id_customer);
CREATE INDEX idx_customer_journey_campaign ON customer_journey(id_campaign);
CREATE INDEX idx_customer_journey_event_at ON customer_journey(event_at);

-- â”€â”€â”€ Template files (attachments) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE template_files (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT,
  storage_key   VARCHAR(500) NOT NULL UNIQUE,
  original_name VARCHAR(500),
  display_name  VARCHAR(500),
  mime_type     VARCHAR(200),
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_template_files_key ON template_files(storage_key);

-- â”€â”€â”€ File access events (download tracking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE file_access_events (
  id           BIGSERIAL PRIMARY KEY,
  file_id      BIGINT,
  campaign_id  BIGINT,
  customer_id  BIGINT,
  email        VARCHAR(255),
  event_type   VARCHAR(30),
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_file_access_events_file ON file_access_events(file_id);

-- â”€â”€â”€ Dashboard insights (Gemini AI persistence) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE dashboard_insights (
  id                BIGSERIAL PRIMARY KEY,
  id_user           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload           JSONB       NOT NULL,
  filters_snapshot  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dashboard_insights_user ON dashboard_insights(id_user);

-- â”€â”€â”€ Landing pages (CMS + dashboard stats source) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE landing_pages (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug          VARCHAR(100) NOT NULL,
  title         VARCHAR(500),
  html_content  TEXT         NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
  is_published  BOOLEAN      NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_landing_pages_user ON landing_pages(id_user);
CREATE INDEX idx_landing_pages_slug ON landing_pages(slug);

-- â”€â”€â”€ Landing featured courses (Batch C CMS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE landing_featured_courses (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  title_vi      VARCHAR(500) NOT NULL,
  title_en      VARCHAR(500) NOT NULL,
  tag_vi        VARCHAR(255) NOT NULL DEFAULT '',
  tag_en        VARCHAR(255) NOT NULL DEFAULT '',
  image_url     TEXT,
  link_url      TEXT         NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_landing_featured_courses_user ON landing_featured_courses(id_user);

-- â”€â”€â”€ Landing testimonials (Batch C CMS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE landing_testimonials (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  quote_vi      TEXT         NOT NULL,
  quote_en      TEXT         NOT NULL,
  star_rating   SMALLINT     NOT NULL DEFAULT 5,
  name_vi       VARCHAR(255) NOT NULL,
  name_en       VARCHAR(255) NOT NULL,
  role_vi       VARCHAR(255) NOT NULL DEFAULT '',
  role_en       VARCHAR(255) NOT NULL DEFAULT '',
  location_vi   VARCHAR(255) NOT NULL DEFAULT '',
  location_en   VARCHAR(255) NOT NULL DEFAULT '',
  image_url     TEXT,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_landing_testimonials_user ON landing_testimonials(id_user);

-- â”€â”€â”€ Schema migrations tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Táº¡o sáºµn Ä‘á»ƒ migrationRunner khÃ´ng tá»± táº¡o + Ä‘Ã¡nh dáº¥u lÃ  Ä‘Ã£ cháº¡y háº¿t.
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  ran_at   TIMESTAMPTZ DEFAULT NOW()
);


-- Đánh dấu tất cả các migration hiện tại đã được áp dụng vào schema này:
INSERT INTO schema_migrations (filename) VALUES ('001_rbac_roles_and_members.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('002_users_active_plan.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('003_fix_role_superadmin.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('004_employee_send_limits.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('005_plan_send_limits.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('006_plan_is_custom.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('007_subscription_expiry.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('008_pending_activation.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('009_verification_code_text.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('010_pgvector_business_profiles.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('011_lazy_cleanup.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('012_verification_codes_timestamptz.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('013_unified_role.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('014_rename_roles.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('015_contact_submissions.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('016_refresh_tokens.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('017_landing_multitenancy.sql') ON CONFLICT DO NOTHING;
