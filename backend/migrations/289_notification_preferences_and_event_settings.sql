-- 289: tuy chon thong bao cua nguoi dung + cau hinh mac dinh theo su kien - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-1.
--
-- Hai bang:
--   * notification_preferences    : MOT DONG = nguoi dung TAT (hoac bat lai) EMAIL cho MOT loai su kien. Khong co dong = theo mac dinh.
--                                   Chuong (in-app) khong co tuy chon nay: chuong luon bat o phia nguoi dung.
--   * notification_event_settings : super admin cau hinh MOT LAN cho moi su kien (khoa trong config/notificationEventCatalog.js):
--                                   in_app_enabled / email_enabled la cong tat he thong; user_can_disable_email = nguoi dung co duoc tat email
--                                   loai nay khong (false cho loai bao mat / thanh toan / nhan-vien-cho-duyet).
-- Thieu dong (khoa su kien moi them sau nay) -> dispatcher dung mac dinh trong catalog, nen khong bat buoc seed lai moi lan them su kien.
-- Seed duoi day PHAI khop cot "mac dinh" trong catalog (co spec ghim tung phan tu).
-- Chi CREATE + INSERT, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    VARCHAR(48)  NOT NULL,
  email_enabled BOOLEAN      NOT NULL,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_type)
);

CREATE TABLE IF NOT EXISTS notification_event_settings (
  event_type             VARCHAR(48)  PRIMARY KEY,
  in_app_enabled         BOOLEAN      NOT NULL DEFAULT true,
  email_enabled          BOOLEAN      NOT NULL DEFAULT true,
  user_can_disable_email BOOLEAN      NOT NULL DEFAULT true,
  updated_by             INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES
  ('admin_broadcast',             true, true,  true),
  ('campaign_run_completed',      true, false, true),
  ('campaign_run_failed',         true, true,  true),
  ('campaign_approval_required',  true, true,  false),
  ('campaign_schedule_skipped',   true, true,  true),
  ('support_ticket_replied',      true, true,  false),
  ('support_ticket_closed',       true, false, true),
  ('support_ticket_created',      true, true,  false),
  ('support_ticket_user_replied', true, true,  false)
ON CONFLICT (event_type) DO NOTHING;

COMMENT ON TABLE notification_preferences IS
  'Tuy chon email theo loai su kien cua tung nguoi dung (khong co dong = theo mac dinh he thong). Chuong khong co tuy chon, luon bat.';
COMMENT ON TABLE notification_event_settings IS
  'Cau hinh he thong theo su kien thong bao: bat/tat chuong, bat/tat email, nguoi dung co duoc tat email loai nay khong. Thieu dong -> mac dinh trong config/notificationEventCatalog.js.';
