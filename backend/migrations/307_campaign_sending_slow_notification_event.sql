-- 307: su kien chuong 'campaign_sending_slow' - "Chien dich gui cham bat thuong" (PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-3).
--
-- Chien dich Zalo ca nhan bi Zalo gioi han tra so >= 2 ngay VN lien tiep (hoac tai khoan bi cam nhan nguoi la) -> chuong bao CHU
-- chien dich, toi da 1 lan / 7 ngay / luot chay (co `sendingSlowNotifiedAt` trong run_metadata), bam mo thang trang chien dich.
-- Cung mot khoa trong config/notificationEventCatalog.js; thieu dong nay thi spec catalog do (moi khoa catalog phai co dong seed).
--
-- Mac dinh CHI CHUONG (quy tac 10/10); user tat duoc email loai nay. Super admin van bat duoc o tab "Cau hinh kenh".
-- Chi INSERT ... ON CONFLICT DO NOTHING: chay lai khong loi, khong ghi de dong super admin da chinh. KHONG DROP/ALTER gi.

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES ('campaign_sending_slow', true, false, true)
ON CONFLICT (event_type) DO NOTHING;
