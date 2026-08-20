--- Migration 158: Backfill zalo_name from display_name for existing Zalo accounts
--- This ensures zalo_name is populated for accounts where it was not set during login

UPDATE zalo_settings
SET zalo_name = display_name
WHERE zalo_name IS NULL
  AND display_name IS NOT NULL
  AND display_name != '';
