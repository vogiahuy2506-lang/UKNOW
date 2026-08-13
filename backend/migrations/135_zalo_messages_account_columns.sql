-- Migration 135: zalo_messages.account_id / account_name
-- Campaign tracking INSERT (zaloMessage.repository) đã ghi các cột này từ lâu
-- nhưng chưa có migration/bootstrap. Delivery monitor nhóm silent-drop theo account_id.

BEGIN;

ALTER TABLE zalo_messages
  ADD COLUMN IF NOT EXISTS account_id BIGINT;

ALTER TABLE zalo_messages
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
  ON zalo_messages (account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

COMMENT ON COLUMN zalo_messages.account_id IS
  'Sending Zalo account id (zalo_settings.id snapshot). Used by delivery-monitor silent-drop alerts.';
COMMENT ON COLUMN zalo_messages.account_name IS
  'Display name snapshot of the sending Zalo account. Not a customer identifier.';

COMMIT;
