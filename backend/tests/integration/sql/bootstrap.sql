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

-- ─── Schema migrations tracker ─────────────────────────────────────────
-- Tạo sẵn để migrationRunner không tự tạo + đánh dấu là đã chạy hết.
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  ran_at   TIMESTAMPTZ DEFAULT NOW()
);
