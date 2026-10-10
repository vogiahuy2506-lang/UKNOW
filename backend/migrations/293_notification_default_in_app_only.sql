-- 293: mac ddinh thong bao chi con CHUONG, khong email - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 (user chot 10/10/2026).
--
-- Vi sao: seed 289 bat email cho 7/9 su kien, nguoi dung bi ngap hop thu. Chot lai: mac dinh chi chuong (in-app);
-- super admin muon gui email cho loai nao thi bat tay o tab "Cau hinh kenh" (PUT /api/admin/notification-events/:eventType).
-- Giu nguyen in_app_enabled va user_can_disable_email.
--
-- 1) UPDATE moi dong dang co -> email_enabled = false. (Cung ghi de ca dong admin da tu chinh truoc do; chap nhan vi tinh
--    nang moi len, chua ai dung tab nay. Admin bat lai sau khi migration chay.)
-- 2) INSERT ... ON CONFLICT DO NOTHING 9 khoa phong DB thieu dong (gia tri khop catalog config/notificationEventCatalog.js).
-- Khong doi cot nen khong dong den productionSchemaInventory.json.

UPDATE notification_event_settings
   SET email_enabled = false,
       updated_at = NOW()
 WHERE email_enabled IS DISTINCT FROM false;

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES
  ('admin_broadcast',             true, false, true),
  ('campaign_run_completed',      true, false, true),
  ('campaign_run_failed',         true, false, true),
  ('campaign_approval_required',  true, false, false),
  ('campaign_schedule_skipped',   true, false, true),
  ('support_ticket_replied',      true, false, false),
  ('support_ticket_closed',       true, false, true),
  ('support_ticket_created',      true, false, false),
  ('support_ticket_user_replied', true, false, false)
ON CONFLICT (event_type) DO NOTHING;
