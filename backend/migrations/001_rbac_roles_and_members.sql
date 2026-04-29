-- Migration 001: RBAC - Roles and user_members table
-- Description: Add role column to users, create user_members table for
--              owner-employee relationships, add max_employees to plans,
--              and link orders to user_id.

BEGIN;

-- 1. Add role column to users
ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user_admin'
    CHECK (role IN ('superadmin', 'user_admin', 'employee'));

-- Mark existing admin@uknow.com as superadmin
UPDATE users SET role = 'superadmin' WHERE email = 'admin@uknow.com';

CREATE INDEX idx_users_role ON users(role);

-- 2. Create user_members table (owner -> employee relationship + permissions)
CREATE TABLE user_members (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{
    "email_settings":   false,
    "email_templates":  false,
    "zalo_settings":    false,
    "zalo_templates":   false,
    "courses":          false,
    "landing_pages":    false,
    "campaigns_view":   true,
    "campaigns_create": false,
    "campaigns_run":    false,
    "customers":        false,
    "leads":            false
  }',
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_owner_employee UNIQUE (owner_id, employee_id),
  CONSTRAINT chk_no_self_member CHECK (owner_id <> employee_id)
);

CREATE INDEX idx_user_members_owner    ON user_members(owner_id);
CREATE INDEX idx_user_members_employee ON user_members(employee_id);

-- 3. Add max_employees to plans (dedicated column, easier to query than JSONB)
ALTER TABLE plans
  ADD COLUMN max_employees INTEGER NOT NULL DEFAULT 0;

UPDATE plans SET max_employees = 2  WHERE code = 'basic';
UPDATE plans SET max_employees = 5  WHERE code = 'pro';
UPDATE plans SET max_employees = -1 WHERE code = 'custom'; -- -1 = unlimited

-- 4. Link orders to user_id (currently only stores user_email)
ALTER TABLE orders
  ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Backfill user_id from existing user_email where possible
UPDATE orders o
  SET user_id = u.id
  FROM users u
  WHERE o.user_email = u.email
    AND o.user_id IS NULL;

CREATE INDEX idx_orders_user_id ON orders(user_id);

COMMIT;
