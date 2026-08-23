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
    CHECK (status IN ('active', 'inactive', 'pending_activation', 'deleted')),
  role                    VARCHAR(20)  NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user', 'employee')),
  is_verified             BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_at             TIMESTAMPTZ,
  failed_login_attempts   INTEGER      NOT NULL DEFAULT 0,
  locked_until            TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  last_login_ip           VARCHAR(45),
  active_plan_id          INTEGER,
  storage_quota_override_bytes BIGINT CHECK (
    storage_quota_override_bytes IS NULL OR storage_quota_override_bytes > 0
  ),
  preferred_ai_model      VARCHAR(80),
  subscription_expires_at TIMESTAMPTZ,
  plan_activated_at       TIMESTAMPTZ,
  overage_grace_until     TIMESTAMPTZ,
  -- Resource limits (migration 005-006)
  max_employees           INTEGER,
  max_campaigns           INTEGER,
  max_zalo_campaigns      INTEGER,
  max_zalo_group_campaigns INTEGER,
  max_email_campaigns     INTEGER,
  max_zalo_accounts       INTEGER,
  max_email_accounts      INTEGER,
  max_email_templates     INTEGER,
  max_zalo_templates      INTEGER,
  max_landing_pages       INTEGER,
  bot_daily_reply_cap     INTEGER CHECK (bot_daily_reply_cap IS NULL OR bot_daily_reply_cap > 0),
  ai_handoff_auto_resume_minutes INTEGER CHECK (
    ai_handoff_auto_resume_minutes IS NULL
    OR ai_handoff_auto_resume_minutes IN (5, 15, 30, 60)
  ),
  subscription_reminder_count SMALLINT NOT NULL DEFAULT 0,
  -- migration 094: buộc đổi mật khẩu sau khi chủ shop reset cho nhân viên
  must_change_password    BOOLEAN      NOT NULL DEFAULT FALSE,
  messages_per_period     INTEGER,
  is_fup_enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
  auth_provider           VARCHAR(16)  NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
  -- migration 141: hồ sơ xuất hoá đơn điền sẵn
  invoice_profile         JSONB,
  -- migration 166: ngưỡng duyệt chiến dịch nhân viên
  employee_campaign_approval_threshold INTEGER,
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
  -- AI credit limits (migration 166)
  daily_ai_credit_limit   INTEGER,
  period_ai_credit_limit  INTEGER,
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
  id                    SERIAL PRIMARY KEY,
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
  max_landing_pages     INTEGER,
  max_campaigns         INTEGER,
  max_zalo_campaigns      INTEGER,
  max_zalo_group_campaigns INTEGER,
  max_email_campaigns     INTEGER,
  max_zalo_accounts     INTEGER,
  max_email_accounts    INTEGER,
  max_email_templates   INTEGER,
  max_zalo_templates    INTEGER,
  max_chatbots          INTEGER,
  ai_tokens_per_period  INTEGER,
  ai_credits_per_period INTEGER,
  ai_model              VARCHAR(64) DEFAULT 'gemini-2.5-flash',
  grace_period_days     INTEGER      NOT NULL DEFAULT 0,
  duration_days         INTEGER,
  price_yearly          BIGINT,
  messages_per_period   INTEGER,
  is_fup_enabled        BOOLEAN      NOT NULL DEFAULT FALSE,
  custom_owner_user_id  BIGINT,
  custom_config         JSONB,
  storage_limit_bytes  BIGINT NOT NULL DEFAULT 104857600 CHECK (storage_limit_bytes > 0),
  max_kb_documents     INTEGER NOT NULL DEFAULT 3 CHECK (max_kb_documents > 0),
  max_kb_extracted_chars BIGINT NOT NULL DEFAULT 100000 CHECK (max_kb_extracted_chars > 0),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── AI model catalog (migration 077-078) ──────────────────────────────
CREATE TABLE ai_models (
  model_id                  VARCHAR(80) PRIMARY KEY,
  display_name              VARCHAR(120) NOT NULL,
  input_token_limit         INTEGER,
  output_token_limit        INTEGER,
  description               TEXT,
  version                   VARCHAR(40),
  thinking                  BOOLEAN,
  is_enabled                BOOLEAN      NOT NULL DEFAULT TRUE,
  supports_generate_content BOOLEAN      NOT NULL DEFAULT TRUE,
  source                    VARCHAR(20)  NOT NULL DEFAULT 'google'
    CHECK (source IN ('google', 'manual')),
  last_seen_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_models_enabled_output
  ON ai_models(is_enabled, supports_generate_content, output_token_limit);

-- Integration-test fixture (not production seed).
INSERT INTO ai_models
  (model_id, display_name, input_token_limit, output_token_limit, is_enabled, supports_generate_content, source)
VALUES
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 1048576, 8192, TRUE, TRUE, 'google'),
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', 1048576, 65536, TRUE, TRUE, 'google'),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', 1048576, 131072, FALSE, TRUE, 'google');

-- FK sau khi plans tồn tại: users.active_plan_id → plans(id)
-- Tên khớp Neon/production (migration 107): users_active_plan_id_fkey
ALTER TABLE users
  ADD CONSTRAINT users_active_plan_id_fkey
    FOREIGN KEY (active_plan_id) REFERENCES plans(id) ON DELETE SET NULL;

CREATE TABLE storage_objects (
  id BIGSERIAL PRIMARY KEY,
  pool_type VARCHAR(16) NOT NULL DEFAULT 'workspace'
    CHECK (pool_type IN ('workspace', 'system')),
  owner_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  storage_key TEXT UNIQUE,
  temp_key TEXT UNIQUE,
  category VARCHAR(32) NOT NULL,
  state VARCHAR(24) NOT NULL
    CHECK (state IN ('active', 'temp', 'cleanup_pending', 'orphaned', 'deleted')),
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  expires_at TIMESTAMPTZ,
  reference_type VARCHAR(40),
  reference_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storage_objects_pool_owner_check CHECK (
    (pool_type = 'workspace' AND owner_user_id IS NOT NULL)
    OR (pool_type = 'system' AND owner_user_id IS NULL)
  ),
  CONSTRAINT storage_objects_live_key_check CHECK (
    state NOT IN ('active', 'temp', 'cleanup_pending')
    OR storage_key IS NOT NULL
    OR temp_key IS NOT NULL
  )
);
CREATE INDEX idx_storage_objects_owner_usage
  ON storage_objects (owner_user_id, pool_type, state)
  WHERE state IN ('active', 'temp', 'cleanup_pending');
CREATE INDEX idx_storage_objects_expiry
  ON storage_objects (expires_at)
  WHERE state = 'temp' AND expires_at IS NOT NULL;

ALTER TABLE plans
  ADD CONSTRAINT plans_custom_owner_user_fk
    FOREIGN KEY (custom_owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE custom_plan_pricing (
  id           BIGSERIAL PRIMARY KEY,
  item_key     VARCHAR(50) UNIQUE NOT NULL,
  plan_column  VARCHAR(50),
  unit_price   BIGINT  NOT NULL DEFAULT 0,
  unit_size    INTEGER NOT NULL DEFAULT 1,
  included_qty INTEGER NOT NULL DEFAULT 0,
  min_qty      INTEGER NOT NULL DEFAULT 0,
  max_qty      INTEGER,
  step_qty     INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_plan_pricing_unit_size_positive CHECK (unit_size > 0),
  CONSTRAINT custom_plan_pricing_step_qty_positive CHECK (step_qty > 0),
  CONSTRAINT custom_plan_pricing_min_qty_nonneg CHECK (min_qty >= 0)
);

INSERT INTO custom_plan_pricing (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('yearly_discount_percent', NULL, 20, 1, 0, 0, NULL, 1, TRUE, 0),
  ('zalo_monthly_capacity_per_account', NULL, 16000, 1, 0, 0, NULL, 1, TRUE, 0),
  ('base_fee', NULL, 199000, 1, 0, 1, 1, 1, TRUE, 10),
  ('zalo_messages', 'monthly_zalo_limit', 30000, 500, 500, 500, 200000, 500, TRUE, 20),
  ('emails', 'monthly_email_limit', 25000, 2500, 2500, 2500, 500000, 2500, TRUE, 30),
  ('ai_credits', 'ai_credits_per_period', 35000, 250, 250, 250, 50000, 250, TRUE, 40),
  ('zalo_accounts', 'max_zalo_accounts', 40000, 1, 1, 1, 50, 1, TRUE, 50),
  ('email_accounts', 'max_email_accounts', 40000, 1, 1, 1, 50, 1, TRUE, 60),
  ('landing_pages', 'max_landing_pages', 20000, 1, 1, 1, 200, 1, TRUE, 70),
  ('chatbots', 'max_chatbots', 70000, 1, 1, 1, 100, 1, TRUE, 80),
  ('employees', 'max_employees', 35000, 1, 1, 1, 100, 1, TRUE, 90),
  ('campaigns', 'max_campaigns', 10000, 1, 1, 1, 500, 1, TRUE, 100),
  ('zalo_campaigns', 'max_zalo_campaigns', 10000, 1, 0, 0, 200, 1, TRUE, 110),
  ('zalo_group_campaigns', 'max_zalo_group_campaigns', 10000, 1, 0, 0, 200, 1, TRUE, 120),
  ('email_campaigns', 'max_email_campaigns', 10000, 1, 0, 0, 200, 1, TRUE, 130),
  ('email_templates', 'max_email_templates', 8000, 1, 0, 0, 500, 1, TRUE, 140),
  ('zalo_templates', 'max_zalo_templates', 8000, 1, 0, 0, 500, 1, TRUE, 150),
  ('storage_gb', 'storage_limit_bytes', 15000, 1, 10, 10, 1000, 10, TRUE, 160);

-- Khớp production (PLAN_SCHEMA_BUOC2): id/plan_id int4, amount numeric,
-- status/payment_method varchar(50), FK ON DELETE NO ACTION (giữ lịch sử tiền).
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  order_code  BIGINT       NOT NULL,
  plan_id     INTEGER      REFERENCES plans(id),
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  user_email  VARCHAR(255),
  user_id     BIGINT       REFERENCES users(id),
  status      VARCHAR(50)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'cancelled', 'failed')),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'payos'
    CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher')),
  note        TEXT,
  billing_period VARCHAR(10) NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly')),
  original_amount NUMERIC(12, 2),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  voucher_id  BIGINT,
  voucher_code VARCHAR(64),
  discount_source VARCHAR(24)
    CHECK (
      discount_source IS NULL
      OR discount_source IN ('public_code', 'private_code', 'automatic')
    ),
  discount_label VARCHAR(160),
  topup_config JSONB,
  invoice_info JSONB,
  custom_plan_config JSONB,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_order_code_key UNIQUE (order_code)
);

CREATE INDEX idx_orders_plan_id    ON orders(plan_id);
CREATE INDEX idx_orders_user_id    ON orders(user_id);
CREATE INDEX idx_orders_order_code ON orders(order_code);

-- Electronic invoices (migration 121 + 124)
CREATE TABLE einvoices (
  id               BIGSERIAL PRIMARY KEY,
  order_id         INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ma_tra_cuu       VARCHAR(100) NOT NULL,
  mtchieu          VARCHAR(20)  NOT NULL,
  khmshdon         VARCHAR(20),
  khhdon           VARCHAR(20),
  ma_so_hdon       TEXT,
  so_hdon          VARCHAR(64),
  status           VARCHAR(32)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'issued', 'failed', 'cqt_ok', 'cqt_rejected')),
  cqt_code         VARCHAR(64),
  error_code       VARCHAR(64),
  error_message    TEXT,
  pdf_url          TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  issued_at        TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ,
  email_status     VARCHAR(24)
    CHECK (
      email_status IS NULL
      OR email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')
    ),
  email_attempt_count INTEGER NOT NULL DEFAULT 0,
  email_last_attempt_at TIMESTAMPTZ,
  email_next_attempt_at TIMESTAMPTZ,
  email_sent_at    TIMESTAMPTZ,
  email_last_error TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT einvoices_order_id_key UNIQUE (order_id),
  CONSTRAINT einvoices_ma_tra_cuu_key UNIQUE (ma_tra_cuu)
);

CREATE INDEX idx_einvoices_status_retry
  ON einvoices (status, error_code, updated_at);

CREATE INDEX idx_einvoices_worker_claim
  ON einvoices (status, next_attempt_at, updated_at);

CREATE INDEX idx_einvoices_email_worker
  ON einvoices (email_status, email_next_attempt_at, email_last_attempt_at);

-- Scheduled plan changes (migration 149)
CREATE TABLE scheduled_plan_changes (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  billing_period VARCHAR(10) NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  amount_paid   BIGINT NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','activated','superseded')),
  activate_after TIMESTAMPTZ NOT NULL,
  activated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_scheduled_plan_change_pending
  ON scheduled_plan_changes (user_id) WHERE status = 'pending';

-- ─── Top-up pricing & grants (migration 099) ───────────────────────────
CREATE TABLE topup_pricing (
  id           BIGSERIAL PRIMARY KEY,
  item_key     VARCHAR(50) UNIQUE NOT NULL,
  unit_price   BIGINT  NOT NULL DEFAULT 0,
  min_qty      INTEGER NOT NULL DEFAULT 0,
  step_qty     INTEGER NOT NULL DEFAULT 1,
  max_qty      INTEGER,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_pricing_unit_price_nonneg CHECK (unit_price >= 0),
  CONSTRAINT topup_pricing_min_qty_nonneg CHECK (min_qty >= 0),
  CONSTRAINT topup_pricing_step_qty_positive CHECK (step_qty > 0)
);

INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES
  ('zalo_messages', 100, 50, 50, NULL, TRUE, 10),
  ('emails', 20, 250, 250, 50000, TRUE, 20),
  ('ai_credits', 200, 25, 25, 5000, TRUE, 30),
  -- Món cấu trúc (migration 109). employees tắt từ migration 112 — giữ dòng
  -- nhưng is_active = FALSE để test "không bán nhân viên" vẫn có gì để kiểm.
  ('zalo_accounts',  50000, 1, 1, 50,  TRUE,  40),
  ('email_accounts', 50000, 1, 1, 50,  TRUE,  50),
  ('landing_pages',  30000, 1, 1, 200, TRUE,  60),
  ('chatbots',      100000, 1, 1, 100, TRUE,  70),
  ('employees',      50000, 1, 1, 100, FALSE, 80),
  ('storage_gb',     25000, 5, 5, 200, TRUE,  90);

CREATE TABLE topup_grants (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key   VARCHAR(50) NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cycle_end  TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_grants_order_item_unique UNIQUE (order_id, item_key)
);

CREATE INDEX idx_topup_grants_user_item_cycle
  ON topup_grants (user_id, item_key, cycle_end);

-- ─── Vouchers (migration 036) ──────────────────────────────────────────
CREATE TABLE vouchers (
  id                         BIGSERIAL PRIMARY KEY,
  code                       VARCHAR(64)  NOT NULL,
  name                       VARCHAR(160) NOT NULL,
  description                TEXT,
  discount_type              VARCHAR(20)  NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value             NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),
  max_discount_amount        NUMERIC(12, 2),
  min_order_amount           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  applies_to_plan_codes      TEXT[],
  applies_to_billing_periods TEXT[],
  starts_at                  TIMESTAMPTZ,
  ends_at                    TIMESTAMPTZ,
  usage_limit                INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 0),
  usage_limit_per_user       INTEGER CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user >= 0),
  used_count                 INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  auto_apply                 BOOLEAN NOT NULL DEFAULT FALSE,
  offer_mode                 VARCHAR(24) NOT NULL DEFAULT 'public_code'
    CHECK (offer_mode IN ('public_code', 'private_code', 'automatic')),
  stackable                  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vouchers_offer_mode_eligibility
  ON vouchers (offer_mode, is_active, starts_at, ends_at);

CREATE UNIQUE INDEX vouchers_code_active_uniq ON vouchers (code) WHERE is_active = TRUE;

CREATE INDEX idx_orders_voucher_pending
  ON orders (voucher_id, status, created_at)
  WHERE voucher_id IS NOT NULL;

ALTER TABLE orders
  ADD CONSTRAINT orders_voucher_fk FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL;

CREATE TABLE voucher_redemptions (
  id              BIGSERIAL PRIMARY KEY,
  voucher_id      BIGINT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_email      VARCHAR(255),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

-- ─── Email module (settings + templates) ──────────────────────────────
-- Schema tối thiểu để test CRUD email-settings và email-templates.
-- Các cột tracking nâng cao (sent_count counters, daily/hourly) đủ để test
-- side-effect của incrementSentCount.

CREATE TABLE email_settings (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  reply_to         VARCHAR(255),
  smtp_host        VARCHAR(255),
  smtp_port        INTEGER,
  smtp_username    VARCHAR(255),
  smtp_password    TEXT,
  email_mode       TEXT         NOT NULL DEFAULT 'platform',
  platform_prefix  VARCHAR(50)  NOT NULL DEFAULT 'no-reply',
  use_tls          BOOLEAN      NOT NULL DEFAULT TRUE,
  daily_limit      INTEGER      NOT NULL DEFAULT 1000,
  hourly_limit     INTEGER      NOT NULL DEFAULT 100,
  daily_sent_count INTEGER      NOT NULL DEFAULT 0,
  total_sent_count INTEGER      NOT NULL DEFAULT 0,
  is_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
  domain_verification_status VARCHAR(30) NOT NULL DEFAULT 'not_required',
  brand_domain     VARCHAR(255),
  domain_dns_records JSONB,
  domain_verified_at TIMESTAMPTZ,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_settings_user ON email_settings(id_user);
CREATE INDEX idx_email_settings_brand_domain
  ON email_settings(brand_domain)
  WHERE brand_domain IS NOT NULL;

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

CREATE TABLE template_labels (
  id                 BIGSERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  color              VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_labels_name_workspace_owner_key UNIQUE (name, workspace_owner_id)
);
CREATE INDEX idx_template_labels_workspace_owner ON template_labels(workspace_owner_id);

-- ─── Campaigns module ─────────────────────────────────────────────────
-- Bảng tối thiểu để test CRUD campaign + publish/pause/duplicate + run
-- create-record. KHÔNG cover execute (cần BullMQ + email/zalo senders).

CREATE TABLE campaigns (
  id                    BIGSERIAL PRIMARY KEY,
  id_user               BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id    BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  created_by            BIGINT       REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX idx_campaigns_workspace_owner ON campaigns(workspace_owner_id);
CREATE INDEX idx_campaigns_effective_workspace_owner ON campaigns((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by) WHERE created_by IS NOT NULL;
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
  workspace_owner_id BIGINT      REFERENCES users(id) ON DELETE CASCADE,
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
  skipped_sends     INTEGER      NOT NULL DEFAULT 0,
  error_message     TEXT,
  run_metadata      JSONB        NOT NULL DEFAULT '{}',
  triggered_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_runs_campaign ON campaign_runs(id_campaign);
CREATE INDEX idx_campaign_runs_workspace_owner ON campaign_runs(workspace_owner_id);
CREATE INDEX idx_campaign_runs_status ON campaign_runs(status);
CREATE INDEX idx_campaign_runs_triggered_by ON campaign_runs (triggered_by) WHERE triggered_by IS NOT NULL;

-- Campaign executions — log từng node được engine xử lý cho mỗi customer/run.
-- Bảng tối thiểu để GET /api/campaign-runs/:id không 500 khi chưa có run nào.
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

-- Campaign schedules (cron) — `id_schedule` trên campaign_runs trỏ về đây.
CREATE TABLE campaign_schedules (
  id              BIGSERIAL PRIMARY KEY,
  id_campaign     BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT    REFERENCES users(id) ON DELETE CASCADE,
  created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX idx_campaign_schedules_workspace_owner ON campaign_schedules(workspace_owner_id);
CREATE INDEX idx_campaign_schedules_created_by ON campaign_schedules(created_by) WHERE created_by IS NOT NULL;

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
  restore_fail_count INT NOT NULL DEFAULT 0,
  first_restore_fail_at TIMESTAMPTZ,
  last_restore_attempt_at TIMESTAMPTZ,
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

-- ─── Tracking short links ──────────────────────────────────────────────
-- Mã rút gọn `/t/:code` redirect 302 sang `destination_url`.
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

-- ─── Landing page leads ────────────────────────────────────────────────
-- Form lead landing public — không gắn với user (cấu trúc multi-tenant
-- shared trên trang public, không chia theo owner).
CREATE TABLE leads (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT,
  workspace_owner_id  BIGINT REFERENCES users(id) ON DELETE CASCADE,
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
  custom_fields       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT leads_custom_fields_object_check CHECK (jsonb_typeof(custom_fields) = 'object')
);
CREATE INDEX idx_leads_slug ON leads(landing_page_slug);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_user ON leads(id_user);
CREATE INDEX idx_leads_workspace_owner ON leads(workspace_owner_id);
CREATE INDEX idx_leads_effective_workspace_owner ON leads((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Landing page events — view/click/submit tracking cho landing page.
-- LeadService.createPublicLead ghi 1 event 'submit' nếu có slug.
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

-- ─── Customers (Batch B) ──────────────────────────────────────────────
-- Bảng khách hàng end-user (target list cho campaign). Multi-tenant theo id_user.
CREATE TABLE customers (
  id                      BIGSERIAL PRIMARY KEY,
  id_user                 BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id      BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  created_by              BIGINT       REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX idx_customers_workspace_owner ON customers(workspace_owner_id);
CREATE INDEX idx_customers_effective_workspace_owner ON customers((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_customers_created_by ON customers(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ─── Courses (WooCommerce sync) ────────────────────────────────────────
CREATE TABLE courses (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT       REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT    REFERENCES users(id) ON DELETE CASCADE,
  created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX idx_courses_workspace_owner ON courses(workspace_owner_id);
CREATE INDEX idx_courses_effective_workspace_owner ON courses((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_courses_created_by ON courses(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_courses_code       ON courses(course_code);
CREATE INDEX idx_courses_product_id ON courses(product_id);

-- ─── Products (user-managed) ─────────────────────────────────────────
CREATE TABLE products (
  id              SERIAL PRIMARY KEY,
  id_user         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  product_code    VARCHAR(100),
  product_name    VARCHAR(255) NOT NULL,
  price           VARCHAR(100),
  original_price  VARCHAR(100),
  description     TEXT,
  usp             TEXT,
  category        VARCHAR(255),
  thumbnail_url   TEXT,
  product_url     TEXT,
  target_audience TEXT,
  status          VARCHAR(50) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_id_user ON products(id_user);
CREATE INDEX idx_products_workspace_owner ON products(workspace_owner_id);
CREATE INDEX idx_products_effective_workspace_owner ON products((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_products_created_by ON products(created_by) WHERE created_by IS NOT NULL;

-- ─── Email messages — outbound emails (tracking ready) ─────────────────
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
  from_address            VARCHAR(255),
  reply_to                VARCHAR(255),
  brand_domain            VARCHAR(255),
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
CREATE INDEX idx_email_messages_brand_domain
  ON email_messages(brand_domain)
  WHERE brand_domain IS NOT NULL;

-- ─── Zalo messages — outbound (group/person) ───────────────────────────
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
  account_id          BIGINT,
  account_name        VARCHAR(255),
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
CREATE INDEX idx_zalo_messages_account_created
  ON zalo_messages (account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- ─── Campaign-customer pivot ───────────────────────────────────────────
-- Theo dõi tham gia + counters tương tác per (campaign, customer).
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

-- ─── Campaign participation (1-1 record per campaign+customer) ─────────
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

-- ─── Customer purchases (order from WooCommerce or campaign-attributed) ─
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

-- ─── Customer journey — event log (open/click/purchase/etc.) ───────────
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
  event_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_journey_customer ON customer_journey(id_customer);
CREATE INDEX idx_customer_journey_campaign ON customer_journey(id_campaign);
CREATE INDEX idx_customer_journey_created_at ON customer_journey(created_at DESC);
CREATE INDEX idx_customer_journey_event_at ON customer_journey(event_at);

-- ─── Template files (attachments) ──────────────────────────────────────
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

-- ─── File access events (download tracking) ────────────────────────────
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

-- ─── Usage tracking (migration 033) ───────────────────────────────────
CREATE TABLE usage_logs (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resource_type VARCHAR(50) NOT NULL,
  delta         INTEGER NOT NULL DEFAULT 1,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_logs_user ON usage_logs(id_user);
CREATE INDEX idx_usage_logs_resource ON usage_logs(resource_type);
CREATE INDEX idx_usage_logs_period ON usage_logs(period_start, period_end);
CREATE INDEX idx_usage_logs_actor ON usage_logs (actor_user_id) WHERE actor_user_id IS NOT NULL;

-- ─── Dashboard insights (Gemini AI persistence) ───────────────────────
CREATE TABLE dashboard_insights (
  id                BIGSERIAL PRIMARY KEY,
  id_user           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload           JSONB       NOT NULL,
  filters_snapshot  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dashboard_insights_user ON dashboard_insights(id_user);

-- ─── Landing pages (CMS + dashboard stats source) ──────────────────────
CREATE TABLE landing_pages (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  slug          VARCHAR(100) NOT NULL,
  title         VARCHAR(500),
  html_content  TEXT         NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
  is_published  BOOLEAN      NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  domain_type   VARCHAR(20)  NOT NULL DEFAULT 'system'
    CHECK (domain_type IN ('system', 'custom')),
  domain_subtype VARCHAR(20) DEFAULT NULL
    CHECK (domain_subtype IS NULL OR domain_subtype IN ('subdomain', 'apex')),
  custom_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_landing_pages_user ON landing_pages(id_user);
CREATE INDEX idx_landing_pages_workspace_owner ON landing_pages(workspace_owner_id);
CREATE INDEX idx_landing_pages_effective_workspace_owner ON landing_pages((COALESCE(workspace_owner_id, id_user)));
CREATE INDEX idx_landing_pages_created_by ON landing_pages(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_landing_pages_slug ON landing_pages(slug);

CREATE TABLE landing_page_domains (
  id                 BIGSERIAL PRIMARY KEY,
  landing_page_id    BIGINT NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  hostname           TEXT NOT NULL,
  domain_type        VARCHAR(20) NOT NULL DEFAULT 'subdomain'
    CHECK (domain_type IN ('subdomain', 'apex', 'external')),
  is_apex_domain     BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending_verification',
  cf_managed         BOOLEAN NOT NULL DEFAULT FALSE,
  cf_zone_id         TEXT,
  cf_record_id       TEXT,
  cf_hostname_id     VARCHAR(100),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at        TIMESTAMPTZ,
  CONSTRAINT chk_landing_page_domains_status CHECK (status IN ('pending_verification', 'active', 'disabled'))
);
CREATE UNIQUE INDEX uq_landing_page_domains_landing_page_id ON landing_page_domains(landing_page_id);
CREATE UNIQUE INDEX uq_landing_page_domains_hostname_lower ON landing_page_domains(LOWER(hostname));

-- ─── Custom domains & SSL (migration 019) ──────────────────────────────
CREATE TABLE IF NOT EXISTS custom_domains (
  id                  SERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landing_page_id     BIGINT REFERENCES landing_pages(id) ON DELETE SET NULL,
  domain              VARCHAR(255) NOT NULL,
  subdomain           VARCHAR(128),
  status              VARCHAR(30) DEFAULT 'pending',
  verification_status VARCHAR(20) DEFAULT 'pending',
  verification_token  VARCHAR(255),
  verification_method VARCHAR(20) DEFAULT 'txt',
  ssl_status          VARCHAR(20) DEFAULT 'pending',
  ssl_cert_arn        VARCHAR(255),
  ssl_expires_at      TIMESTAMPTZ,
  dns_config          JSONB DEFAULT '{}',
  cname_target        VARCHAR(255),
  is_primary          BOOLEAN DEFAULT true,
  is_verified         BOOLEAN DEFAULT false,
  is_active           BOOLEAN DEFAULT true,
  error_message       TEXT,
  last_checked_at     TIMESTAMPTZ,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_domain UNIQUE (user_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_custom_domains_user ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
CREATE INDEX IF NOT EXISTS idx_custom_domains_landing_page ON custom_domains(landing_page_id);

CREATE TABLE IF NOT EXISTS custom_domain_verifications (
  id                 SERIAL PRIMARY KEY,
  domain_id          BIGINT NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE,
  verification_type  VARCHAR(20) NOT NULL,
  verification_token VARCHAR(255),
  status             VARCHAR(20) NOT NULL,
  checked_at         TIMESTAMPTZ DEFAULT NOW(),
  response_data      JSONB
);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain ON custom_domain_verifications(domain_id);

CREATE TABLE IF NOT EXISTS custom_domain_ssl (
  id                 SERIAL PRIMARY KEY,
  domain_id          BIGINT NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE,
  cert_arn           VARCHAR(255),
  cert_type          VARCHAR(20) DEFAULT 'letsencrypt',
  status             VARCHAR(20) DEFAULT 'pending',
  issued_at          TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_domain_ssl_domain ON custom_domain_ssl(domain_id);

ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS custom_domain_id INTEGER REFERENCES custom_domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_landing_pages_custom_domain ON landing_pages(custom_domain_id);

-- ─── Landing page templates, overrides & sections (migration 018, 082, 084) ───
CREATE TABLE IF NOT EXISTS landing_page_templates (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(50) NOT NULL,
  thumbnail_url  TEXT,
  description    TEXT,
  html_structure TEXT NOT NULL,
  css_variables  JSONB DEFAULT '{}',
  default_config JSONB DEFAULT '{}',
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lp_templates_category ON landing_page_templates(category);
CREATE INDEX IF NOT EXISTS idx_lp_templates_active ON landing_page_templates(is_active);

CREATE TABLE IF NOT EXISTS landing_page_overrides (
  id         SERIAL PRIMARY KEY,
  page       VARCHAR(50) NOT NULL CHECK (page IN ('hero', 'contact', 'pricing')),
  section    VARCHAR(100) NOT NULL,
  key        VARCHAR(100) NOT NULL,
  value_vi   TEXT,
  value_en   TEXT,
  extra_data JSONB,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(page, section, key)
);
CREATE INDEX IF NOT EXISTS idx_landing_overrides_page ON landing_page_overrides(page);
CREATE INDEX IF NOT EXISTS idx_landing_overrides_active ON landing_page_overrides(is_active);

CREATE TABLE IF NOT EXISTS landing_page_sections (
  id           SERIAL PRIMARY KEY,
  page         VARCHAR(50) NOT NULL,
  section      VARCHAR(50) NOT NULL,
  html_content TEXT,
  css_content  TEXT,
  config       JSONB DEFAULT '{}',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page, section)
);
CREATE INDEX IF NOT EXISTS idx_landing_sections_page ON landing_page_sections(page);
CREATE INDEX IF NOT EXISTS idx_landing_sections_page_section ON landing_page_sections(page, section);

-- ─── Landing featured courses (Batch C CMS) ────────────────────────────
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

-- ─── Landing testimonials (Batch C CMS) ────────────────────────────────
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

-- ─── Zalo accounts (minimal for delivery monitor tests) ────────────────
CREATE TABLE zalo_accounts (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  status     VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_zalo_accounts_user ON zalo_accounts(id_user);

-- ─── Zalo unreachable phones (minimal for delivery monitor tests) ───────
CREATE TABLE zalo_unreachable_phones (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  phone_normalized VARCHAR(20) NOT NULL,
  reason           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Campaign run recipient steps (minimal for delivery monitor tests) ──
CREATE TABLE campaign_run_recipient_steps (
  id                 BIGSERIAL PRIMARY KEY,
  id_campaign_run    BIGINT REFERENCES campaign_runs(id) ON DELETE CASCADE,
  id_run             BIGINT REFERENCES campaign_runs(id) ON DELETE CASCADE,
  id_campaign        BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
  id_node            VARCHAR(100),
  channel            VARCHAR(50),
  recipient_key      TEXT,
  last_completed_step INTEGER NOT NULL DEFAULT 0,
  meta               JSONB NOT NULL DEFAULT '{}',
  is_fully_completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_sent_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_crrs_campaign_run ON campaign_run_recipient_steps(id_campaign_run);
CREATE INDEX idx_crrs_id_run ON campaign_run_recipient_steps(id_run);
CREATE UNIQUE INDEX uq_crrs_progress
  ON campaign_run_recipient_steps(id_run, id_node, channel, recipient_key)
  WHERE id_run IS NOT NULL AND id_node IS NOT NULL AND channel IS NOT NULL AND recipient_key IS NOT NULL;

-- ─── Audit logs ─────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  id_user     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  category    VARCHAR(20) NOT NULL DEFAULT 'workspace',
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   BIGINT,
  details     JSONB DEFAULT '{}',
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_id_user    ON audit_logs(id_user);
CREATE INDEX idx_audit_logs_owner_id   ON audit_logs(owner_id);
CREATE INDEX idx_audit_logs_category   ON audit_logs(category);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);

-- ─── Web chat / custom chatbot ─────────────────────────────────────────
-- Cần cho test widget + hội thoại web chat. Phải khớp migration 031/041/095/098:
-- nếu lệch thì test xanh giả (đúng bài học lệch schema đã dính hai lần).

-- Chỉ dựng cột tối thiểu mà repository JOIN tới.
-- Di chuyển LÊN TRƯỚC zalo_personal_conversations (migration 168 thêm FK tới
-- custom_chatbots.id trong CREATE TABLE) — nếu để sau, Postgres báo
-- "relation custom_chatbots does not exist" khi bootstrap.sql chạy.
CREATE TABLE IF NOT EXISTS sub_assistants (
  id           BIGSERIAL PRIMARY KEY,
  id_user      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(255),
  description  TEXT,
  greeting_msg TEXT,
  avatar_url   TEXT,
  is_active    BOOLEAN DEFAULT true,
  settings     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_chatbots (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL DEFAULT 'New Chatbot',
  description         TEXT DEFAULT '',
  system_instruction  TEXT DEFAULT '',
  greeting_msg        TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  avatar_url          TEXT DEFAULT NULL,
  is_active           BOOLEAN DEFAULT true,
  theme_color         VARCHAR(7) DEFAULT '#6366F1',
  position            VARCHAR(20) DEFAULT 'bottom-right',
  welcome_message     TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  primary_color       VARCHAR(7) DEFAULT '#6366F1',
  background_color    VARCHAR(7) DEFAULT '#FFFFFF',
  text_color          VARCHAR(7) DEFAULT '#1F2937',
  accent_color        VARCHAR(7) DEFAULT '#60A5FA',
  logo_url            TEXT DEFAULT NULL,
  show_avatar         BOOLEAN DEFAULT true,
  border_radius       INTEGER DEFAULT 16,
  chat_height         VARCHAR(10) DEFAULT '600px',
  suggested_questions TEXT[] DEFAULT '{}',
  widget_key          VARCHAR(100) UNIQUE DEFAULT NULL,
  temperature         DECIMAL(3,2) DEFAULT 0.7,
  max_tokens          INTEGER DEFAULT 2048,
  ai_model            VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  allow_attachments   BOOLEAN NOT NULL DEFAULT FALSE,
  reply_limit_config  JSONB NOT NULL DEFAULT '{"version":1,"windows":{}}'::jsonb
    CHECK (jsonb_typeof(reply_limit_config) = 'object'),
  -- Migration 155: chatbot origin tracking (self_created, marketplace_purchased, shared)
  origin VARCHAR(50) DEFAULT 'self_created',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 155: Index for filtering by origin
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_origin ON custom_chatbots(origin) WHERE is_active = true;

-- Migration 155: Update existing chatbots to self_created
UPDATE custom_chatbots SET origin = 'self_created' WHERE origin IS NULL OR origin = '';

-- ─── Zalo personal unified inbox (migration 045) ───────────────────────
-- Khớp migration 045: is_group/group_id nằm trong visitor_info JSONB, không phải cột.
-- Migration 168: id_chatbot được gắn vào conversation để cô lập per-chatbot khi 1 zalo share nhiều chatbot.
CREATE TABLE IF NOT EXISTS zalo_personal_conversations (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  id_chatbot       BIGINT REFERENCES custom_chatbots(id) ON DELETE SET NULL,
  external_id      VARCHAR(255) NOT NULL,
  visitor_name     VARCHAR(255),
  visitor_info     JSONB DEFAULT '{}',
  status           VARCHAR(20) DEFAULT 'active',
  ai_paused        BOOLEAN NOT NULL DEFAULT false,
  ai_paused_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_message_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_zalo_personal_conv UNIQUE (id_zalo_setting, external_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_chatbot
  ON zalo_personal_conversations (id_user, id_zalo_setting, id_chatbot)
  WHERE id_chatbot IS NOT NULL;

CREATE TABLE IF NOT EXISTS zalo_personal_messages (
  id               BIGSERIAL PRIMARY KEY,
  id_conversation  BIGINT NOT NULL REFERENCES zalo_personal_conversations(id) ON DELETE CASCADE,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  role             VARCHAR(20) NOT NULL,
  content          TEXT NOT NULL,
  message_type     VARCHAR(20) DEFAULT 'text',
  external_id      VARCHAR(255),
  external_ts      TIMESTAMPTZ,
  attachments      JSONB DEFAULT '[]',
  metadata         JSONB DEFAULT '{}',
  is_read          BOOLEAN DEFAULT false,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_quota_count
  ON zalo_personal_messages (id_user, created_at)
  WHERE role = 'agent' AND (metadata->>'source') = 'manual_inbox';
-- Migration 101: prevent duplicate inbound / sync rows (and bot echo after restart)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_zalo_personal_msg_external
  ON zalo_personal_messages (id_zalo_setting, external_id)
  WHERE external_id IS NOT NULL;

-- ─── Chatbot settings (migration 031) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_settings (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  channel          VARCHAR(20) NOT NULL,
  is_enabled       BOOLEAN DEFAULT true,
  welcome_message  TEXT,
  ai_model         VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  temperature      DECIMAL(3,2) DEFAULT 0.7,
  max_tokens       INTEGER DEFAULT 2048,
  response_style   VARCHAR(20) DEFAULT 'friendly',
  settings         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chatbot_user_channel UNIQUE (id_user, channel)
);

-- ─── Channel connections (migration 031, 042) ──────────────────────────
CREATE TABLE IF NOT EXISTS channel_connections (
  id                  BIGSERIAL PRIMARY KEY,
  id_user             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel             VARCHAR(20) NOT NULL,
  display_name        VARCHAR(255),
  is_active           BOOLEAN DEFAULT true,
  credentials         JSONB DEFAULT '{}',
  webhook_url         TEXT,
  settings            JSONB DEFAULT '{}',
  webhook_token       VARCHAR(64) UNIQUE,
  external_channel_id VARCHAR(128),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_channel_user_channel UNIQUE (id_user, channel)
);
CREATE INDEX IF NOT EXISTS idx_channel_conn_user ON channel_connections(id_user);
CREATE INDEX IF NOT EXISTS idx_channel_conn_channel ON channel_connections(channel);
CREATE INDEX IF NOT EXISTS idx_channel_connections_webhook_token ON channel_connections(webhook_token) WHERE webhook_token IS NOT NULL;

-- ─── Channel conversations & messages (migration 031, 032, 095) ────────
CREATE TABLE IF NOT EXISTS channel_conversations (
  id              BIGSERIAL PRIMARY KEY,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_channel      BIGINT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  channel         VARCHAR(20) DEFAULT NULL,
  external_id     VARCHAR(255),
  visitor_name    VARCHAR(255),
  visitor_info    JSONB DEFAULT '{}',
  status          VARCHAR(20) DEFAULT 'active',
  ai_paused       BOOLEAN NOT NULL DEFAULT false,
  ai_paused_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_channel_external_id UNIQUE (id_channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_conv_user ON channel_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_channel_conv_channel ON channel_conversations(id_channel);
CREATE INDEX IF NOT EXISTS idx_channel_conversations_status ON channel_conversations(status);
CREATE INDEX IF NOT EXISTS idx_channel_conversations_last_message ON channel_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_conv_user_status ON channel_conversations(id_user, status);

CREATE TABLE IF NOT EXISTS channel_messages (
  id              BIGSERIAL PRIMARY KEY,
  id_conversation BIGINT NOT NULL REFERENCES channel_conversations(id) ON DELETE CASCADE,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_channel      BIGINT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,
  content         TEXT NOT NULL,
  message_type    VARCHAR(20) DEFAULT 'text',
  external_id     VARCHAR(255),
  external_ts     TIMESTAMPTZ,
  attachments     JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  raw_data        JSONB DEFAULT NULL,
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_conv ON channel_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(id_channel);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  is_active        BOOLEAN DEFAULT true,
  chunking_mode    VARCHAR(20) DEFAULT 'paragraph',
  chunk_size       INTEGER DEFAULT 500,
  settings         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id              BIGSERIAL PRIMARY KEY,
  id_kb           BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(500),
  source_type     VARCHAR(20) NOT NULL,
  source_url      TEXT,
  content_text    TEXT,
  file_name       VARCHAR(500),
  file_size       BIGINT,
  mime_type       VARCHAR(100),
  status          VARCHAR(20) DEFAULT 'pending',
  error_message   TEXT,
  chunk_count     INTEGER DEFAULT 0,
  extracted_chars BIGINT NOT NULL DEFAULT 0 CHECK (extracted_chars >= 0),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kb_documents_owner_usage
  ON kb_documents(id_user, status, extracted_chars);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id          BIGSERIAL PRIMARY KEY,
  id_document BIGINT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  id_kb       BIGINT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  id_user     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  embedding   JSONB,
  chunk_index INTEGER,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_chatbot_documents (
  id              BIGSERIAL PRIMARY KEY,
  chatbot_id      BIGINT NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  owner_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     VARCHAR(20) NOT NULL CHECK (source_type IN ('file', 'text', 'url')),
  source_key      VARCHAR(500) NOT NULL,
  title           VARCHAR(500),
  content_text    TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message   TEXT,
  extracted_chars BIGINT NOT NULL DEFAULT 0 CHECK (extracted_chars >= 0),
  chunk_count     INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chatbot_id, source_key)
);
CREATE INDEX idx_custom_chatbot_documents_owner_usage
  ON custom_chatbot_documents(owner_user_id, status, extracted_chars);

CREATE TABLE IF NOT EXISTS custom_chatbot_chunks (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT REFERENCES custom_chatbot_documents(id) ON DELETE CASCADE,
  chatbot_id  BIGINT NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  embedding   JSONB,
  chunk_index INTEGER NOT NULL,
  source      VARCHAR(500),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_custom_chatbot_chunks_document
  ON custom_chatbot_chunks(document_id, chunk_index);

CREATE TABLE IF NOT EXISTS chatbot_studio_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_user         BIGINT REFERENCES users(id) ON DELETE CASCADE,
  id_chatbot      BIGINT NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  session_id      VARCHAR(128) UNIQUE,
  title           VARCHAR(255),
  status          VARCHAR(32) DEFAULT 'active',
  message_count   INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_conv_user
  ON chatbot_studio_conversations(id_user);
CREATE INDEX IF NOT EXISTS idx_studio_conv_chatbot
  ON chatbot_studio_conversations(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_studio_conv_session
  ON chatbot_studio_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_conv_status
  ON chatbot_studio_conversations(id_user, status);
CREATE INDEX IF NOT EXISTS idx_studio_conv_last_msg
  ON chatbot_studio_conversations(id_user, last_message_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_studio_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conversation  UUID NOT NULL REFERENCES chatbot_studio_conversations(id) ON DELETE CASCADE,
  role             VARCHAR(32) NOT NULL,
  content          TEXT,
  message_type     VARCHAR(32) DEFAULT 'text',
  ai_model         VARCHAR(64),
  ai_tokens_used   INTEGER,
  ai_latency_ms    INTEGER,
  attachments      JSONB DEFAULT '[]',
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_msg_conv
  ON chatbot_studio_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_studio_msg_created
  ON chatbot_studio_messages(id_conversation, created_at DESC);

-- ─── Chatbot channel connections (migration 043) ───────────────────────
CREATE TABLE IF NOT EXISTS chatbot_channel_connections (
  id                  SERIAL PRIMARY KEY,
  id_chatbot          INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  channel_type        VARCHAR(32) NOT NULL CHECK (channel_type IN ('zalo_oa', 'facebook')),
  credentials         JSONB NOT NULL DEFAULT '{}',
  webhook_token       VARCHAR(64) UNIQUE NOT NULL,
  webhook_url         TEXT,
  display_name        VARCHAR(255),
  external_channel_id VARCHAR(128),
  is_active           BOOLEAN DEFAULT true,
  connected_at        TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at    TIMESTAMPTZ,
  settings            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_chatbot, channel_type)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_chatbot ON chatbot_channel_connections(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_token ON chatbot_channel_connections(webhook_token);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_type ON chatbot_channel_connections(channel_type);
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_active ON chatbot_channel_connections(id_chatbot, channel_type, is_active) WHERE is_active = true;

-- ─── Chatbot conversations & messages (migration 044) ──────────────────
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id              SERIAL PRIMARY KEY,
  id_chatbot      INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  id_channel      INTEGER REFERENCES chatbot_channel_connections(id) ON DELETE SET NULL,
  channel_type    VARCHAR(32) DEFAULT 'web',
  external_id     VARCHAR(128),
  source          VARCHAR(32),
  visitor_name    VARCHAR(255),
  visitor_info    JSONB DEFAULT '{}',
  status          VARCHAR(32) DEFAULT 'active',
  unread_count    INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_chatbot ON chatbot_conversations(id_chatbot);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_channel ON chatbot_conversations(id_channel);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_external ON chatbot_conversations(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_status ON chatbot_conversations(id_chatbot, status);

CREATE TABLE IF NOT EXISTS chatbot_messages (
  id              SERIAL PRIMARY KEY,
  id_conversation INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(32) NOT NULL,
  content         TEXT,
  message_type    VARCHAR(32) DEFAULT 'text',
  external_id     VARCHAR(128),
  external_ts     TIMESTAMPTZ,
  attachments     JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  ai_model        VARCHAR(64),
  ai_tokens_used  INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conv ON chatbot_messages(id_conversation);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_created ON chatbot_messages(id_conversation, created_at DESC);

-- ─── Chatbot Zalo account settings (migration 052) ─────────────────────
CREATE TABLE IF NOT EXISTS chatbot_zalo_account_settings (
  id                 BIGSERIAL PRIMARY KEY,
  id_user            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_zalo_setting    BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  is_enabled         BOOLEAN DEFAULT false,
  id_sub_assistant   BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  welcome_message    TEXT,
  ai_model           VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  temperature        DECIMAL(3,2) DEFAULT 0.7,
  max_tokens         INTEGER DEFAULT 2048,
  response_style     VARCHAR(20) DEFAULT 'friendly',
  system_instruction TEXT,
  settings           JSONB DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chatbot_zalo_account UNIQUE (id_user, id_zalo_setting)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_account_user ON chatbot_zalo_account_settings(id_user);
CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_account_setting ON chatbot_zalo_account_settings(id_zalo_setting);

CREATE TABLE IF NOT EXISTS web_widget_configs (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_sub_assistant BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  widget_key       VARCHAR(100) UNIQUE NOT NULL,
  display_name     VARCHAR(255),
  theme_color      VARCHAR(7) DEFAULT '#3B82F6',
  position         VARCHAR(20) DEFAULT 'bottom-right',
  welcome_message  TEXT,
  is_active        BOOLEAN DEFAULT true,
  allowed_domains  TEXT[],
  settings         JSONB DEFAULT '{}',
  logo_url         TEXT,
  primary_color    VARCHAR(7) DEFAULT '#3B82F6',
  background_color VARCHAR(7) DEFAULT '#FFFFFF',
  text_color       VARCHAR(7) DEFAULT '#1F2937',
  accent_color     VARCHAR(7) DEFAULT '#60A5FA',
  suggested_questions TEXT[] DEFAULT '{}',
  border_radius    INTEGER DEFAULT 16,
  show_avatar      BOOLEAN DEFAULT true,
  chat_height      VARCHAR(10) DEFAULT '500px',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webchat_conversations (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_widget_config BIGINT NOT NULL REFERENCES web_widget_configs(id) ON DELETE CASCADE,
  widget_key       VARCHAR(100),
  session_id       VARCHAR(120),
  visitor_name     VARCHAR(255),
  visitor_email    VARCHAR(255),
  visitor_info     JSONB DEFAULT '{}',
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_message_at  TIMESTAMPTZ DEFAULT NOW(),
  status           VARCHAR(20) DEFAULT 'active',
  ai_paused        BOOLEAN NOT NULL DEFAULT false,
  ai_paused_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 098 B5: chặn phân mảnh phiên đang hoạt động.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_webchat_active_session
  ON webchat_conversations (id_widget_config, session_id)
  WHERE session_id IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS webchat_messages (
  id              BIGSERIAL PRIMARY KEY,
  id_conversation BIGINT NOT NULL REFERENCES webchat_conversations(id) ON DELETE CASCADE,
  id_user         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,
  content         TEXT NOT NULL,
  attachments     JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webchat_messages_conv ON webchat_messages(id_conversation);

-- Media library (migration 117)
CREATE TABLE IF NOT EXISTS chat_attachments (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source           VARCHAR(24) NOT NULL
                   CHECK (source IN ('chatbot_web', 'chatbot_studio', 'ai_assistant', 'inbox_outbound')),
  storage_key      TEXT NOT NULL UNIQUE,
  display_name     VARCHAR(255),
  mime_type        VARCHAR(120),
  size_bytes       BIGINT,
  conversation_ref VARCHAR(64),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);
ALTER TABLE chat_attachments
  ADD COLUMN IF NOT EXISTS storage_object_id BIGINT REFERENCES storage_objects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_attachments_user
  ON chat_attachments (id_user, created_at DESC);

-- ─── Help center (migration 100) ───────────────────────────────────────
-- Production dùng pgvector (migration 100). Bootstrap test dùng JSONB để
-- chạy được trên postgres thuần (e2e image có thể chưa gắn pgvector).
-- Repository tự phát hiện kiểu cột và chọn đường insert/search phù hợp.

CREATE TABLE help_articles (
  id             BIGSERIAL PRIMARY KEY,
  slug           VARCHAR(120) NOT NULL,
  title          VARCHAR(255) NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  body_md        TEXT NOT NULL DEFAULT '',
  body_html      TEXT,
  feature_key    VARCHAR(80) NOT NULL,
  primary_route  VARCHAR(255),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  locale         VARCHAR(5) NOT NULL DEFAULT 'vi',
  is_stale       BOOLEAN NOT NULL DEFAULT FALSE,
  source_locale  VARCHAR(5),
  translated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT help_articles_slug_locale_key UNIQUE (slug, locale)
);

CREATE INDEX idx_help_articles_feature ON help_articles (feature_key, sort_order);
CREATE INDEX idx_help_articles_published ON help_articles (is_published) WHERE is_published = TRUE;
CREATE INDEX idx_help_articles_locale ON help_articles (locale, is_published);

CREATE TABLE help_article_media (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('image', 'video')),
  url         TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_help_article_media_article ON help_article_media (article_id, sort_order);

CREATE TABLE help_article_chunks (
  id            BIGSERIAL PRIMARY KEY,
  article_id    BIGINT NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content_text  TEXT NOT NULL,
  embedding     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT help_article_chunks_unique UNIQUE (article_id, chunk_index)
);

CREATE INDEX idx_help_article_chunks_article ON help_article_chunks (article_id);

CREATE TABLE help_unanswered (
  id              BIGSERIAL PRIMARY KEY,
  question        TEXT NOT NULL,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  top_similarity  REAL
);

CREATE INDEX idx_help_unanswered_asked ON help_unanswered (asked_at DESC);

-- ─── Alerts + cron status (migration 104) ──────────────────────────────
CREATE TABLE alert_rules (
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

INSERT INTO alert_rules (code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config)
VALUES (
  'payos_reconcile_rescued',
  'Đối soát PayOS cứu được đơn đã trả',
  'Cron đối soát tìm thấy đơn PAID mà webhook chưa kích hoạt',
  1, NULL, 'email', 'critical', 30,
  '{"jobCode": "payos_order_reconcile"}'::jsonb
);

INSERT INTO alert_rules (code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config)
VALUES (
  'einvoice_series_low',
  'Dải số hoá đơn Mắt Bão sắp hết hoặc sai năm',
  'Số lượng hoá đơn còn lại dưới ngưỡng hoặc ký hiệu hoá đơn không khớp năm hiện tại',
  50, NULL, 'email', 'critical', 360,
  '{"jobCode": "einvoice_series_check"}'::jsonb
);

INSERT INTO alert_rules (code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config)
VALUES (
  'einvoice_stuck',
  'Hoá đơn điện tử kẹt — đã thu tiền, chưa xuất được',
  'Hoá đơn hỏng hẳn (cron không tự thử lại) hoặc đọng quá lâu ở trạng thái chờ',
  1, NULL, 'email', 'critical', 720,
  '{"staleHours": 6}'::jsonb
);

CREATE TABLE alert_events (
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
CREATE INDEX idx_alert_events_rule_fired ON alert_events (rule_id, fired_at DESC);
CREATE INDEX idx_alert_events_unresolved ON alert_events (resolved, fired_at DESC) WHERE resolved = FALSE;

CREATE TABLE cron_job_runs (
  id             BIGSERIAL PRIMARY KEY,
  job_code       VARCHAR(64) NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  duration_ms    INT,
  status         VARCHAR(32) NOT NULL,
  result         JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message  TEXT
);
CREATE INDEX idx_cron_job_runs_job_started ON cron_job_runs (job_code, started_at DESC);

-- ─── Marketplace (migration 108) ──────────────────────────────────────
CREATE TABLE marketplace_listings (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('campaign', 'chatbot')),
    resource_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    tags TEXT[],
    price_credits INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'team')),
    view_count INTEGER DEFAULT 0,
    purchase_count INTEGER DEFAULT 0,
    rating_avg DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_listings_status ON marketplace_listings(status);
CREATE INDEX idx_listings_type ON marketplace_listings(resource_type);
CREATE INDEX idx_listings_category ON marketplace_listings(category);
CREATE INDEX idx_listings_rating ON marketplace_listings(rating_avg DESC);
CREATE INDEX idx_listings_user ON marketplace_listings(id_user);

CREATE TABLE marketplace_purchases (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    seller_id BIGINT NOT NULL REFERENCES users(id),
    credits_spent INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'refund')),
    cloned_resource_id BIGINT,
    cloned_resource_type VARCHAR(20),
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_user, listing_id)
);

CREATE INDEX idx_purchases_user ON marketplace_purchases(id_user);
CREATE INDEX idx_purchases_listing ON marketplace_purchases(listing_id);
CREATE INDEX idx_purchases_seller ON marketplace_purchases(seller_id);

CREATE TABLE marketplace_reviews (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_user, listing_id)
);

CREATE INDEX idx_reviews_listing ON marketplace_reviews(listing_id);
CREATE INDEX idx_reviews_user ON marketplace_reviews(id_user);

CREATE TABLE marketplace_favorites (
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id_user, listing_id)
);

CREATE INDEX idx_favorites_user ON marketplace_favorites(id_user);
CREATE INDEX idx_favorites_listing ON marketplace_favorites(listing_id);

-- ─── Schema migrations tracker ─────────────────────────────────────────
-- Tạo sẵn để migrationRunner không tự tạo + đánh dấu là đã chạy hết.
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  ran_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Top-up wallet (migrations 110/111) ──────────────────────────────────
-- cycle_end NULL = ví vĩnh viễn (consumable). Có giá trị = structural.
ALTER TABLE topup_grants ALTER COLUMN cycle_end DROP NOT NULL;

-- Món tiêu hao KHÔNG được có hạn — ghi sai thì lỗi ngay tại chỗ ghi (migration 110).
ALTER TABLE topup_grants
  ADD CONSTRAINT topup_grants_consumable_no_expiry CHECK (
    item_key NOT IN ('zalo_messages', 'emails', 'ai_credits')
    OR cycle_end IS NULL
  );

CREATE TABLE IF NOT EXISTS topup_debits (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key    VARCHAR(50) NOT NULL,
  qty         INTEGER     NOT NULL CHECK (qty > 0),
  source_key  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_debits_source_unique UNIQUE (item_key, source_key)
);

CREATE INDEX IF NOT EXISTS idx_topup_debits_user_item
  ON topup_debits (user_id, item_key);

CREATE TABLE IF NOT EXISTS topup_locked_resources (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_key  VARCHAR(50) NOT NULL,
  resource_id   BIGINT      NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_locked_unique UNIQUE (resource_key, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_topup_locked_user
  ON topup_locked_resources (user_id, resource_key);

-- ─── Misc columns required by newer services ────────────────────────────
-- usage_tracking.findProfileUsageCounts cần cj.campaign_id
ALTER TABLE customer_journey ADD COLUMN IF NOT EXISTS campaign_id BIGINT;

-- Plans AI tokens pricing (migration 064)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_tokens_per_period INTEGER;

-- Help center: ensure status column exists
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published';
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS helpful_yes INTEGER DEFAULT 0;
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS helpful_no INTEGER DEFAULT 0;

-- Webchat widget tables (dùng bởi webchatWidgetDedupe)
-- web_widget_configs và webchat_conversations đã được tạo ở phần trên (line 1188, 1213).
-- webchat_conversations đã có widget_key + ai_paused + ai_paused_at; chỉ thêm index.

CREATE INDEX IF NOT EXISTS idx_webchat_conv_widget_session
  ON webchat_conversations (widget_key, session_id);

-- Zalo restore tracking (zaloSettings test expects lastRestoreAttemptAt + restoreFailCount)
ALTER TABLE zalo_settings ADD COLUMN IF NOT EXISTS last_restore_attempt_at TIMESTAMPTZ;
ALTER TABLE zalo_settings ADD COLUMN IF NOT EXISTS restore_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zalo_settings ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Marketplace triggers/functions (mirrors 115/128) ─────────────────────
-- Bảng đã được tạo ở phần trên; chỉ thêm function/trigger để service có thể UPDATE.
CREATE OR REPLACE FUNCTION update_marketplace_listing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_marketplace_reviews_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketplace_listings_updated_at ON marketplace_listings;
CREATE TRIGGER trg_marketplace_listings_updated_at
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_listing_timestamp();

DROP TRIGGER IF EXISTS trg_marketplace_reviews_updated_at ON marketplace_reviews;
CREATE TRIGGER trg_marketplace_reviews_updated_at
  BEFORE UPDATE ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_reviews_timestamp();

-- ─── Campaign marketplace origin (mirrors 129) ────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS marketplace_purchase_id BIGINT
  REFERENCES marketplace_purchases(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS origin VARCHAR(30) DEFAULT 'self_created'
  CHECK (origin IN ('self_created', 'marketplace_purchased'));

-- Ensure wide enough for 'marketplace_purchased' (21 chars) — mirrors 131.
ALTER TABLE campaigns
  ALTER COLUMN origin TYPE VARCHAR(30);

UPDATE campaigns SET origin = 'self_created' WHERE origin IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_origin ON campaigns(origin);
CREATE INDEX IF NOT EXISTS idx_campaigns_marketplace_purchase
  ON campaigns(marketplace_purchase_id);

CREATE OR REPLACE FUNCTION set_campaign_origin_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.marketplace_purchase_id IS NOT NULL THEN
    NEW.origin = 'marketplace_purchased';
  ELSE
    NEW.origin = 'self_created';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_campaign_origin ON campaigns;
CREATE TRIGGER trg_set_campaign_origin
  BEFORE INSERT OR UPDATE OF marketplace_purchase_id ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION set_campaign_origin_trigger();

-- ─── Campaign shares (mirrors 130) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_shares (
  id              BIGSERIAL PRIMARY KEY,
  id_campaign     BIGINT       NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  id_owner        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_recipient    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  share_type      VARCHAR(20)  NOT NULL DEFAULT 'view'
    CHECK (share_type IN ('view', 'edit')),
  can_run         BOOLEAN      DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(id_campaign, id_recipient)
);

CREATE INDEX IF NOT EXISTS idx_campaign_shares_campaign
  ON campaign_shares(id_campaign);
CREATE INDEX IF NOT EXISTS idx_campaign_shares_recipient
  ON campaign_shares(id_recipient);
CREATE INDEX IF NOT EXISTS idx_campaign_shares_owner
  ON campaign_shares(id_owner);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_campaign_share_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE campaigns
      SET share_count = COALESCE(share_count, 0) + 1
      WHERE id = NEW.id_campaign;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE campaigns
      SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0)
      WHERE id = OLD.id_campaign;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_campaign_share_count ON campaign_shares;
CREATE TRIGGER trg_update_campaign_share_count
  AFTER INSERT OR DELETE ON campaign_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_share_count();

CREATE OR REPLACE FUNCTION update_campaign_shares_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_shares_updated_at ON campaign_shares;
CREATE TRIGGER trg_campaign_shares_updated_at
  BEFORE UPDATE ON campaign_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_shares_timestamp();

-- ─── Email settings ensure columns (mirrors 133) ──────────────────────────
-- Bảng email_settings đã có ở phần trên với platform_prefix/email_mode NOT NULL;
-- mirror migration 133 để chắc chắn.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS platform_prefix VARCHAR(50) DEFAULT 'no-reply';
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS email_mode TEXT DEFAULT 'platform';

UPDATE email_settings SET platform_prefix = 'no-reply' WHERE platform_prefix IS NULL;
UPDATE email_settings SET email_mode = 'platform' WHERE email_mode IS NULL;

ALTER TABLE email_settings ALTER COLUMN platform_prefix SET NOT NULL;
ALTER TABLE email_settings ALTER COLUMN email_mode SET NOT NULL;

-- ─── Zalo message sender snapshot (mirrors 135) ─────────────────────────
ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_id BIGINT;
ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
  ON zalo_messages (account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- ─── Zalo friends sync (mirrors 142) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS zalo_friends (
  id               BIGSERIAL PRIMARY KEY,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  friend_id        VARCHAR(100) NOT NULL,
  display_name     VARCHAR(255),
  phone            VARCHAR(32),
  avatar_url       TEXT,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zalo_friends_setting_friend_key UNIQUE (id_zalo_setting, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_zalo_friends_setting ON zalo_friends(id_zalo_setting);
CREATE INDEX IF NOT EXISTS idx_zalo_friends_search ON zalo_friends(id_zalo_setting, display_name);

-- ─── AI activity summaries cache (mirrors 146) ───────────────────────────
CREATE TABLE IF NOT EXISTS ai_activity_summaries (
  id BIGSERIAL PRIMARY KEY,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key VARCHAR(10) NOT NULL,
  last_message_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_ai_activity_user_day UNIQUE (id_user, day_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_activity_summaries_user_day
  ON ai_activity_summaries (id_user, day_key);

-- ─── Landing page versions (mirrors 147) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS landing_page_versions (
  id BIGSERIAL PRIMARY KEY,
  id_landing_page BIGINT NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  title VARCHAR(255),
  html_hash VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_page_created
  ON landing_page_versions (id_landing_page, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_user
  ON landing_page_versions (id_user);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_workspace_owner
  ON landing_page_versions (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_created_by
  ON landing_page_versions (created_by)
  WHERE created_by IS NOT NULL;

-- ─── roles / users.id_role ────────────────────────────────────────────────
-- Bảng này có trên production từ TRƯỚC khi có hệ thống migration, nên không
-- nằm trong migrations/ lẫn schema.sql. Thiếu nó thì findProfileBase()
-- (LEFT JOIN roles ON u.id_role = r.id) ném lỗi, controller rơi vào nhánh dự
-- phòng và trả hồ sơ KHÔNG có trường gói — trang Tổng quan gói hiện
-- "Tài khoản chưa được gán gói dịch vụ" dù tài khoản có gói hẳn hoi.
-- Để rỗng là đủ: đây là LEFT JOIN, chỉ cần bảng tồn tại.
CREATE TABLE IF NOT EXISTS roles (
  id         SERIAL PRIMARY KEY,
  role_code  VARCHAR(50) UNIQUE,
  role_name  VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_role INTEGER REFERENCES roles(id);

-- ─── Notifications & Email Logs (migration 083) ────────────────────────
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

CREATE TABLE IF NOT EXISTS notifications (
  id                  SERIAL PRIMARY KEY,
  type                notification_type NOT NULL DEFAULT 'announcement',
  title               VARCHAR(255) NOT NULL,
  title_en            VARCHAR(255),
  message             TEXT NOT NULL,
  message_en          TEXT,
  html_content        TEXT,
  html_content_en     TEXT,
  metadata            JSONB DEFAULT '{}',
  priority            notification_priority DEFAULT 'normal',
  target_roles        TEXT[] DEFAULT NULL,
  target_plans        TEXT[] DEFAULT NULL,
  target_statuses     TEXT[] DEFAULT NULL,
  target_user_ids     INTEGER[] DEFAULT NULL,
  target_emails       TEXT[] DEFAULT NULL,
  registered_before   TIMESTAMP,
  registered_after    TIMESTAMP,
  schedule_type       schedule_type DEFAULT 'now',
  scheduled_at        TIMESTAMP,
  recurrence_pattern  VARCHAR(20),
  recurrence_end_date TIMESTAMP,
  is_recurring        BOOLEAN DEFAULT false,
  recipient_count     INTEGER DEFAULT 0,
  sent_count          INTEGER DEFAULT 0,
  failed_count        INTEGER DEFAULT 0,
  delivered_count     INTEGER DEFAULT 0,
  opened_count        INTEGER DEFAULT 0,
  open_rate           DECIMAL(5,2) DEFAULT 0,
  status              notification_status DEFAULT 'draft',
  sent_at             TIMESTAMP,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type_status ON notifications(type, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);

CREATE TABLE IF NOT EXISTS notification_email_logs (
  id              SERIAL PRIMARY KEY,
  notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id),
  email           VARCHAR(255) NOT NULL,
  message_id      VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'pending',
  sent_at         TIMESTAMP,
  delivered_at    TIMESTAMP,
  opened_at       TIMESTAMP,
  bounced_at      TIMESTAMP,
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_logs_notification ON notification_email_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON notification_email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON notification_email_logs(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON notification_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON notification_email_logs(created_at);

-- ─── AI Chat Sessions & Messages (migration 029) ───────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user ON ai_chat_sessions(id_user, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id             BIGSERIAL PRIMARY KEY,
  session_id     BIGINT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content        TEXT NOT NULL DEFAULT '',
  type           VARCHAR(50),
  data           JSONB,
  missing_fields JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session ON ai_chat_messages(session_id, id ASC);

-- ─── Business Profiles & Chunks (migration 010) ────────────────────────
-- Production dùng pgvector (migration 010). Bootstrap test dùng JSONB để
-- chạy được trên postgres thuần (không cần extension pgvector).
CREATE TABLE IF NOT EXISTS business_profiles (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name    VARCHAR(255),
  industry        VARCHAR(100),
  products        TEXT,
  target_audience TEXT,
  tone            VARCHAR(50) DEFAULT 'professional',
  brand_color     VARCHAR(7),
  extra_context   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_business_profile_user UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles(user_id);

CREATE TABLE IF NOT EXISTS business_profile_chunks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  embedding   JSONB,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bpc_user ON business_profile_chunks(user_id);

-- ─── Zalo Groups (migration 062) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS zalo_groups (
  id               BIGSERIAL PRIMARY KEY,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  group_id         VARCHAR(100) NOT NULL,
  group_name       VARCHAR(255),
  member_count     INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_groups_setting ON zalo_groups(id_zalo_setting);

-- ─── Diagnostic Runs & Messages (migration 047) ────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id                     BIGSERIAL    PRIMARY KEY,
  channel                VARCHAR(30)  NOT NULL,
  account_id             BIGINT       REFERENCES zalo_settings(id) ON DELETE SET NULL,
  message_text           TEXT         NOT NULL,
  inter_message_delay_ms INT          NOT NULL DEFAULT 5000,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'running',
  total_count            INT          NOT NULL DEFAULT 0,
  sent_count             INT          NOT NULL DEFAULT 0,
  failed_count           INT          NOT NULL DEFAULT 0,
  created_by             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS diagnostic_messages (
  id            BIGSERIAL    PRIMARY KEY,
  run_id        BIGINT       NOT NULL REFERENCES diagnostic_runs(id) ON DELETE CASCADE,
  seq           INT          NOT NULL,
  recipient     VARCHAR(100) NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
  sent_at       TIMESTAMPTZ,
  delay_ms      INT,
  error_code    VARCHAR(100),
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_messages_run ON diagnostic_messages(run_id, seq);

