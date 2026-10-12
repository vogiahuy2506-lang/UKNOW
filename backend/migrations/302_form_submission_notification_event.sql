-- 302: su kien chuong 'form_submission_received' - "Co bai nop moi o bieu mau" (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c).
--
-- Khach nop bieu mau -> chuong bao CHU workspace (gop theo bieu mau / 10 phut bang dedupe_key, bam mo thang trang bai nop cua bieu mau).
-- Cung mot khoa trong config/notificationEventCatalog.js; thieu dong nay thi spec catalog do (moi khoa catalog phai co dong seed).
--
-- Mac dinh CHI CHUONG (quy tac 10/10): thu bao cua tung bieu mau (settings.notifyOwner - "Bao cho toi qua email") da co rieng va chay doc lap,
-- bat them email o day se bao hai lan. Super admin van bat duoc o tab "Cau hinh kenh".
-- Chi INSERT ... ON CONFLICT DO NOTHING: chay lai khong loi, khong ghi de dong super admin da chinh. KHONG DROP/ALTER gi.

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES ('form_submission_received', true, false, true)
ON CONFLICT (event_type) DO NOTHING;
