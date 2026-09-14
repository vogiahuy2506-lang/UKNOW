-- Migration 216: Forms and Form Submissions
--
-- Forms core infrastructure for PR-1..PR-5.
-- Includes booking, payment, theme, and admin disabled columns upfront
-- to avoid unsafe ALTER TABLE constraints later.

CREATE TABLE IF NOT EXISTS forms (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_owner_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  public_key          VARCHAR(32) NOT NULL UNIQUE,
  title               VARCHAR(200) NOT NULL,
  description         TEXT,
  fields              JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  booking_config      JSONB,
  payment_config      JSONB,
  theme               JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  admin_disabled_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forms_fields_array_check CHECK (jsonb_typeof(fields) = 'array')
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id                   BIGSERIAL PRIMARY KEY,
  form_id              BIGINT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  workspace_owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token         VARCHAR(64) NOT NULL UNIQUE,
  answers              JSONB NOT NULL DEFAULT '{}'::jsonb,
  respondent_name      VARCHAR(255),
  respondent_email     VARCHAR(255),
  respondent_phone     VARCHAR(50),
  marketing_consent    BOOLEAN,
  status               VARCHAR(20) NOT NULL DEFAULT 'submitted',
  appointment_at       TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at     TIMESTAMPTZ,
  payment_code         VARCHAR(16),
  payment_amount       BIGINT,
  payment_snapshot     JSONB,
  hold_expires_at      TIMESTAMPTZ,
  paid_confirmed_at    TIMESTAMPTZ,
  paid_confirmed_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitter_ip_hash    VARCHAR(64),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_submissions_status_check
    CHECK (status IN ('submitted', 'pending_payment', 'confirmed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_forms_owner ON forms (workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_forms_public_key ON forms (public_key);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_created ON form_submissions (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_owner ON form_submissions (workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_slot ON form_submissions (form_id, appointment_at) WHERE appointment_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_submissions_payment_code ON form_submissions (workspace_owner_id, payment_code) WHERE payment_code IS NOT NULL;
