-- Migration 090: Covering indexes cho COUNT queries của plan send-quota (userSendLimit.util.js).
-- campaigns(id_user) đã có idx_campaigns_user — không tạo lại.

CREATE INDEX IF NOT EXISTS idx_email_messages_quota_count
  ON email_messages (id_campaign, sent_at)
  WHERE status IN ('sent', 'delivered', 'bounced');

CREATE INDEX IF NOT EXISTS idx_zalo_messages_quota_count
  ON zalo_messages (id_campaign, sent_at)
  WHERE (tracking_metadata->>'status') = 'sent';

-- Inbox trả lời tay (marker chỉ do đường manual ghi)
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_quota_count
  ON zalo_personal_messages (id_user, created_at)
  WHERE role = 'agent' AND (metadata->>'source') = 'manual_inbox';
