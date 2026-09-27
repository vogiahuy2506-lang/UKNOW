-- PR-7b (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26), SỬA 27/09 lần 3 — cửa sổ chống trùng liên-run
-- khoá theo id_node (LUÔN LUÔN, không có ngoại lệ). Production ĐÃ CÓ idx_email_messages_campaign
-- (id_campaign), idx_email_messages_quota_count, idx_zalo_messages_campaign (id_campaign, id_run)
-- — CSDL 5433 thiếu 3 index này vì bootstrap.sql lệch production, KHÔNG phải production thiếu
-- index theo campaign. Vì khoá truy vấn mới đổi sang id_node (không phải id_campaign), 3 index
-- trên KHÔNG phủ được truy vấn này (id_node không phải cột đầu tiên/duy nhất của chúng) — vẫn cần
-- 2 index mới dưới đây, khớp chính xác WHERE của findExistingSentCampaignEmailCrossRun /
-- findExistingSentCampaignZaloMessageCrossRun (repositories/email/emailSettings.repository.js,
-- repositories/campaign/zaloMessage.repository.js).

CREATE INDEX IF NOT EXISTS idx_email_messages_node_recipient_step_created
  ON email_messages (id_node, lower(btrim(recipient_email)), email_step, created_at)
  WHERE status IN ('sent', 'delivered', 'opened', 'clicked');

-- Zalo khớp người nhận bằng OR 3 cột (recipient_value/uid/group_id) nên không đưa được vào index
-- b-tree một cột; lượng Zalo nhỏ nên chấp nhận Filter sau khi đã lọc theo id_node/channel/created_at.
CREATE INDEX IF NOT EXISTS idx_zalo_messages_node_channel_created
  ON zalo_messages (id_node, channel, created_at)
  WHERE (tracking_metadata->>'status') = 'sent';
