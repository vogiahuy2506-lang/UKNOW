-- Migration 281: dem luot khach hoi chatbot ve tung san pham (PLAN_PHEU_NGUOI_GIA_SO_HOI_CHATBOT PR-D).
-- Job quet dinh ky doc tin role='visitor' (web/channel/zalo_personal), khop ten/ma san pham, ghi vao day.
-- Con tro rieng (khong dung chung chatbot_contact_scan_cursors) de hai job tien do doc lap.
CREATE TABLE IF NOT EXISTS product_chat_mentions (
  id                 BIGSERIAL PRIMARY KEY,
  workspace_owner_id BIGINT      NOT NULL,
  product_id         INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source             VARCHAR(20) NOT NULL,   -- 'web' | 'channel' | 'zalo_personal'
  message_id         BIGINT      NOT NULL,
  conversation_key   TEXT        NOT NULL,   -- '<source>:<id_conversation>'
  created_at         TIMESTAMPTZ NOT NULL,   -- gio cua tin nhan, khong phai gio quet
  CONSTRAINT uq_product_chat_mention UNIQUE (source, message_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_chat_mentions_ws_product_time
  ON product_chat_mentions (workspace_owner_id, product_id, created_at);

CREATE TABLE IF NOT EXISTS product_mention_scan_cursors (
  source           VARCHAR(20) PRIMARY KEY,
  last_message_id  BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
