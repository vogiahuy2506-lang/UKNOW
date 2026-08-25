-- Migration 172: Thêm cờ is_preview cho email_messages và zalo_messages để ghi nhận lượt gửi thử (preview/builder) mà không làm sai lệch số liệu chiến dịch

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE zalo_messages
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_email_messages_campaign_preview
  ON email_messages (id_campaign)
  WHERE NOT is_preview;

CREATE INDEX IF NOT EXISTS idx_zalo_messages_campaign_preview
  ON zalo_messages (id_campaign)
  WHERE NOT is_preview;
