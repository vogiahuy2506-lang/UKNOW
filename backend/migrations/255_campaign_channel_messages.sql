-- PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-2 — bảng log tin nhắn dùng chung cho các kênh gửi
-- "adapter" (Telegram/WhatsApp từ PR-6+), tách khỏi zalo_messages/email_messages vốn chỉ dành
-- cho 4 kênh legacy hiện có (đừng tái dùng 2 bảng đó cho kênh mới — mọi phép đếm quota Zalo
-- không lọc theo channel, ghi lẫn vào là ăn nhầm quota khách, xem mục 5 Bẫy của plan).
--
-- SỬA PR-2 (27/09 tối, trước khi giao) — FK id_run/id_node theo đúng khuôn production: đo
-- pg_constraint 27/09 thấy email_messages và zalo_messages đều FK ON DELETE SET NULL cho cả
-- id_campaign, id_run, id_node, workspace_owner_id, actor_user_id — bảng mới theo đúng khuôn đó
-- (bản nháp trước chỉ FK id_campaign, để id_run/id_node trơn là sai khuôn). id_node SET NULL bắt
-- buộc: lưu flow = DELETE + INSERT lại campaign_nodes nên dòng tin cũ phải về id_node NULL như 2
-- bảng cũ (bẫy id_node, vụ 396).
--
-- Mọi cột giờ là TIMESTAMPTZ ngay từ đầu (bài học 291k dòng email_messages.sent_at lưu UTC lệch
-- 7h so với created_at — PLAN_EMAIL_SENT_AT_GIO_UTC) — repo PR-2 dùng now()/$n::timestamptz,
-- KHÔNG LOCALTIMESTAMP/AT TIME ZONE như 2 bảng cũ phải vá thêm vì cột không phải timestamptz.
--
-- recipient_key: repo (campaignChannelMessage.repository.js) LUÔN ghi dạng lower(btrim(...))
-- trước khi insert — nên index dedupe dưới đây là cột thường, KHÔNG cần index biểu thức
-- lower(btrim(recipient_key)) như migration 254 phải làm cho email_messages.recipient_email
-- (cột đó KHÔNG được chuẩn hoá trước khi ghi ở nhiều điểm insert khác nhau).

CREATE TABLE campaign_channel_messages (
  id                    BIGSERIAL     PRIMARY KEY,
  id_campaign           BIGINT        REFERENCES campaigns(id) ON DELETE SET NULL,
  id_run                BIGINT        REFERENCES campaign_runs(id) ON DELETE SET NULL,
  id_node               BIGINT        REFERENCES campaign_nodes(id) ON DELETE SET NULL,
  channel               VARCHAR(30)   NOT NULL,
  account_key           TEXT,
  recipient_key         TEXT          NOT NULL,
  recipient_display     TEXT,
  step_index            INT           NOT NULL DEFAULT 1,
  status                VARCHAR(20)   NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed')),
  error_category        VARCHAR(40),
  error_message         TEXT,
  provider_message_id   TEXT,
  is_preview            BOOLEAN       NOT NULL DEFAULT FALSE,
  quota_reservation_id  BIGINT,
  workspace_owner_id    BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id         BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_channel_messages_run_channel
  ON campaign_channel_messages (id_run, channel);

-- Khuôn migration 254 (dedupe cross-run) — khoá LUÔN có id_node, chỉ tính dòng đã gửi thành công.
CREATE INDEX idx_campaign_channel_messages_node_dedupe
  ON campaign_channel_messages (id_node, channel, recipient_key, step_index, created_at)
  WHERE status = 'sent';

CREATE INDEX idx_campaign_channel_messages_workspace_owner
  ON campaign_channel_messages (workspace_owner_id, channel, sent_at);

CREATE INDEX idx_campaign_channel_messages_account
  ON campaign_channel_messages (account_key, channel, sent_at);
