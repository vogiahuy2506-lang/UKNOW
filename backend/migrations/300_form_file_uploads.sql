-- 300: form_file_uploads - phien "tai tep tam" cua truong `file` trong bieu mau (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11 PR-4b, QD7).
--
-- Luong khach 3 buoc: (1) POST /api/public/forms/:key/uploads xin URL ky -> ghi MOT dong o day (status 'pending'), (2) trinh duyet PUT
-- THANG len kho (GCS) vao khoa tam uploads/<chu>/forms/<form>/tmp/<uploadId>.<duoi>, (3) nop bai kem uploadId -> backend xac nhan
-- (cung form + cung truong, chua dung, doi tuong ton tai, co THAT <= tran, chu ky dau tep khop duoi), chep sang
-- uploads/<chu>/forms/<form>/submissions/<submission>/... roi danh dau 'used'.
--
--   status 'pending' : da cap URL, chua nop. Het han sau 24 gio (expires_at) -> cron form_file_upload_cleanup xoa doi tuong tam + dong nay.
--   status 'used'    : da gan vao bai nop; dong nay chi con de cron don doi tuong tam con sot roi xoa.
--   declared_size    : co khach KHAI luc xin URL - chi dung de kiem han muc dung luong cua chu, KHONG tin cho ledger (ledger ghi co THAT).
--   max_bytes        : tran moi tep luc cap URL (GCS rang buoc bang x-goog-content-length-range).
--
-- Dung luong cua chu van tinh o storage_objects (category 'form_file', ghi luc nop bai); bang nay KHONG nam trong phep tinh dung luong.
-- Them 1 dong notification_event_settings cho su kien chuong 'form_file_quota_exceeded' (chu het dung luong -> khach van nop duoc, chu duoc bao).
-- Chi them bang + index + seed, KHONG DROP/ALTER gi.

CREATE TABLE IF NOT EXISTS form_file_uploads (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id            BIGINT       NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  workspace_owner_id BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_key          VARCHAR(64)  NOT NULL,
  object_key         TEXT         NOT NULL UNIQUE,
  file_name          VARCHAR(255) NOT NULL,
  file_ext           VARCHAR(10)  NOT NULL,
  content_type       VARCHAR(127) NOT NULL,
  declared_size      BIGINT       NOT NULL CHECK (declared_size > 0),
  max_bytes          BIGINT       NOT NULL CHECK (max_bytes > 0),
  status             VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used')),
  submission_id      BIGINT,
  expires_at         TIMESTAMPTZ  NOT NULL,
  used_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Cron don: dong 'pending' het han.
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_pending_expiry
  ON form_file_uploads (expires_at) WHERE status = 'pending';
-- Cron don: dong 'used' da cu.
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_used_at
  ON form_file_uploads (used_at) WHERE status = 'used';
-- Xoa bieu mau -> don doi tuong tam theo form; dem cho da cap cua chu khi kiem han muc.
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_form
  ON form_file_uploads (form_id);
CREATE INDEX IF NOT EXISTS idx_form_file_uploads_owner_pending
  ON form_file_uploads (workspace_owner_id) WHERE status = 'pending';

-- Su kien chuong 'form_file_quota_exceeded' (config/notificationEventCatalog.js). Mac dinh CHI CHUONG (quy tac 10/10): email do super admin bat.
INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES ('form_file_quota_exceeded', true, false, true)
ON CONFLICT (event_type) DO NOTHING;
