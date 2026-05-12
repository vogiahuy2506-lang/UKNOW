-- =====================================================================
-- Bootstrap schema cho integration test
-- =====================================================================
-- Đây là schema TỐI THIỂU đủ để chạy auth integration tests (register,
-- login, /me, refresh-token). KHÔNG phải full schema production.
--
-- Nguyên tắc:
--   * Schema phản ánh trạng thái CUỐI CÙNG sau khi đã áp dụng đủ
--     migrations 001-015 (vd: cột `role` dùng giá trị 'admin'/'user',
--     không phải 'superadmin'/'user_admin').
--   * Test setup sẽ DROP toàn bộ schema public rồi chạy file này 1 lần.
--   * Khi mở rộng test sang module khác (campaigns, payments, ...) hãy
--     thêm các bảng tương ứng vào đây.
-- =====================================================================

-- ─── Users + RBAC ───────────────────────────────────────────────────────
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

-- ─── Auth tokens & history ──────────────────────────────────────────────
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

-- ─── Verification codes (OTP/reset/invite) ─────────────────────────────
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

-- ─── Plans + Orders (payment) ──────────────────────────────────────────
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

-- FK sau khi plans tồn tại: users.active_plan_id → plans(id)
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

-- ─── Email module (settings + templates) ──────────────────────────────
-- Schema tối thiểu để test CRUD email-settings và email-templates.
-- Các cột tracking nâng cao (sent_count counters, daily/hourly) đủ để test
-- side-effect của incrementSentCount.

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

-- ─── Campaigns module ─────────────────────────────────────────────────
-- Bảng tối thiểu để test CRUD campaign + publish/pause/duplicate + run
-- create-record. KHÔNG cover execute (cần BullMQ + email/zalo senders).

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
  id              BIGSERIAL PRIMARY KEY,
  id_campaign     BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id_schedule     BIGINT,
  run_name        VARCHAR(255),
  run_type        VARCHAR(20)  NOT NULL DEFAULT 'manual'
    CHECK (run_type IN ('manual', 'scheduled')),
  status          VARCHAR(20)  NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'stopped')),
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  run_metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_runs_campaign ON campaign_runs(id_campaign);
CREATE INDEX idx_campaign_runs_status ON campaign_runs(status);

-- ─── Zalo module (settings + templates) ────────────────────────────────
-- Schema tối thiểu để CRUD zalo_settings (chỉ cột mà controller truy vấn)
-- và zalo_templates. cookie_text lưu plain text (production cũng plain —
-- không dùng AES như SMTP password).

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

-- ─── Contact submissions (migration 015) ──────────────────────────────
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

-- ─── Schema migrations tracker ─────────────────────────────────────────
-- Tạo sẵn để migrationRunner không tự tạo + đánh dấu là đã chạy hết.
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  ran_at   TIMESTAMPTZ DEFAULT NOW()
);
