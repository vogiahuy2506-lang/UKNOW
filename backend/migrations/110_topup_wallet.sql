-- 110: Ví mua thêm vĩnh viễn (consumable) + sổ tiêu
-- cycle_end IS NULL = ví không hết hạn theo chu kỳ.
-- Món cấu trúc (khi ship B) vẫn neo cycle_end.

CREATE TABLE IF NOT EXISTS topup_debits (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key    VARCHAR(50) NOT NULL,
  qty         INTEGER     NOT NULL CHECK (qty > 0),
  -- Khoá chống trừ trùng: mỗi tin/lượt AI chỉ được trừ đúng một lần.
  -- vd 'email_message:12345', 'zalo_message:678', 'ai_credit:<usage_log_id>'
  source_key  VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_debits_source_unique UNIQUE (item_key, source_key)
);

CREATE INDEX IF NOT EXISTS idx_topup_debits_user_item
  ON topup_debits (user_id, item_key);

-- Cho phép NULL = ví vĩnh viễn
ALTER TABLE topup_grants ALTER COLUMN cycle_end DROP NOT NULL;

-- Chuyển grant tiêu hao đang có sang ví (kể cả kỳ đã qua — có lợi cho khách)
UPDATE topup_grants
   SET cycle_end = NULL
 WHERE item_key IN ('zalo_messages', 'emails', 'ai_credits');

-- Món tiêu hao KHÔNG được có hạn — ghi sai thì lỗi tại chỗ ghi
ALTER TABLE topup_grants
  DROP CONSTRAINT IF EXISTS topup_grants_consumable_no_expiry;

ALTER TABLE topup_grants
  ADD CONSTRAINT topup_grants_consumable_no_expiry CHECK (
    item_key NOT IN ('zalo_messages', 'emails', 'ai_credits')
    OR cycle_end IS NULL
  );

COMMENT ON TABLE topup_debits IS 'Sổ tiêu ví mua thêm (consumable). Số dư = SUM(grants WHERE cycle_end IS NULL) − SUM(debits).';
COMMENT ON COLUMN topup_grants.cycle_end IS
  'NULL = ví vĩnh viễn (món tiêu hao). Có giá trị = neo chu kỳ (món cấu trúc).';
COMMENT ON TABLE topup_grants IS
  'Sổ nạp mua thêm. Consumable: cycle_end NULL. Structural: neo subscription_expires_at.';
