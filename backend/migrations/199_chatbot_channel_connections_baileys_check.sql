-- allow-immutable-edit: 199_v1 sai cú pháp: `DROP CONSTRAINT` phải có `ALTER TABLE` đứng trước. Fix SQL tương đương với file 197 cùng pattern đã chạy thành công; idempotent.
-- allow-destructive-ddl: metadata-only SUPERSET CHECK (DROP+ADD ngay trong cùng transaction, không table rewrite, không data scan; giá trị mới bao trùm giá trị cũ nên existing rows vẫn valid).
ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check;

ALTER TABLE chatbot_channel_connections
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
  CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys'));
