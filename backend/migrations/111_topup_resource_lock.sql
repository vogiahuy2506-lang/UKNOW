-- Đánh dấu tài nguyên bị khoá do hết hạn slot mua thêm.
-- Có dòng = đang khoá. Xoá dòng = mở khoá. KHÔNG xoá dữ liệu của khách.
CREATE TABLE IF NOT EXISTS topup_locked_resources (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'zalo_accounts' | 'email_accounts' | 'landing_pages' | 'chatbots' | 'employees'
  resource_key  VARCHAR(50) NOT NULL,
  -- id trong bảng tương ứng (zalo_settings.id, landing_pages.id, ...)
  resource_id   BIGINT      NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_locked_unique UNIQUE (resource_key, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_topup_locked_user
  ON topup_locked_resources (user_id, resource_key);

COMMENT ON TABLE topup_locked_resources IS
  'Tài nguyên bị khoá do hết hạn slot mua thêm. Dữ liệu gốc giữ nguyên, chỉ chặn dùng.';

-- Cột đếm nhắc riêng cho grant cấu trúc (không dùng chung subscription_reminder_count)
ALTER TABLE topup_grants
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
