-- 294: dua 5 loai email cu vao chuong thong bao - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 muc 10 (PR-6).
--
-- 6 khoa moi trong config/notificationEventCatalog.js: campaign_quota_exhausted, chatbot_contact_left, channel_disconnected,
-- plan_expiring, plan_expired, ai_unavailable. Mac dinh CHI CHUONG (user chot 10/10): in_app_enabled = true, email_enabled = false.
-- LUU Y van hanh: truoc PR-6 nam loai nay luon gui email; sau migration nay 4 khoa (quota, contact, channel, ai) chi con gui email khi
-- super admin bat o tab "Cau hinh kenh" (PUT /api/admin/notification-events/:eventType).
-- NGOAI LE (quyet dinh 10/10): plan_expiring / plan_expired seed email_enabled = true (khach khong dang nhap thi khong thay chuong,
-- mat nhac gia han la mat doanh thu); van khong cho nguoi dung tat email (user_can_disable_email = false); admin tat duoc o tab tren.
-- INSERT ... ON CONFLICT DO NOTHING: khong ghi de dong admin da chinh. Khong doi cot nen khong dong den productionSchemaInventory.json.

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES
  ('campaign_quota_exhausted', true, false, true),
  ('chatbot_contact_left',     true, false, true),
  ('channel_disconnected',     true, false, true),
  ('plan_expiring',            true, true,  false),
  ('plan_expired',             true, true,  false),
  ('ai_unavailable',           true, false, true)
ON CONFLICT (event_type) DO NOTHING;
