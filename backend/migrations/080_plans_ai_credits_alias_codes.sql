-- Extend AI credit seeds for legacy/alternate plan codes (see migration 064).
-- NULL = unlimited (admin can set per plan).

BEGIN;

UPDATE plans SET ai_credits_per_period = 50
WHERE LOWER(code) = 'trial' AND ai_credits_per_period IS NULL;

UPDATE plans SET ai_credits_per_period = 500
WHERE LOWER(code) = 'starter' AND ai_credits_per_period IS NULL;

UPDATE plans SET ai_credits_per_period = 3000
WHERE LOWER(code) = 'basic' AND ai_credits_per_period IS NULL;

UPDATE plans SET ai_credits_per_period = NULL
WHERE LOWER(code) IN ('pro', 'professional', 'team', 'business', 'enterprise');

COMMIT;
