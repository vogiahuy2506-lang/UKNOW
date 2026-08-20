-- Migration 160: Allow chatbot_zalo_account_settings to be keyed by (user, zalo, chatbot)
-- Purpose: A Zalo personal account can be linked to different chatbots independently.
--          Previously UNIQUE (id_user, id_zalo_setting) forced a single row per (user, zalo),
--          so toggling chatbot for one chatbot silently overwrote/affected the others sharing
--          the same Zalo account.

-- Step 1: Deduplicate existing rows. With the old UNIQUE there can only be ONE row per
-- (id_user, id_zalo_setting), so there is nothing to dedupe on the new tuple yet. But
-- before adding the new constraint we need to handle the edge case where the constraint
-- was already violated (shouldn't happen because of the old UNIQUE, but defensive).
DO $$
BEGIN
  -- No-op: the old UNIQUE (id_user, id_zalo_setting) already prevents multiple rows.
  -- However, when we drop it and add the new UNIQUE that includes id_chatbot, NULL
  -- id_chatbot values are treated as distinct in PostgreSQL, so we still get unique rows.
  NULL;
END $$;

-- Step 2: Drop the old UNIQUE constraint.
ALTER TABLE chatbot_zalo_account_settings
  DROP CONSTRAINT IF EXISTS uq_chatbot_zalo_account;

-- Step 3: Add the new UNIQUE constraint that includes id_chatbot.
-- Note: PostgreSQL treats NULLs as distinct in UNIQUE by default, so rows with NULL
-- id_chatbot can coexist (which preserves backwards compat for accounts not yet
-- linked to a specific chatbot).
ALTER TABLE chatbot_zalo_account_settings
  ADD CONSTRAINT uq_chatbot_zalo_account_chatbot
  UNIQUE (id_user, id_zalo_setting, id_chatbot);

COMMENT ON CONSTRAINT uq_chatbot_zalo_account_chatbot ON chatbot_zalo_account_settings
  IS 'Each (user, Zalo account, chatbot) tuple is independent — toggling one chatbot does NOT affect others sharing the same Zalo account.';