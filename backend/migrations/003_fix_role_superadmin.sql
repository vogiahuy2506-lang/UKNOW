-- Migration 003: Rename role 'superadmin' -> 'super_admin' for naming consistency
BEGIN;

ALTER TABLE users DROP CONSTRAINT users_role_check;

UPDATE users SET role = 'super_admin' WHERE role = 'superadmin';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'user_admin', 'employee'));

COMMIT;