-- 288: chuong thong bao trong ung dung - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-1.
--
-- Truoc day he thong chi bao cho khach qua email (campaignQuotaPauseNotify.util, bang tin admin...). Khong co cho de khach thay
-- "chien dich chay xong / chay hong / cho duyet" ngay trong app. Bang nay la hop thu cua chuong: MOT DONG = MOT THONG BAO cho MOT
-- nguoi dung. Dong gan theo id NGUOI NHAN that (nhan vien co dong users rieng), khong theo chu workspace.
--
--   * event_type  : khoa trong config/notificationEventCatalog.js (campaign_run_completed, campaign_run_failed...).
--   * dedupe_key  : chong ghi trung cung mot su kien (vd 'run:123:completed'). UNIQUE (user_id, dedupe_key) chi khi co khoa:
--                   dispatcher dung ON CONFLICT DO NOTHING nen goi lai cung su kien khong sinh dong thu hai va khong gui email lai.
--   * notification_id: neu thong bao sinh ra tu ban tin admin (bang notifications) - xoa ban tin thi SET NULL, khong mat dong cua khach.
--   * read_at     : NULL = chua doc. Cron user_notifications_cleanup xoa dong da doc > 90 ngay, chua doc > 180 ngay.
-- Chi CREATE, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS user_notifications (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type      VARCHAR(48)  NOT NULL,
  title           VARCHAR(255) NOT NULL,
  title_en        VARCHAR(255),
  message         TEXT         NOT NULL,
  message_en      TEXT,
  link            VARCHAR(500),
  severity        VARCHAR(16)  NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'error')),
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  notification_id INTEGER      REFERENCES notifications(id) ON DELETE SET NULL,
  dedupe_key      VARCHAR(120),
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_dedupe
  ON user_notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE user_notifications IS
  'Hop thu chuong thong bao trong app: mot dong = mot thong bao cho mot nguoi dung (id nguoi nhan that, nhan vien co dong rieng). dedupe_key chong trung (user_id, dedupe_key). Xem services/notification/notificationDispatch.service.js.';
