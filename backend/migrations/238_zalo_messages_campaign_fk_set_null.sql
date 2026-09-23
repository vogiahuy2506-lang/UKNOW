-- allow-destructive-ddl: DROP CONSTRAINT để đổi ON DELETE CASCADE -> SET NULL.
-- Mục đích là GIỮ dữ liệu: hiện xoá 1 chiến dịch xoá trắng lịch sử gửi Zalo của nó.
ALTER TABLE zalo_messages DROP CONSTRAINT zalo_messages_campaign_fkey;
ALTER TABLE zalo_messages ALTER COLUMN id_campaign DROP NOT NULL;
ALTER TABLE zalo_messages ADD CONSTRAINT zalo_messages_campaign_fkey
  FOREIGN KEY (id_campaign) REFERENCES campaigns(id) ON DELETE SET NULL;
