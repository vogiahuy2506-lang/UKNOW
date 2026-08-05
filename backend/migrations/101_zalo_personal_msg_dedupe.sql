-- Migration 101: dedupe zalo_personal_messages by (id_zalo_setting, external_id)
-- Required before background group-history sync (cron would otherwise multiply rows).

BEGIN;

-- 1a. Drop existing duplicates (keep lowest id) before creating unique index
DELETE FROM zalo_personal_messages a
USING zalo_personal_messages b
WHERE a.external_id IS NOT NULL
  AND a.id_zalo_setting = b.id_zalo_setting
  AND a.external_id = b.external_id
  AND a.id > b.id;

-- 1b. Partial unique index — bot rows may still have external_id NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_zalo_personal_msg_external
  ON zalo_personal_messages (id_zalo_setting, external_id)
  WHERE external_id IS NOT NULL;

COMMIT;
