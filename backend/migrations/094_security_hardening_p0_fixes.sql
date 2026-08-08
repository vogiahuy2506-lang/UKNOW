-- Migration: 094_security_hardening_p0_fixes
-- Description: P0 security fixes before go-live
-- - Add must_change_password column to users
-- - Reset failed_login_attempts and locked_until for any locked accounts (cleanup)
-- Note: requireActivePlan middleware handles blocking users without active plan
-- Note: max_* limits are on plans table, not users table

BEGIN;

-- 1. Add must_change_password column for password reset enforcement
ALTER TABLE users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Cleanup: unlock any accounts currently locked due to brute-force protection being disabled
-- Run this BEFORE marking employees for password change to avoid lockout loops
UPDATE users
SET
  failed_login_attempts = 0,
  locked_until = NULL
WHERE failed_login_attempts > 0
   OR locked_until IS NOT NULL;

-- 3. Mark pending employees as needing password change (security measure)
-- since they all use the old hardcoded default password
UPDATE users
SET must_change_password = TRUE
WHERE role = 'employee'
  AND status = 'pending_activation';

COMMENT ON COLUMN users.must_change_password IS
  'When TRUE, user must change password before accessing any route except /auth/*';

COMMIT;
